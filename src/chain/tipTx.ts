import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SKR_DECIMALS, SKR_MINT, skrToBaseUnits } from "../core/tip";
import { DEFAULT_PRIORITY_MICRO_LAMPORTS, priorityFeeInstruction } from "./memoTx";

export const SKR_MINT_KEY = new PublicKey(SKR_MINT);

/** [create recipient ATA (idempotent, paid by tipper), transferChecked `amount` SKR from→to]. */
export function tipInstructions(from: PublicKey, to: PublicKey, amount: number): TransactionInstruction[] {
  if (from.equals(to)) throw new Error("cannot tip yourself");
  const units = skrToBaseUnits(amount);
  const fromAta = getAssociatedTokenAddressSync(SKR_MINT_KEY, from);
  const toAta = getAssociatedTokenAddressSync(SKR_MINT_KEY, to);
  return [
    createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, SKR_MINT_KEY),
    createTransferCheckedInstruction(fromAta, SKR_MINT_KEY, toAta, from, units, SKR_DECIMALS),
  ];
}

export interface TipTransactionInput {
  from: PublicKey;
  to: PublicKey;
  /** Whole SKR. */
  amount: number;
  recentBlockhash: string;
  /** micro-lamports per CU; 0 omits the ComputeBudget instruction. */
  priorityMicroLamports?: number;
}

/** Unsigned legacy-message tip transaction (fee payer = tipper), ready for MWA signAndSendTransaction. */
export function buildTipTransaction(input: TipTransactionInput): VersionedTransaction {
  const fee = input.priorityMicroLamports ?? DEFAULT_PRIORITY_MICRO_LAMPORTS;
  const instructions = fee > 0 ? [priorityFeeInstruction(fee)] : [];
  instructions.push(...tipInstructions(input.from, input.to, input.amount));
  const message = new TransactionMessage({
    payerKey: input.from,
    recentBlockhash: input.recentBlockhash,
    instructions,
  }).compileToLegacyMessage();
  return new VersionedTransaction(message);
}
