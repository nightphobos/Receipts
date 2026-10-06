import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM } from "../../core/genesis";
import { MINTS_BATCH, hasSeekerGenesisToken, type GenesisConnection } from "../genesis";
import accounts from "./fixtures/sgt-token-accounts-mainnet-2026-10-07.json";
import mints from "../../core/__tests__/fixtures/sgt-mints-mainnet-2026-10-07.json";

const TOKEN_2022_PROGRAM_ID = new PublicKey(TOKEN_2022_PROGRAM);
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const OWNER = new PublicKey(accounts.owner);
const MEMBER = mints.member.address;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Recorded mint account as web3.js returns it (owner as PublicKey). */
function mintAccount(raw: any, owner = TOKEN_2022_PROGRAM_ID) {
  return { ...clone(raw), owner };
}

function tokenAccount(mint: string, amount: string) {
  const a = clone(accounts.value[0]) as any;
  a.account.data.parsed.info.mint = mint;
  a.account.data.parsed.info.tokenAmount.amount = amount;
  return a;
}

function fakeConnection(tokenAccounts: any[], mintsByAddress: Record<string, any>) {
  const calls = { owner: [] as any[], multiple: [] as string[][] };
  const conn: GenesisConnection = {
    async getParsedTokenAccountsByOwner(owner, filter) {
      calls.owner.push({ owner: owner.toBase58(), programId: (filter as any).programId.toBase58() });
      return { context: { slot: 1 }, value: tokenAccounts };
    },
    async getMultipleParsedAccounts(keys) {
      calls.multiple.push(keys.map((k) => k.toBase58()));
      return { context: { slot: 1 }, value: keys.map((k) => mintsByAddress[k.toBase58()] ?? null) };
    },
  };
  return { conn, calls };
}

describe("hasSeekerGenesisToken", () => {
  it("finds the SGT in the recorded mainnet wallet", async () => {
    const { conn, calls } = fakeConnection(accounts.value, { [MEMBER]: mintAccount(mints.member.account) });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(true);
    expect(calls.owner).toEqual([{ owner: OWNER.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58() }]);
    expect(calls.multiple).toEqual([[MEMBER]]);
  });

  it("is false with no Token-2022 accounts and skips the mint lookup", async () => {
    const { conn, calls } = fakeConnection([], {});
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(false);
    expect(calls.multiple).toEqual([]);
  });

  it("is false when the SGT balance is zero", async () => {
    const { conn, calls } = fakeConnection([tokenAccount(MEMBER, "0")], { [MEMBER]: mintAccount(mints.member.account) });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(false);
    expect(calls.multiple).toEqual([]);
  });

  it("is false for the group mint and for missing mint accounts", async () => {
    const group = mints.group.address;
    const other = "So11111111111111111111111111111111111111112";
    const { conn } = fakeConnection([tokenAccount(group, "1"), tokenAccount(other, "1")], {
      [group]: mintAccount(mints.group.account),
    });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(false);
  });

  it("rejects a look-alike mint not owned by the Token-2022 program", async () => {
    const { conn } = fakeConnection(accounts.value, {
      [MEMBER]: mintAccount(mints.member.account, TOKEN_PROGRAM_ID),
    });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(false);
  });

  it("rejects raw (unparsed) account data", async () => {
    const { conn } = fakeConnection(accounts.value, {
      [MEMBER]: { ...mintAccount(mints.member.account), data: Buffer.alloc(0) },
    });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(false);
  });

  it("batches mint lookups by MINTS_BATCH", async () => {
    const filler = Array.from({ length: MINTS_BATCH }, (_, i) => new PublicKey(Uint8Array.from({ length: 32 }, () => i + 1)).toBase58());
    const extra = new PublicKey(Uint8Array.from({ length: 32 }, () => 250)).toBase58();
    const held = [...filler, MEMBER, extra].map((m) => tokenAccount(m, "1"));
    const { conn, calls } = fakeConnection(held, { [MEMBER]: mintAccount(mints.member.account) });
    await expect(hasSeekerGenesisToken(conn, OWNER)).resolves.toBe(true);
    expect(calls.multiple.map((b) => b.length)).toEqual([MINTS_BATCH, 2]);
  });

  it("propagates RPC errors", async () => {
    const conn: GenesisConnection = {
      getParsedTokenAccountsByOwner: () => Promise.reject(new Error("429")),
      getMultipleParsedAccounts: () => Promise.reject(new Error("unused")),
    };
    await expect(hasSeekerGenesisToken(conn, OWNER)).rejects.toThrow("429");
  });
});
