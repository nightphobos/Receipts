/**
 * The simulated chain behind demo mode, shaped like the few `Connection` methods the app uses, so the
 * real parsing and scoring code runs unchanged. Nothing here talks to the network.
 */
import {
  PublicKey,
  SystemProgram,
  type ConfirmedSignatureInfo,
  type ParsedTransactionWithMeta,
  type SignaturesForAddressOptions,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { DEMO_BLOCKHASH, DEMO_RPC_ENDPOINT, demoHasGenesis, demoSkrBalance } from "../core/demoData";
import type { MemoTx } from "../core/history";
import { REGISTRY, memoByteLength } from "../core/memo";
import { MEMO_PROGRAM_ID, REGISTRY_KEY } from "../chain/memoTx";
import { SKR_MINT_KEY } from "../chain/tipTx";
import { SKR_DECIMALS } from "../core/tip";
import { demoChainTxs } from "./store";

/** Parsed SPL transferChecked of a simulated tip, with the token balance that names the recipient. */
function tipParts(tip: NonNullable<MemoTx["tip"]>) {
  const fromAta = getAssociatedTokenAddressSync(SKR_MINT_KEY, new PublicKey(tip.from), true);
  const toAta = getAssociatedTokenAddressSync(SKR_MINT_KEY, new PublicKey(tip.to), true);
  const amount = String(Math.round(tip.amount * 10 ** SKR_DECIMALS));
  return {
    keys: [
      { pubkey: fromAta, signer: false, writable: true, source: "transaction" },
      { pubkey: toAta, signer: false, writable: true, source: "transaction" },
    ],
    instruction: {
      program: "spl-token",
      programId: TOKEN_PROGRAM_ID,
      parsed: {
        type: "transferChecked",
        info: {
          authority: tip.from,
          source: fromAta.toBase58(),
          destination: toAta.toBase58(),
          mint: tip.mint,
          tokenAmount: { amount, decimals: SKR_DECIMALS },
        },
      },
    },
    // accountIndex 3 = toAta (after signer, registry, fromAta).
    balance: { accountIndex: 3, mint: tip.mint, owner: tip.to, uiTokenAmount: { amount, decimals: SKR_DECIMALS } },
  };
}

function parsedTx(tx: MemoTx): ParsedTransactionWithMeta {
  const tip = tx.tip ? tipParts(tx.tip) : null;
  return {
    slot: 1,
    blockTime: tx.blockTime,
    meta: {
      err: null,
      fee: 5000,
      preBalances: [],
      postBalances: [],
      innerInstructions: [],
      logMessages: [],
      postTokenBalances: tip ? [tip.balance] : [],
    },
    transaction: {
      signatures: [tx.signature],
      message: {
        accountKeys: [
          { pubkey: new PublicKey(tx.signer), signer: true, writable: true, source: "transaction" },
          { pubkey: REGISTRY_KEY, signer: false, writable: true, source: "transaction" },
          ...(tip ? tip.keys : []),
        ],
        recentBlockhash: DEMO_BLOCKHASH,
        instructions: [
          ...(tip ? [tip.instruction] : []),
          { program: "spl-memo", programId: MEMO_PROGRAM_ID, parsed: tx.memo },
          {
            program: "system",
            programId: SystemProgram.programId,
            parsed: { type: "transfer", info: { source: tx.signer, destination: REGISTRY, lamports: 0 } },
          },
        ],
      },
    },
  } as unknown as ParsedTransactionWithMeta;
}

export class DemoConnection {
  readonly rpcEndpoint = DEMO_RPC_ENDPOINT;
  readonly commitment = "confirmed";

  demoHasGenesis(wallet: string): boolean {
    return demoHasGenesis(wallet);
  }

  demoSkrBalance(wallet: string): number {
    return demoSkrBalance(wallet);
  }

  async getSignaturesForAddress(address: PublicKey, opts: SignaturesForAddressOptions = {}): Promise<ConfirmedSignatureInfo[]> {
    const a = address.toBase58();
    let txs = demoChainTxs().filter((t) => a === REGISTRY || t.signer === a);
    if (opts.before) {
      const i = txs.findIndex((t) => t.signature === opts.before);
      txs = i >= 0 ? txs.slice(i + 1) : txs;
    }
    if (opts.until) {
      const i = txs.findIndex((t) => t.signature === opts.until);
      if (i >= 0) txs = txs.slice(0, i);
    }
    return txs.slice(0, opts.limit ?? 1000).map((t) => ({
      signature: t.signature,
      slot: 1,
      err: null,
      memo: `[${memoByteLength(t.memo)}] ${t.memo}`,
      blockTime: t.blockTime,
    }));
  }

  async getParsedTransactions(signatures: string[]): Promise<(ParsedTransactionWithMeta | null)[]> {
    const bySig = new Map(demoChainTxs().map((t) => [t.signature, t]));
    return signatures.map((s) => {
      const t = bySig.get(s);
      return t ? parsedTx(t) : null;
    });
  }

  async getLatestBlockhashAndContext() {
    return { context: { slot: 1 }, value: { blockhash: DEMO_BLOCKHASH, lastValidBlockHeight: 1 } };
  }

  async confirmTransaction() {
    return { context: { slot: 1 }, value: { err: null } };
  }

  async getBalance() {
    return 0;
  }
}

export const demoConnection = new DemoConnection();
