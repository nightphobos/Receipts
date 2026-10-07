import { ComputeBudgetProgram, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { REGISTRY } from "../../core/memo";
import { SKR_MINT, parseTipMemo } from "../../core/tip";
import { DEFAULT_PRIORITY_MICRO_LAMPORTS, MEMO_PROGRAM_ID } from "../memoTx";
import { SKR_MINT_KEY, buildTipTransaction, tipInstructions } from "../tipTx";

const from = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const to = new PublicKey("5wY8DyzUmAVc9Hkv2uhqZuPvQWmeBd3w2Q4gsaAifFBa");
const blockhash = "EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k";
const mint = new PublicKey(SKR_MINT);
const fromAta = getAssociatedTokenAddressSync(mint, from);
const toAta = getAssociatedTokenAddressSync(mint, to);

describe("tipInstructions", () => {
  it("creates the recipient ATA idempotently, then transferChecked 10^6·amount", () => {
    expect(SKR_MINT_KEY.equals(mint)).toBe(true);
    const [create, transfer] = tipInstructions(from, to, 50);

    expect(create.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(Array.from(create.data)).toEqual([1]); // CreateIdempotent
    const ck = create.keys.map((k) => k.pubkey.toBase58());
    expect(ck.slice(0, 4)).toEqual([from, toAta, to, mint].map((k) => k.toBase58()));
    expect(create.keys[5].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);

    expect(transfer.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(transfer.data[0]).toBe(12); // TransferChecked
    expect(transfer.data.readBigUInt64LE(1)).toBe(50_000_000n);
    expect(transfer.data[9]).toBe(6);
    expect(transfer.keys.map((k) => k.pubkey.toBase58())).toEqual(
      [fromAta, mint, toAta, from].map((k) => k.toBase58()),
    );
    expect(transfer.keys[3].isSigner).toBe(true);
  });

  it("ends with memo rcpt:2:t:<recipient> signed by the tipper and the 0-lamport registry tag", () => {
    const ixs = tipInstructions(from, to, 10);
    expect(ixs).toHaveLength(4);
    const [, , memo, tag] = ixs;
    expect(memo.programId.equals(MEMO_PROGRAM_ID)).toBe(true);
    expect(memo.data.toString("utf8")).toBe(`rcpt:2:t:${to.toBase58()}`);
    expect(parseTipMemo(memo.data.toString("utf8"))).toBe(to.toBase58());
    expect(memo.keys).toHaveLength(1);
    expect(memo.keys[0].pubkey.equals(from)).toBe(true);
    expect(memo.keys[0].isSigner).toBe(true);
    expect(tag.programId.equals(SystemProgram.programId)).toBe(true);
    expect(tag.keys.map((k) => k.pubkey.toBase58())).toEqual([from.toBase58(), REGISTRY]);
    expect(tag.data.readBigUInt64LE(4)).toBe(0n); // lamports
  });

  it("refuses self-tips and invalid amounts", () => {
    expect(() => tipInstructions(from, from, 10)).toThrow();
    expect(() => tipInstructions(from, to, 0)).toThrow();
    expect(() => tipInstructions(from, to, 2.5)).toThrow();
  });
});

describe("buildTipTransaction", () => {
  it("is a legacy tx paid by the tipper: priority fee + ATA + transfer + memo + tag, nothing else", () => {
    const tx = buildTipTransaction({ from, to, amount: 100, recentBlockhash: blockhash });
    const msg = tx.message;
    expect(msg.version).toBe("legacy");
    expect(msg.staticAccountKeys[0].equals(from)).toBe(true);
    expect(msg.header.numRequiredSignatures).toBe(1);
    expect(msg.recentBlockhash).toBe(blockhash);
    const programs = msg.compiledInstructions.map((ix) => msg.staticAccountKeys[ix.programIdIndex].toBase58());
    expect(programs).toEqual([
      ComputeBudgetProgram.programId.toBase58(),
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
      MEMO_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
    ]);
    expect(DEFAULT_PRIORITY_MICRO_LAMPORTS).toBeGreaterThan(0);
  });

  it("omits the priority fee when 0", () => {
    const tx = buildTipTransaction({ from, to, amount: 10, recentBlockhash: blockhash, priorityMicroLamports: 0 });
    expect(tx.message.compiledInstructions).toHaveLength(4);
  });
});
