import type {
  AccountInfo,
  ParsedAccountData,
  PublicKey,
  RpcResponseAndContext,
  TokenAccountsFilter,
} from "@solana/web3.js";
import { skrBalanceOf } from "../core/tip";
import { SKR_MINT_KEY } from "./tipTx";

/** The Connection method the SKR balance check needs (injected so tests can mock it). */
export interface SkrBalanceConnection {
  getParsedTokenAccountsByOwner(
    owner: PublicKey,
    filter: TokenAccountsFilter,
  ): Promise<RpcResponseAndContext<Array<{ pubkey: PublicKey; account: AccountInfo<ParsedAccountData> }>>>;
}

/** Whole-SKR balance of `owner`, summed over its SKR token accounts. RPC errors propagate. */
export async function fetchSkrBalance(conn: SkrBalanceConnection, owner: PublicKey): Promise<number> {
  // Demo mode's simulated chain answers from its seed (src/demo/DemoConnection.ts).
  const demo = (conn as { demoSkrBalance?: (wallet: string) => number }).demoSkrBalance;
  if (demo) return demo(owner.toBase58());
  const { value } = await conn.getParsedTokenAccountsByOwner(owner, { mint: SKR_MINT_KEY });
  return skrBalanceOf(value.map((a) => a.account.data.parsed));
}
