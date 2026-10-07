import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { fetchRegistry } from "../chain/fetchHistory";
import { hasSeekerGenesisToken } from "../chain/genesis";
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
        nowSec: Math.floor(Date.now() / 1000),
        price: async (asset, ts) => (await priceAt(source, asset, ts))?.price ?? null,
        hasGenesis: (wallet) => hasSeekerGenesisToken(connection, new PublicKey(wallet)),
      });
    },
  });
}

/** The global leaderboard: indexer site when configured, else computed from the registry. */
export function useLeaderboard() {
  const computed = useComputedLeaderboard(LEADERBOARD_BASE === null);
  const site = useQuery({
    queryKey: ["leaderboard", "site", LEADERBOARD_BASE],
    enabled: LEADERBOARD_BASE !== null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Leaderboard> => {
      const lb = parseLeaderboard(await fetchJson(leaderboardUrl(LEADERBOARD_BASE as string)));
      if (!lb) throw new Error("Leaderboard file missing or in an unknown format");
      return lb;
    },
  });
  if (LEADERBOARD_BASE !== null) return site;
  return { ...computed, data: computed.data?.leaderboard };
}

/** Read-only profile of any wallet (null = no v2 receipts on record). */
export function useWalletProfile(wallet: string) {
  const computed = useComputedLeaderboard(LEADERBOARD_BASE === null);
  const site = useQuery({
    queryKey: ["leaderboard", "site-profile", LEADERBOARD_BASE, wallet],
    enabled: LEADERBOARD_BASE !== null,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<WalletProfile | null> => {
      const json = await fetchJson(profileUrl(LEADERBOARD_BASE as string, wallet));
      return json === null ? null : parseWalletProfile(json);
    },
  });
  if (LEADERBOARD_BASE !== null) return site;
  return { ...computed, data: computed.data ? (computed.data.profiles.get(wallet) ?? null) : undefined };
}
