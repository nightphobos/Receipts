import * as SecureStore from "expo-secure-store";
import type { PublicKey } from "@solana/web3.js";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { utf8ToBytes } from "@noble/hashes/utils";

import { MASTER_MESSAGE, decideMaster, masterFromSignature, signatureFromSignedPayload } from "../core/secret";
import { loadMasterState, saveMasterState, type MasterState } from "../storage/master";
import { useMobileWallet } from "../utils/useMobileWallet";

const MESSAGE = utf8ToBytes(MASTER_MESSAGE);
export const MASTER_QUERY_KEY = "master-key";

function signatureOf(signed: Uint8Array | undefined): Uint8Array {
  const sig = signed ? signatureFromSignedPayload(signed, MESSAGE) : null;
  if (!sig) throw new Error("The wallet returned an unexpected signature format");
  return sig;
}

/**
 * v2 master key of `wallet` (spec "Secrets"): stored in expo-secure-store per wallet.
 * `setup()` asks the wallet to sign MASTER_MESSAGE twice in one session (determinism self-check)
 * and stores `derived` or the `random` fallback. `rederive()` signs once (recovery after reinstall)
 * and returns the master without storing it; `persist()` stores it once it has proven to work.
 */
export function useMasterKey(wallet: PublicKey | undefined) {
  const address = wallet?.toBase58();
  const mobileWallet = useMobileWallet();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [MASTER_QUERY_KEY, address],
    enabled: !!address,
    staleTime: Infinity,
    queryFn: () => (address ? loadMasterState(SecureStore, address) : Promise.resolve(null)),
  });

  const persist = useCallback(
    async (state: MasterState) => {
      if (!address) throw new Error("No wallet connected");
      await saveMasterState(SecureStore, address, state);
      queryClient.setQueryData([MASTER_QUERY_KEY, address], state);
    },
    [address, queryClient],
  );

  const setup = useCallback(async (): Promise<MasterState> => {
    const [a, b] = await mobileWallet.signMessages([MESSAGE, MESSAGE]);
    const state = decideMaster(signatureOf(a), signatureOf(b));
    await persist(state);
    return state;
  }, [mobileWallet, persist]);

  const rederive = useCallback(async (): Promise<Uint8Array> => {
    const [signed] = await mobileWallet.signMessages([MESSAGE]);
    return masterFromSignature(signatureOf(signed));
  }, [mobileWallet]);

  return {
    state: query.data ?? null,
    isLoading: query.isLoading,
    master: query.data?.mode === "derived" ? query.data.master : null,
    setup,
    rederive,
    persist,
  };
}
