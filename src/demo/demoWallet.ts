/** Demo stand-in for the Mobile Wallet Adapter: never opens a wallet, never signs or sends anything real. */
import { PublicKey, VersionedTransaction, type Transaction } from "@solana/web3.js";
import { DEMO_YOU, demoSignMessage } from "../core/demoData";
import { MEMO_PROGRAM_ID } from "../chain/memoTx";
import { submitDemoMemo } from "./store";

export const DEMO_PUBLIC_KEY = new PublicKey(DEMO_YOU);

export const demoAccount = {
  address: Buffer.from(DEMO_PUBLIC_KEY.toBytes()).toString("base64"),
  label: "Demo",
  publicKey: DEMO_PUBLIC_KEY,
};

/** The `rcpt:` memo of a tx built by the app, if any. */
function memoOf(tx: Transaction | VersionedTransaction): string | null {
  if (tx instanceof VersionedTransaction) {
    const keys = tx.message.staticAccountKeys;
    for (const ix of tx.message.compiledInstructions) {
      if (keys[ix.programIdIndex]?.equals(MEMO_PROGRAM_ID)) return Buffer.from(ix.data).toString("utf8");
    }
    return null;
  }
  const ix = tx.instructions.find((i) => i.programId.equals(MEMO_PROGRAM_ID));
  return ix ? ix.data.toString("utf8") : null;
}

/** Seal/reveal memos go onto the simulated chain; anything else (tips) is refused honestly. */
export async function demoSignAndSend(tx: Transaction | VersionedTransaction): Promise<string> {
  const memo = memoOf(tx);
  if (memo?.startsWith("rcpt:")) return submitDemoMemo(memo);
  throw new Error("Demo mode — nothing was sent");
}

export async function demoSignMessages(messages: Uint8Array[]): Promise<Uint8Array[]> {
  return messages.map((m) => demoSignMessage(DEMO_YOU, m));
}
