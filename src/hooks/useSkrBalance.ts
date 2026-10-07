import type { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { fetchSkrBalance } from "../chain/skrBalance";
import { useConnection } from "../utils/ConnectionProvider";

/** Whole-SKR balance of the wallet, re-checked at most hourly. Silent on RPC errors (badge just stays hidden). */
export function useSkrBalance(wallet: PublicKey | undefined) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["skr-balance", connection.rpcEndpoint, wallet?.toBase58()],
    enabled: !!wallet,
    staleTime: 60 * 60 * 1000,
    queryFn: () => (wallet ? fetchSkrBalance(connection, wallet) : Promise.resolve(0)),
  });
}
