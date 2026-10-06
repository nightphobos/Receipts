import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_PRIORITY_MICRO_LAMPORTS,
  MEMO_PROGRAM_ID,
  buildMemoTransaction,
  memoInstruction,
  priorityFeeInstruction,
} from "../memoTx";

const signer = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const blockhash = "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k";
const memo = "rcpt:1:c:" + "ab".repeat(32) + ":1767225600";

describe("memoInstruction", () => {
  it("targets the SPL Memo program", () => {
    expect(MEMO_PROGRAM_ID.toBase58()).toBe("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    expect(memoInstruction(signer, memo).programId.equals(MEMO_PROGRAM_ID)).toBe(true);
  });

  it("has exactly the signer as a read-only signing key", () => {
    const ix = memoInstruction(signer, memo);
    expect(ix.keys).toHaveLength(1);
    expect(ix.keys[0].pubkey.equals(signer)).toBe(true);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(false);
  });

  it("encodes the memo as UTF-8 bytes", () => {
    const ix = memoInstruction(signer, memo);
    expect(Buffer.from(ix.data).toString("utf8")).toBe(memo);
    expect(ix.data.length).toBe(memo.length);
    const uni = memoInstruction(signer, "чек ✓");
    expect(Buffer.from(uni.data).equals(Buffer.from("чек ✓", "utf8"))).toBe(true);
  });

  it("rejects empty and oversized memos", () => {
    expect(() => memoInstruction(signer, "")).toThrow();
    expect(() => memoInstruction(signer, "x".repeat(501))).toThrow();
    expect(() => memoInstruction(signer, "x".repeat(500))).not.toThrow();
  });
});

describe("priorityFeeInstruction", () => {
  it("is a ComputeBudget setComputeUnitPrice instruction", () => {
    const ix = priorityFeeInstruction(10_000);
    const expected = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 });
    expect(ix.programId.equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(ix.keys).toHaveLength(0);
    expect(Buffer.from(ix.data).equals(Buffer.from(expected.data))).toBe(true);
    // discriminator 3 + u64 LE
    expect(Array.from(ix.data)).toEqual([3, 0x10, 0x27, 0, 0, 0, 0, 0, 0]);
  });

  it("rejects negative or non-integer prices", () => {
    expect(() => priorityFeeInstruction(-1)).toThrow();
    expect(() => priorityFeeInstruction(1.5)).toThrow();
  });
});

describe("buildMemoTransaction", () => {
  it("defaults to priority fee then memo, fee payer = signer", () => {
    const tx = buildMemoTransaction({ signer, memo, recentBlockhash: blockhash });
    const msg = tx.message;
    expect(msg.recentBlockhash).toBe(blockhash);
    expect(msg.staticAccountKeys[0].equals(signer)).toBe(true);
    expect(msg.header.numRequiredSignatures).toBe(1);
    expect(msg.compiledInstructions).toHaveLength(2);
    const [fee, m] = msg.compiledInstructions;
    expect(msg.staticAccountKeys[fee.programIdIndex].equals(ComputeBudgetProgram.programId)).toBe(true);
    expect(Buffer.from(fee.data).equals(Buffer.from(priorityFeeInstruction(DEFAULT_PRIORITY_MICRO_LAMPORTS).data))).toBe(true);
    expect(msg.staticAccountKeys[m.programIdIndex].equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(m.accountKeyIndexes).toEqual([0]);
    expect(Buffer.from(m.data).toString("utf8")).toBe(memo);
  });

  it("omits the priority fee when set to 0", () => {
    const tx = buildMemoTransaction({ signer, memo, recentBlockhash: blockhash, priorityMicroLamports: 0 });
    expect(tx.message.compiledInstructions).toHaveLength(1);
    expect(tx.message.staticAccountKeys[tx.message.compiledInstructions[0].programIdIndex].equals(MEMO_PROGRAM_ID)).toBe(true);
  });

  it("is unsigned and serializable", () => {
    const tx = buildMemoTransaction({ signer: Keypair.generate().publicKey, memo, recentBlockhash: blockhash });
    expect(tx.signatures).toHaveLength(1);
    expect(tx.signatures[0].every((b) => b === 0)).toBe(true);
    expect(tx.serialize().length).toBeLessThanOrEqual(1232);
  });
});
