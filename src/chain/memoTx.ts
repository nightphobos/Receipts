import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

/** SPL Memo program (v2) — the only on-chain program Receipts uses. */
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Small priority fee so memos land during congestion (~0.0000002 SOL at default CU limit). */
export const DEFAULT_PRIORITY_MICRO_LAMPORTS = 10_000;

/** Matches the limit asserted by the core memo encoders. */
export const MAX_MEMO_BYTES = 500;

/** Memo instruction signed (read-only) by `signer`; data = UTF-8 memo bytes. */
export function memoInstruction(signer: PublicKey, memo: string): TransactionInstruction {
  const data = Buffer.from(memo, "utf8");
  if (data.length === 0) throw new Error("memo is empty");
  if (data.length > MAX_MEMO_BYTES) throw new Error(`memo is ${data.length} bytes, max ${MAX_MEMO_BYTES}`);
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data,
  });
}

/** ComputeBudget setComputeUnitPrice instruction. */
export function priorityFeeInstruction(microLamports: number): TransactionInstruction {
  if (!Number.isSafeInteger(microLamports) || microLamports < 0) {
    throw new Error(`invalid priority fee: ${microLamports}`);
  }
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
}

export interface MemoTransactionInput {
  signer: PublicKey;
  memo: string;
  recentBlockhash: string;
  /** micro-lamports per CU; 0 omits the ComputeBudget instruction. */
  priorityMicroLamports?: number;
}

/** Unsigned legacy-message transaction (fee payer = signer), ready for MWA signAndSendTransaction. */
export function buildMemoTransaction(input: MemoTransactionInput): VersionedTransaction {
  const fee = input.priorityMicroLamports ?? DEFAULT_PRIORITY_MICRO_LAMPORTS;
  const feeIx = priorityFeeInstruction(fee);
  const instructions = fee > 0 ? [feeIx] : [];
  instructions.push(memoInstruction(input.signer, input.memo));
  const message = new TransactionMessage({
    payerKey: input.signer,
    recentBlockhash: input.recentBlockhash,
    instructions,
  }).compileToLegacyMessage();
  return new VersionedTransaction(message);
}
