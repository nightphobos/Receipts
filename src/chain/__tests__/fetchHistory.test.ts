import { PublicKey, type ConfirmedSignatureInfo, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { canonicalJson, type Call } from "../../core/call";
import { commitHash } from "../../core/commit";
import { buildReceipts } from "../../core/history";
import { encodeCommitMemo, encodeRevealMemo } from "../../core/memo";
import {
  PARSED_TX_BATCH,
  SIGNATURE_PAGE,
  extractMemos,
  fetchMemoHistory,
  toMemoTxs,
  type HistoryConnection,
} from "../fetchHistory";
import recorded from "./fixtures/parsed-tx-memo-mainnet-2026-10-06.json";

// Recorded mainnet tx: fee payer 7pYQ… and memo signer 422A… both sign; memo is a coinflow JSON string.
const FEE_PAYER = "7pYQewCygX9wqMLzaNiJz8tkCSDpWDb8AidxBz5w1u4A";
const MEMO_SIGNER = "422AGE5PRh165soVeW93Uha2xmwtBvtpssaGDyynHpVb";
const RECORDED_SIG = "4CW27qTRS1hqeDPjcjnyS3wWq4bAwpkMMfM3K5sjbxAMRPikefRZ2h9nfqArDvwP1fk3wWUE5AWSo6c8yu1Crcu4";
const RECORDED_MEMO = '{"type":"coinflow","ref":"e4196a10-cecb-498c-8082-e4605fceb4c2"}';
const NOT_SIGNER = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

const DEADLINE = 1800086400;
const CALL: Call = { v: 1, asset: "SOL", dir: "above", target: 250.5, deadline: DEADLINE, created: 1800000000 };
const JSON_A = canonicalJson(CALL);
const SALT = "000102030405060708090a0b0c0d0e0f";
const COMMIT = encodeCommitMemo(commitHash(JSON_A, SALT), DEADLINE);
const REVEAL = encodeRevealMemo(JSON_A, SALT);

type Raw = typeof recorded;
const clone = (): Raw => JSON.parse(JSON.stringify(recorded));
const asParsed = (raw: unknown) => raw as ParsedTransactionWithMeta;

/** The recorded tx with its memo swapped for `memo` (parsed instruction and log line). */
function withMemo(memo: string, over: { blockTime?: number | null; err?: unknown } = {}): ParsedTransactionWithMeta {
  const raw = clone() as any;
  for (const ix of raw.transaction.message.instructions) if (ix.program === "spl-memo") ix.parsed = memo;
  raw.meta.logMessages = raw.meta.logMessages.map((l: string) =>
    l.startsWith("Program log: Memo (len ") ? `Program log: Memo (len ${memo.length}): "${memo}"` : l,
  );
  if ("blockTime" in over) raw.blockTime = over.blockTime;
  if ("err" in over) raw.meta.err = over.err;
  return asParsed(raw);
}

/** Same tx but the memo is visible only in the logs (no parsed spl-memo instruction). */
function logsOnly(tx: ParsedTransactionWithMeta): ParsedTransactionWithMeta {
  const raw = JSON.parse(JSON.stringify(tx));
  raw.transaction.message.instructions = raw.transaction.message.instructions.filter(
    (ix: { program?: string }) => ix.program !== "spl-memo",
  );
  return asParsed(raw);
}

describe("extractMemos", () => {
  it("reads the parsed spl-memo instruction of the recorded mainnet tx", () => {
    expect(extractMemos(asParsed(clone()))).toEqual([RECORDED_MEMO]);
  });

  it("falls back to the Memo log line, unescaping Rust debug quotes", () => {
    expect(extractMemos(logsOnly(asParsed(clone())))).toEqual([RECORDED_MEMO]);
    expect(extractMemos(logsOnly(withMemo(COMMIT)))).toEqual([COMMIT]);
  });

  it("reads memos from inner (CPI) parsed instructions", () => {
    const raw = clone() as any;
    raw.transaction.message.instructions = raw.transaction.message.instructions.filter(
      (ix: { program?: string }) => ix.program !== "spl-memo",
    );
    raw.meta.innerInstructions = [
      { index: 1, instructions: [{ parsed: COMMIT, program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", stackHeight: 2 }] },
    ];
    expect(extractMemos(asParsed(raw))).toEqual([COMMIT]);
  });

  it("returns every memo when a tx carries several", () => {
    const raw = withMemo(COMMIT) as any;
    raw.transaction.message.instructions.push({
      parsed: REVEAL,
      program: "spl-memo",
      programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
      stackHeight: 1,
    });
    expect(extractMemos(raw)).toEqual([COMMIT, REVEAL]);
  });

  it("returns nothing when there is no memo at all", () => {
    const raw = logsOnly(asParsed(clone())) as any;
    raw.meta.logMessages = [];
    expect(extractMemos(raw)).toEqual([]);
    raw.meta = null;
    expect(extractMemos(raw)).toEqual([]);
  });
});

describe("toMemoTxs", () => {
  it("ignores memos without the rcpt:1: prefix", () => {
    expect(toMemoTxs(RECORDED_SIG, asParsed(clone()), MEMO_SIGNER)).toEqual([]);
  });

  it("maps a rcpt memo to the buildReceipts input shape", () => {
    const tx = withMemo(COMMIT);
    expect(toMemoTxs(RECORDED_SIG, tx, MEMO_SIGNER)).toEqual([
      { signature: RECORDED_SIG, blockTime: recorded.blockTime, signer: MEMO_SIGNER, memo: COMMIT, failed: false },
    ]);
    // the fee payer is a signer too
    expect(toMemoTxs(RECORDED_SIG, tx, FEE_PAYER)[0].signer).toBe(FEE_PAYER);
  });

  it("accepts PublicKey objects in accountKeys (web3.js shape)", () => {
    const raw = withMemo(COMMIT) as any;
    raw.transaction.message.accountKeys = raw.transaction.message.accountKeys.map((k: any) => ({
      ...k,
      pubkey: new PublicKey(k.pubkey),
    }));
    expect(toMemoTxs(RECORDED_SIG, raw, MEMO_SIGNER)).toHaveLength(1);
  });

  it("drops txs not signed by the wallet", () => {
    expect(toMemoTxs(RECORDED_SIG, withMemo(COMMIT), NOT_SIGNER)).toEqual([]);
  });

  it("marks failed txs and keeps null blockTime (buildReceipts drops both)", () => {
    const [failed] = toMemoTxs("s", withMemo(COMMIT, { err: { InstructionError: [0, { Custom: 1 }] } }), MEMO_SIGNER);
    expect(failed.failed).toBe(true);
    const [noTime] = toMemoTxs("s", withMemo(COMMIT, { blockTime: null }), MEMO_SIGNER);
    expect(noTime.blockTime).toBeNull();
  });
});

/** In-memory Connection: `txs` keyed by signature, newest first. */
function mockConnection(entries: { sig: string; tx: ParsedTransactionWithMeta | null; memo?: string | null; err?: unknown }[]) {
  const sigCalls: { address: string; before?: string; limit?: number }[] = [];
  const txCalls: string[][] = [];
  const conn: HistoryConnection = {
    async getSignaturesForAddress(address, options) {
      sigCalls.push({ address: address.toBase58(), before: options?.before, limit: options?.limit });
      const limit = options?.limit ?? 1000;
      const start = options?.before ? entries.findIndex((e) => e.sig === options.before) + 1 : 0;
      return entries.slice(start, start + limit).map(
        (e) =>
          ({
            signature: e.sig,
            slot: 1,
            err: e.err ?? null,
            memo: e.memo === undefined ? `[${e.sig.length}] ${COMMIT}` : e.memo,
            blockTime: 1,
          }) as ConfirmedSignatureInfo,
      );
    },
    async getParsedTransactions(sigs, config) {
      expect(config?.maxSupportedTransactionVersion).toBe(0);
      txCalls.push(sigs);
      return sigs.map((s) => entries.find((e) => e.sig === s)?.tx ?? null);
    },
  };
  return { conn, sigCalls, txCalls };
}

describe("fetchMemoHistory", () => {
  const wallet = new PublicKey(MEMO_SIGNER);

  it("fetches signatures, parses txs and returns rcpt memos that buildReceipts accepts", async () => {
    const commitTx = withMemo(COMMIT, { blockTime: CALL.created + 10 });
    const revealTx = withMemo(REVEAL, { blockTime: DEADLINE + 60 });
    const { conn, sigCalls } = mockConnection([
      { sig: "reveal", tx: revealTx, memo: `[${REVEAL.length}] ${REVEAL}` },
      { sig: "other", tx: asParsed(clone()), memo: `[64] ${RECORDED_MEMO}` },
      { sig: "commit", tx: commitTx },
    ]);
    const txs = await fetchMemoHistory(conn, wallet);
    expect(sigCalls).toEqual([{ address: MEMO_SIGNER, before: undefined, limit: SIGNATURE_PAGE }]);
    expect(txs.map((t) => [t.signature, t.memo])).toEqual([
      ["reveal", REVEAL],
      ["commit", COMMIT],
    ]);
    const [receipt] = buildReceipts(txs, MEMO_SIGNER);
    expect(receipt.reveal?.call).toEqual(CALL);
    expect(receipt.commit.signature).toBe("commit");
  });

  it("skips fetching txs whose signature memo has no rcpt memo or that failed", async () => {
    const { conn, txCalls } = mockConnection([
      { sig: "plain", tx: withMemo(COMMIT), memo: null },
      { sig: "foreign", tx: withMemo(COMMIT), memo: "[3] pad" },
      { sig: "failed", tx: withMemo(COMMIT), err: { InstructionError: [0, { Custom: 1 }] } },
      { sig: "mine", tx: withMemo(COMMIT) },
    ]);
    const txs = await fetchMemoHistory(conn, wallet);
    expect(txCalls).toEqual([["mine"]]);
    expect(txs.map((t) => t.signature)).toEqual(["mine"]);
  });

  it("can fetch every tx when the RPC does not fill signature memos", async () => {
    const { conn } = mockConnection([{ sig: "plain", tx: withMemo(COMMIT), memo: null }]);
    const txs = await fetchMemoHistory(conn, wallet, { prefilterByMemo: false });
    expect(txs.map((t) => t.signature)).toEqual(["plain"]);
  });

  it("pages signatures with `before` and batches getParsedTransactions", async () => {
    const entries = Array.from({ length: 2 * SIGNATURE_PAGE + 3 }, (_, i) => ({ sig: `s${i}`, tx: withMemo(COMMIT) }));
    const { conn, sigCalls, txCalls } = mockConnection(entries);
    const txs = await fetchMemoHistory(conn, wallet);
    expect(sigCalls.map((c) => c.before)).toEqual([undefined, `s${SIGNATURE_PAGE - 1}`, `s${2 * SIGNATURE_PAGE - 1}`]);
    expect(txs).toHaveLength(entries.length);
    expect(txCalls.every((b) => b.length <= PARSED_TX_BATCH)).toBe(true);
    expect(txCalls.flat()).toEqual(entries.map((e) => e.sig));
  });

  it("stops at maxSignatures", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({ sig: `s${i}`, tx: withMemo(COMMIT) }));
    const { conn, sigCalls } = mockConnection(entries);
    const txs = await fetchMemoHistory(conn, wallet, { pageSize: 4, maxSignatures: 6 });
    expect(sigCalls.map((c) => c.limit)).toEqual([4, 2]);
    expect(txs.map((t) => t.signature)).toEqual(["s0", "s1", "s2", "s3", "s4", "s5"]);
  });

  it("skips txs the RPC no longer returns (null)", async () => {
    const { conn } = mockConnection([
      { sig: "gone", tx: null },
      { sig: "mine", tx: withMemo(COMMIT) },
    ]);
    expect((await fetchMemoHistory(conn, wallet)).map((t) => t.signature)).toEqual(["mine"]);
  });
});
