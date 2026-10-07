/** Demo stand-in for the Mobile Wallet Adapter: never opens a wallet, never signs or sends anything real. */
import { PublicKey, VersionedTransaction, type Transaction } from "@solana/web3.js";
import { DEMO_YOU, demoSignMessage } from "../core/demoData";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MEMO_PROGRAM_ID } from "../chain/memoTx";
import { SKR_DECIMALS, parseTipMemo } from "../core/tip";
import { submitDemoMemo, submitDemoTip } from "./store";

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

/** Whole-token amount of the tx's SPL transferChecked (opcode 12), if any. */
function transferCheckedAmount(tx: Transaction | VersionedTransaction): number | null {
  const datas =
    tx instanceof VersionedTransaction
      ? tx.message.compiledInstructions
          .filter((ix) => tx.message.staticAccountKeys[ix.programIdIndex]?.equals(TOKEN_PROGRAM_ID))
          .map((ix) => Buffer.from(ix.data))
      : tx.instructions.filter((i) => i.programId.equals(TOKEN_PROGRAM_ID)).map((i) => Buffer.from(i.data));
  const d = datas.find((b) => b[0] === 12 && b.length >= 10);
  return d ? Number(d.readBigUInt64LE(1)) / 10 ** SKR_DECIMALS : null;
}

/** Seal/reveal memos and tips go onto the simulated chain; anything else is refused honestly. */
export async function demoSignAndSend(tx: Transaction | VersionedTransaction): Promise<string> {
  const memo = memoOf(tx);
  const recipient = memo ? parseTipMemo(memo) : null;
  if (recipient) {
    const amount = transferCheckedAmount(tx);
    if (amount !== null && amount > 0) return submitDemoTip(recipient, amount);
  } else if (memo?.startsWith("rcpt:")) return submitDemoMemo(memo);
  throw new Error("Demo mode — nothing was sent");
}

export async function demoSignMessages(messages: Uint8Array[]): Promise<Uint8Array[]> {
  return messages.map((m) => demoSignMessage(DEMO_YOU, m));
}
