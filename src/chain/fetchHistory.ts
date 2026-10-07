import type {
  ConfirmedSignatureInfo,
  Finality,
  GetVersionedTransactionConfig,
  ParsedInstruction,
  ParsedTransactionWithMeta,
  PartiallyDecodedInstruction,
  PublicKey,
  SignaturesForAddressOptions,
} from "@solana/web3.js";
import type { MemoTx } from "../core/history";
import { MEMO_PREFIX, MEMO_PREFIX_V2, REGISTRY } from "../core/memo";
import { REGISTRY_KEY } from "./memoTx";

/** The two Connection methods history reading needs (injected so tests can mock them). */
export interface HistoryConnection {
  getSignaturesForAddress(
    address: PublicKey,
    options?: SignaturesForAddressOptions,
    commitment?: Finality,
  ): Promise<ConfirmedSignatureInfo[]>;
  getParsedTransactions(
    signatures: string[],
    config?: GetVersionedTransactionConfig,
  ): Promise<(ParsedTransactionWithMeta | null)[]>;
}

const RCPT_PREFIXES = [MEMO_PREFIX, MEMO_PREFIX_V2];
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** Max page size of getSignaturesForAddress. */
export const SIGNATURE_PAGE = 1000;
/** Signatures per getParsedTransactions call. */
export const PARSED_TX_BATCH = 50;

const MEMO_LOG = /^Program log: Memo \(len \d+\): "(.*)"$/;

/** Rust `{:?}` string body → string; null if it has escapes other than \" and \\ (never in rcpt memos). */
function unescapeDebug(s: string): string | null {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const next = s[++i];
    if (next !== '"' && next !== "\\") return null;
    out += next;
  }
  return out;
}

type AnyIx = ParsedInstruction | PartiallyDecodedInstruction;

const isParsedMemo = (ix: AnyIx): ix is ParsedInstruction =>
  "program" in ix && ix.program === "spl-memo" && typeof ix.parsed === "string";

/** Top-level, then inner (CPI) instructions. */
const allInstructions = (tx: ParsedTransactionWithMeta): AnyIx[] => [
  ...tx.transaction.message.instructions,
  ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
];

/**
 * All memo strings of a tx, in order: parsed spl-memo instructions (top-level, then inner/CPI);
 * if there are none, the `Program log: Memo (len N): "..."` log lines.
 */
export function extractMemos(tx: ParsedTransactionWithMeta): string[] {
  const parsed = allInstructions(tx).filter(isParsedMemo).map((ix) => ix.parsed as string);
  if (parsed.length > 0) return parsed;
  const memos: string[] = [];
  for (const line of tx.meta?.logMessages ?? []) {
    const m = MEMO_LOG.exec(line);
    const memo = m ? unescapeDebug(m[1]) : null;
    if (memo !== null) memos.push(memo);
  }
  return memos;
}

/** Distinct sources of parsed System transfers to REGISTRY (the v2 indexing tag), in order. */
export function registryTagSources(tx: ParsedTransactionWithMeta): string[] {
  const sources: string[] = [];
  for (const ix of allInstructions(tx)) {
    if (!("parsed" in ix) || ix.programId.toString() !== SYSTEM_PROGRAM) continue;
    const p = ix.parsed as { type?: unknown; info?: { source?: unknown; destination?: unknown } } | null;
    if (p?.type !== "transfer" || p.info?.destination !== REGISTRY || typeof p.info.source !== "string") continue;
    if (!sources.includes(p.info.source)) sources.push(p.info.source);
  }
  return sources;
}

const isSigner = (tx: ParsedTransactionWithMeta, wallet: string) =>
  tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.toString() === wallet);

/**
 * `rcpt:1:`/`rcpt:2:` memos of one tx as buildReceipts input; empty unless `wallet` signed the tx.
 * `tagged` = the tx carries a registry tag paid by `wallet`.
 */
export function toMemoTxs(signature: string, tx: ParsedTransactionWithMeta, wallet: string): MemoTx[] {
  if (!isSigner(tx, wallet)) return [];
  const tagged = registryTagSources(tx).includes(wallet);
  return extractMemos(tx)
    .filter((memo) => RCPT_PREFIXES.some((p) => memo.startsWith(p)))
    .map((memo) => ({
      signature,
      blockTime: tx.blockTime ?? null,
      signer: wallet,
      memo,
      failed: tx.meta?.err != null,
      tagged,
    }));
}

export interface FetchHistoryOptions {
  /** Signatures per page (≤ 1000). */
  pageSize?: number;
  /** Stop after this many signatures (newest first). Default: whole history. */
  maxSignatures?: number;
  /**
   * Skip txs whose signature info `memo` has no rcpt memo, and failed ones, before fetching.
   * Default true; turn off for RPCs that do not fill `memo` in getSignaturesForAddress.
   */
  prefilterByMemo?: boolean;
}

interface PageOptions {
  before?: string;
  until?: string;
  pageSize?: number;
  maxSignatures?: number;
}

/** Signatures of `address`, newest first, paged with `before` (from opts.before, down to opts.until). */
async function pageSignatures(conn: HistoryConnection, address: PublicKey, opts: PageOptions) {
  const pageSize = Math.min(opts.pageSize ?? SIGNATURE_PAGE, SIGNATURE_PAGE);
  const max = opts.maxSignatures ?? Infinity;
  const infos: ConfirmedSignatureInfo[] = [];
  let before = opts.before;
  while (infos.length < max) {
    const limit = Math.min(pageSize, max - infos.length);
    const page = await conn.getSignaturesForAddress(address, { before, until: opts.until, limit }, "confirmed");
    infos.push(...page);
    if (page.length < limit) break;
    before = page[page.length - 1].signature;
  }
  return infos;
}

/** getParsedTransactions in batches; `map` turns each found tx into MemoTxs. */
async function fetchParsed(
  conn: HistoryConnection,
  signatures: string[],
  map: (signature: string, tx: ParsedTransactionWithMeta) => MemoTx[],
): Promise<MemoTx[]> {
  const out: MemoTx[] = [];
  for (let i = 0; i < signatures.length; i += PARSED_TX_BATCH) {
    const batch = signatures.slice(i, i + PARSED_TX_BATCH);
    const txs = await conn.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    txs.forEach((tx, j) => {
      if (tx) out.push(...map(batch[j], tx));
    });
  }
  return out;
}

const hasMemo = (info: ConfirmedSignatureInfo, prefixes: string[]) =>
  info.err == null && typeof info.memo === "string" && prefixes.some((p) => info.memo!.includes(p));

/** Whole memo history of `wallet` (newest first) in the shape buildReceipts expects. */
export async function fetchMemoHistory(
  conn: HistoryConnection,
  wallet: PublicKey,
  opts: FetchHistoryOptions = {},
): Promise<MemoTx[]> {
  const prefilter = opts.prefilterByMemo ?? true;
  const infos = await pageSignatures(conn, wallet, opts);
  const wanted = infos.filter((i) => !prefilter || hasMemo(i, RCPT_PREFIXES)).map((i) => i.signature);
  const walletStr = wallet.toBase58();
  return fetchParsed(conn, wanted, (sig, tx) => toMemoTxs(sig, tx, walletStr));
}

export interface FetchRegistryOptions extends FetchHistoryOptions {
  /** Start strictly older than this signature (resume paging). */
  before?: string;
  /** Stop at this signature, exclusive (incremental sync from the last seen one). */
  until?: string;
}

/**
 * Every tagged Receipts tx of every wallet (newest first): pages getSignaturesForAddress(REGISTRY),
 * keeps `rcpt:2:` memos, and attributes each to the signer that paid the registry tag.
 */
export async function fetchRegistry(conn: HistoryConnection, opts: FetchRegistryOptions = {}): Promise<MemoTx[]> {
  const prefilter = opts.prefilterByMemo ?? true;
  const infos = await pageSignatures(conn, REGISTRY_KEY, opts);
  const wanted = infos.filter((i) => !prefilter || hasMemo(i, [MEMO_PREFIX_V2])).map((i) => i.signature);
  return fetchParsed(conn, wanted, (sig, tx) =>
    registryTagSources(tx)
      .flatMap((wallet) => toMemoTxs(sig, tx, wallet))
      .filter((m) => m.memo.startsWith(MEMO_PREFIX_V2)),
  );
}
