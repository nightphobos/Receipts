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
import { MEMO_PREFIX } from "../core/memo";

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

const isParsedMemo = (ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction =>
  "program" in ix && ix.program === "spl-memo" && typeof ix.parsed === "string";

/**
 * All memo strings of a tx, in order: parsed spl-memo instructions (top-level, then inner/CPI);
 * if there are none, the `Program log: Memo (len N): "..."` log lines.
 */
export function extractMemos(tx: ParsedTransactionWithMeta): string[] {
  const ixs = [
    ...tx.transaction.message.instructions,
    ...(tx.meta?.innerInstructions ?? []).flatMap((inner) => inner.instructions),
  ];
  const parsed = ixs.filter(isParsedMemo).map((ix) => ix.parsed as string);
  if (parsed.length > 0) return parsed;
  const memos: string[] = [];
  for (const line of tx.meta?.logMessages ?? []) {
    const m = MEMO_LOG.exec(line);
    const memo = m ? unescapeDebug(m[1]) : null;
    if (memo !== null) memos.push(memo);
  }
  return memos;
}

/** `rcpt:1:` memos of one tx as buildReceipts input; empty unless `wallet` signed the tx. */
export function toMemoTxs(signature: string, tx: ParsedTransactionWithMeta, wallet: string): MemoTx[] {
  const signed = tx.transaction.message.accountKeys.some((k) => k.signer && k.pubkey.toString() === wallet);
  if (!signed) return [];
  return extractMemos(tx)
    .filter((memo) => memo.startsWith(MEMO_PREFIX))
    .map((memo) => ({
      signature,
      blockTime: tx.blockTime ?? null,
      signer: wallet,
      memo,
      failed: tx.meta?.err != null,
    }));
}

export interface FetchHistoryOptions {
  /** Signatures per page (≤ 1000). */
  pageSize?: number;
  /** Stop after this many signatures (newest first). Default: whole history. */
  maxSignatures?: number;
  /**
   * Skip txs whose signature info `memo` has no `rcpt:1:` memo, and failed ones, before fetching.
   * Default true; turn off for RPCs that do not fill `memo` in getSignaturesForAddress.
   */
  prefilterByMemo?: boolean;
}

/** Whole memo history of `wallet` (newest first) in the shape buildReceipts expects. */
export async function fetchMemoHistory(
  conn: HistoryConnection,
  wallet: PublicKey,
  opts: FetchHistoryOptions = {},
): Promise<MemoTx[]> {
  const pageSize = Math.min(opts.pageSize ?? SIGNATURE_PAGE, SIGNATURE_PAGE);
  const max = opts.maxSignatures ?? Infinity;
  const prefilter = opts.prefilterByMemo ?? true;

  const infos: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  while (infos.length < max) {
    const limit = Math.min(pageSize, max - infos.length);
    const page = await conn.getSignaturesForAddress(wallet, { before, limit }, "confirmed");
    infos.push(...page);
    if (page.length < limit) break;
    before = page[page.length - 1].signature;
  }

  const wanted = infos
    .filter((i) => !prefilter || (i.err == null && typeof i.memo === "string" && i.memo.includes(MEMO_PREFIX)))
    .map((i) => i.signature);

  const walletStr = wallet.toBase58();
  const out: MemoTx[] = [];
  for (let i = 0; i < wanted.length; i += PARSED_TX_BATCH) {
    const batch = wanted.slice(i, i + PARSED_TX_BATCH);
    const txs = await conn.getParsedTransactions(batch, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    txs.forEach((tx, j) => {
      if (tx) out.push(...toMemoTxs(batch[j], tx, walletStr));
    });
  }
  return out;
}
