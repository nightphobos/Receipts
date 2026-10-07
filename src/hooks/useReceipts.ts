import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Connection, PublicKey } from "@solana/web3.js";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { Call, CallV2 } from "../core/call";
import { callFromJson, callV2FromJson } from "../core/format";
import { buildReceipts, buildReceiptsV2, type MemoTx } from "../core/history";
import { priceAt, refTimeForCommit, type PriceSource } from "../core/price";
import type { Receipt, ReceiptV2 } from "../core/score";
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

/**
 * The wallet's memo txs, shared by the v1 and v2 receipt queries (one RPC sweep). Lives under
 * RECEIPTS_QUERY_KEY so invalidating receipts also refetches the txs.
 */
function memoTxs(queryClient: QueryClient, connection: Connection, wallet: PublicKey): Promise<MemoTx[]> {
  return queryClient.fetchQuery({
    queryKey: [RECEIPTS_QUERY_KEY, "txs", connection.rpcEndpoint, wallet.toBase58()],
    queryFn: () => fetchMemoHistory(connection, wallet),
    staleTime: 10_000,
  });
}

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
  const queryClient = useQueryClient();
  const source = usePriceSource();
  return useQuery({
    queryKey: [RECEIPTS_QUERY_KEY, connection.rpcEndpoint, wallet?.toBase58(), source.kind],
    enabled: !!wallet,
    meta: { errorToast: "Couldn't read receipts from RPC" },
    queryFn: async (): Promise<ReceiptRow[]> => {
      if (!wallet) return [];
      const txs = await memoTxs(queryClient, connection, wallet);
      const nowSec = Math.floor(Date.now() / 1000);
      return Promise.all(buildReceipts(txs, wallet.toBase58()).map((r) => loadRow(source, r, nowSec)));
    },
  });
}

export interface ReceiptRowV2 {
  receipt: ReceiptV2;
  /** Revealed call, else the locally stored one (null if this phone has no secret; may still be recoverable). */
  call: CallV2 | null;
  hasSecret: boolean;
}

/** priceAt(...).price, null when not available yet or the source fails (→ `unresolved`). */
async function safePriceAt(source: PriceSource, asset: ReceiptV2["asset"], ts: number, nowSec: number) {
  if (nowSec < ts) return null;
  try {
    return (await priceAt(source, asset, ts))?.price ?? null;
  } catch (e) {
    console.warn(`${source.kindOf(asset)} price at ${ts} for ${asset} failed`, e);
    return null;
  }
}

async function loadRowV2(source: PriceSource, receipt: ReceiptV2, nowSec: number): Promise<ReceiptRowV2> {
  const secret = await loadSecret(AsyncStorage, receipt.hash);
  const local = secret ? callV2FromJson(secret.json) : null;
  if (!receipt.reveal) return { receipt, call: local, hasSecret: local !== null };
  const [p0, pt] = await Promise.all([
    safePriceAt(source, receipt.asset, refTimeForCommit(receipt.commit.blockTime), nowSec),
    safePriceAt(source, receipt.asset, receipt.deadline, nowSec),
  ]);
  return { receipt: { ...receipt, p0, pt }, call: receipt.reveal.call, hasSecret: local !== null };
}

/** The wallet's v2 receipts (tagged, newest first) with local calls and P0/PT for revealed ones. */
export function useReceiptsV2(wallet: PublicKey | undefined) {
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const source = usePriceSource();
  return useQuery({
    queryKey: [RECEIPTS_QUERY_KEY, "v2", connection.rpcEndpoint, wallet?.toBase58(), source.kind],
    enabled: !!wallet,
    meta: { errorToast: "Couldn't read receipts from RPC" },
    queryFn: async (): Promise<ReceiptRowV2[]> => {
      if (!wallet) return [];
      const txs = await memoTxs(queryClient, connection, wallet);
      const nowSec = Math.floor(Date.now() / 1000);
      return Promise.all(buildReceiptsV2(txs, wallet.toBase58()).map((r) => loadRowV2(source, r, nowSec)));
    },
  });
}
