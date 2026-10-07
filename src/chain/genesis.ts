import type {
  AccountInfo,
  ParsedAccountData,
  PublicKey,
  RpcResponseAndContext,
  TokenAccountsFilter,
} from "@solana/web3.js";
import { PublicKey as Key } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM, heldMints, isSeekerGenesisMint } from "../core/genesis";

const TOKEN_2022_PROGRAM_ID = new Key(TOKEN_2022_PROGRAM);

/** The two Connection methods the Seeker Genesis check needs (injected so tests can mock them). */
export interface GenesisConnection {
  getParsedTokenAccountsByOwner(
    owner: PublicKey,
    filter: TokenAccountsFilter,
  ): Promise<RpcResponseAndContext<Array<{ pubkey: PublicKey; account: AccountInfo<ParsedAccountData> }>>>;
  getMultipleParsedAccounts(
    keys: PublicKey[],
  ): Promise<RpcResponseAndContext<(AccountInfo<Buffer | ParsedAccountData> | null)[]>>;
}

/** Max accounts per getMultipleAccounts call. */
export const MINTS_BATCH = 100;

const isParsed = (data: Buffer | ParsedAccountData): data is ParsedAccountData =>
  typeof data === "object" && data !== null && "parsed" in data;

/**
 * True iff `owner` holds a Seeker Genesis Token: one of its Token-2022 accounts with a positive balance
 * has a mint owned by Token-2022 that passes `isSeekerGenesisMint`. RPC errors propagate.
 */
export async function hasSeekerGenesisToken(conn: GenesisConnection, owner: PublicKey): Promise<boolean> {
  // Demo mode's simulated chain answers from its seed (src/demo/DemoConnection.ts).
  const demo = (conn as { demoHasGenesis?: (wallet: string) => boolean }).demoHasGenesis;
  if (demo) return demo(owner.toBase58());
  const { value } = await conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID });
  const mints = heldMints(value.map((a) => a.account.data.parsed));
  for (let i = 0; i < mints.length; i += MINTS_BATCH) {
    const batch = mints.slice(i, i + MINTS_BATCH);
    const infos = await conn.getMultipleParsedAccounts(batch.map((m) => new Key(m)));
    const found = infos.value.some(
      (info, j) =>
        info !== null &&
        info.owner.equals(TOKEN_2022_PROGRAM_ID) &&
        isParsed(info.data) &&
        isSeekerGenesisMint(batch[j], info.data.parsed),
    );
    if (found) return true;
  }
  return false;
}
