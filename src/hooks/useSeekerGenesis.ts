import type { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";

import { hasSeekerGenesisToken } from "../chain/genesis";
import { useConnection } from "../utils/ConnectionProvider";

/** Whether the wallet holds a Seeker Genesis Token. Silent on RPC errors (badge just stays hidden). */
export function useSeekerGenesis(wallet: PublicKey | undefined) {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["seeker-genesis", connection.rpcEndpoint, wallet?.toBase58()],
    enabled: !!wallet,
    staleTime: 60 * 60 * 1000,
    queryFn: () => (wallet ? hasSeekerGenesisToken(connection, wallet) : Promise.resolve(false)),
  });
}
