import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import type { Call } from "../core/call";
import { callFromJson } from "../core/format";
import { buildReceipts } from "../core/history";
import type { PriceSource } from "../core/price";
import type { Receipt } from "../core/score";
import { fetchMemoHistory } from "../chain/fetchHistory";
import { loadSecret } from "../storage/secrets";
import { useConnection } from "../utils/ConnectionProvider";
import { usePriceSource } from "./usePriceSource";

export interface ReceiptRow {
  receipt: Receipt;
  /** Revealed call, else the locally stored one (null if this phone has no secret). */
  call: Call | null;
  hasSecret: boolean;
}

export const RECEIPTS_QUERY_KEY = "receipts";

/** Price at the deadline; null when not available yet or the source fails (→ `unresolved`). */
async function priceAtDeadline(source: PriceSource, call: Call, nowSec: number): Promise<number | null> {
  if (nowSec < call.deadline) return null;
  try {
    const p = await source.at(call.asset, call.deadline);
    return p ? p.price : null;
  } catch (e) {
    console.warn(`${source.kindOf(call.asset)} price at ${call.deadline} for ${call.asset} failed`, e);
    return null;
  }
}

async function loadRow(source: PriceSource, receipt: Receipt, nowSec: number): Promise<ReceiptRow> {
  const secret = await loadSecret(AsyncStorage, receipt.hash);
  if (receipt.reveal) {
    const call = receipt.reveal.call;
    return {
      receipt: { ...receipt, priceAtDeadline: await priceAtDeadline(source, call, nowSec) },
      call,
      hasSecret: secret !== null,
    };
  }
  return { receipt, call: secret ? callFromJson(secret.json) : null, hasSecret: secret !== null };
}

/** The wallet's receipts read from chain (newest first), with local calls and price resolution. */
export function useReceipts(wallet: PublicKey | undefined) {
  const { connection } = useConnection();
  const source = usePriceSource();
  return useQuery({
    queryKey: [RECEIPTS_QUERY_KEY, connection.rpcEndpoint, wallet?.toBase58(), source.kind],
    enabled: !!wallet,
    meta: { errorToast: "Couldn't read receipts from RPC" },
    queryFn: async (): Promise<ReceiptRow[]> => {
      if (!wallet) return [];
      const txs = await fetchMemoHistory(connection, wallet);
      const nowSec = Math.floor(Date.now() / 1000);
      return Promise.all(buildReceipts(txs, wallet.toBase58()).map((r) => loadRow(source, r, nowSec)));
    },
  });
}
