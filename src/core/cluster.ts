/** Cluster selection from build-time env (`EXPO_PUBLIC_CLUSTER`, `EXPO_PUBLIC_RPC_URL`). */

export type ClusterName = "mainnet-beta" | "devnet";

export const DEFAULT_RPC_URL = "https://api.mainnet-beta.solana.com";
const DEVNET_RPC_URL = "https://api.devnet.solana.com";

export interface ClusterConfig {
  network: ClusterName;
  endpoint: string;
}

/** Unknown cluster names fall back to mainnet-beta; a blank RPC URL uses the cluster's public RPC. */
export function clusterConfig(env: { cluster?: string; rpcUrl?: string }): ClusterConfig {
  const network: ClusterName = env.cluster?.trim() === "devnet" ? "devnet" : "mainnet-beta";
  const rpcUrl = env.rpcUrl?.trim();
  const endpoint = rpcUrl ? rpcUrl : network === "devnet" ? DEVNET_RPC_URL : DEFAULT_RPC_URL;
  return { network, endpoint };
}
