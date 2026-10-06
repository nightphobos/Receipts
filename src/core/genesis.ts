/**
 * Seeker Genesis Token (SGT) detection over jsonParsed Token-2022 data.
 * An SGT is a Token-2022 mint whose mint authority is the Solana Mobile issuer and whose
 * `tokenGroupMember` extension puts it (and only it) in the SGT group.
 */

export const SGT_MINT_AUTHORITY = "GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4";
export const SGT_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** Parsed token account (`account.data.parsed`) as returned by getParsedTokenAccountsByOwner. */
export interface HeldTokenAccount {
  type: "account";
  info: { mint: string; tokenAmount: { amount: string; decimals?: number } };
}

const isObj = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null;

function extension(extensions: unknown[], name: string): Record<string, any> | null {
  const ext = extensions.find((e) => isObj(e) && e.extension === name);
  return isObj(ext) && isObj(ext.state) ? ext.state : null;
}

/** True iff `parsed` (a mint's `account.data.parsed`) is an SGT member mint at address `mint`. */
export function isSeekerGenesisMint(mint: string, parsed: unknown): boolean {
  if (!isObj(parsed) || parsed.type !== "mint" || !isObj(parsed.info)) return false;
  const { mintAuthority, extensions } = parsed.info;
  if (mintAuthority !== SGT_MINT_AUTHORITY || !Array.isArray(extensions)) return false;
  const member = extension(extensions, "tokenGroupMember");
  if (!member || member.group !== SGT_GROUP || member.mint !== mint) return false;
  const pointer = extension(extensions, "groupMemberPointer");
  return pointer === null || pointer.memberAddress === mint;
}

/** Unique mints (first-seen order) of parsed token accounts with a positive balance; malformed entries skipped. */
export function heldMints(accounts: unknown[]): string[] {
  const out: string[] = [];
  for (const a of accounts) {
    if (!isObj(a) || a.type !== "account" || !isObj(a.info) || typeof a.info.mint !== "string") continue;
    const amount = a.info.tokenAmount?.amount;
    if (typeof amount !== "string" || !/^\d+$/.test(amount) || /^0+$/.test(amount)) continue;
    if (!out.includes(a.info.mint)) out.push(a.info.mint);
  }
  return out;
}
