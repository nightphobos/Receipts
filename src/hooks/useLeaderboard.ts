import { PublicKey } from "@solana/web3.js";
import { appNowSec } from "../demo/store";
import { useQuery } from "@tanstack/react-query";

import { fetchRegistry } from "../chain/fetchHistory";
import { hasSeekerGenesisToken } from "../chain/genesis";
import { fetchSkrBalance } from "../chain/skrBalance";
import type { Leaderboard, WalletProfile } from "../core/leaderboard";
import {
  computeLeaderboard,
  leaderboardBaseUrl,
  leaderboardUrl,
  parseLeaderboard,
  parseWalletProfile,
  profileUrl,
  type ComputedLeaderboard,
} from "../core/leaderboardSource";
import { priceAt } from "../core/price";
import { useConnection } from "../utils/ConnectionProvider";
import { usePriceSource } from "./usePriceSource";
import { useDemo } from "../demo/store";

// Literal process.env access so Expo inlines the value at bundle time.
const LEADERBOARD_BASE = leaderboardBaseUrl({ EXPO_PUBLIC_LEADERBOARD_URL: process.env.EXPO_PUBLIC_LEADERBOARD_URL });

/** In-app mode reads at most this many registry signatures (newest first). */
const MAX_REGISTRY_SIGNATURES = 5000;
const STALE_MS = 5 * 60 * 1000;

export type LeaderboardSourceKind = "site" | "registry";
export const LEADERBOARD_SOURCE: LeaderboardSourceKind = LEADERBOARD_BASE ? "site" : "registry";

async function fetchJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Registry → leaderboard + profiles with the indexer's core code (EXPO_PUBLIC_LEADERBOARD_URL unset). */
function useComputedLeaderboard(enabled: boolean) {
  const { connection } = useConnection();
  const source = usePriceSource();
  return useQuery({
    queryKey: ["leaderboard", "registry", connection.rpcEndpoint, source.kind],
    enabled,
    staleTime: STALE_MS,
    queryFn: async (): Promise<ComputedLeaderboard> => {
      const txs = await fetchRegistry(connection, { maxSignatures: MAX_REGISTRY_SIGNATURES });
      return computeLeaderboard({
        txs,
        nowSec: appNowSec(),
        price: async (asset, ts) => (await priceAt(source, asset, ts))?.price ?? null,
        hasGenesis: (wallet) => hasSeekerGenesisToken(connection, new PublicKey(wallet)),
        skrBalance: (wallet) => fetchSkrBalance(connection, new PublicKey(wallet)),
      });
    },
  });
}

/** The global leaderboard: indexer site when configured, else computed from the registry. */
export function useLeaderboard() {
  // Demo mode always computes from the simulated chain; live and demo rows are never mixed.
  const base = useDemo().active ? null : LEADERBOARD_BASE;
  const computed = useComputedLeaderboard(base === null);
  const site = useQuery({
    queryKey: ["leaderboard", "site", base],
    enabled: base !== null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Leaderboard> => {
      const lb = parseLeaderboard(await fetchJson(leaderboardUrl(base as string)));
      if (!lb) throw new Error("Leaderboard file missing or in an unknown format");
      return lb;
    },
  });
  if (base !== null) return site;
  return { ...computed, data: computed.data?.leaderboard };
}

/** Read-only profile of any wallet (null = no v2 receipts on record); idle without a wallet. */
export function useWalletProfile(wallet: string | undefined) {
  const base = useDemo().active ? null : LEADERBOARD_BASE;
  const computed = useComputedLeaderboard(base === null && !!wallet);
  const site = useQuery({
    queryKey: ["leaderboard", "site-profile", base, wallet],
    enabled: base !== null && !!wallet,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<WalletProfile | null> => {
      const json = await fetchJson(profileUrl(base as string, wallet as string));
      return json === null ? null : parseWalletProfile(json);
    },
  });
  if (base !== null) return site;
  return { ...computed, data: computed.data && wallet ? (computed.data.profiles.get(wallet) ?? null) : undefined };
}
