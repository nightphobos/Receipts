import { PublicKey } from "@solana/web3.js";
import { SKR_MINT } from "../../core/tip";
import { fetchSkrBalance, type SkrBalanceConnection } from "../skrBalance";

const OWNER = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");

const account = (amount: string, mint = SKR_MINT, decimals = 6) => ({
  pubkey: OWNER,
  account: {
    data: { program: "spl-token", parsed: { type: "account", info: { mint, owner: OWNER.toBase58(), tokenAmount: { amount, decimals } } }, space: 165 },
    executable: false,
    lamports: 2039280,
    owner: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  },
});

function fake(value: any[]) {
  const calls: { owner: string; mint: string }[] = [];
  const conn: SkrBalanceConnection = {
    async getParsedTokenAccountsByOwner(owner, filter) {
      calls.push({ owner: owner.toBase58(), mint: (filter as any).mint.toBase58() });
      return { context: { slot: 1 }, value } as any;
    },
  };
  return { conn, calls };
}

describe("fetchSkrBalance", () => {
  it("asks for the owner's SKR-mint accounts and sums them in whole SKR", async () => {
    const { conn, calls } = fake([account("150000000"), account("2500000")]);
    expect(await fetchSkrBalance(conn, OWNER)).toBe(152.5);
    expect(calls).toEqual([{ owner: OWNER.toBase58(), mint: SKR_MINT }]);
  });

  it("is 0 without accounts and ignores other mints", async () => {
    expect(await fetchSkrBalance(fake([]).conn, OWNER)).toBe(0);
    const other = account("999000000", "So11111111111111111111111111111111111111112", 9);
    expect(await fetchSkrBalance(fake([other]).conn, OWNER)).toBe(0);
  });

  it("uses the demo chain's answer when the connection has one", async () => {
    const conn = { ...fake([account("1")]).conn, demoSkrBalance: (w: string) => (w === OWNER.toBase58() ? 420 : 0) };
    expect(await fetchSkrBalance(conn, OWNER)).toBe(420);
  });

  it("propagates RPC errors", async () => {
    const conn: SkrBalanceConnection = {
      async getParsedTokenAccountsByOwner() {
        throw new Error("429");
      },
    };
    await expect(fetchSkrBalance(conn, OWNER)).rejects.toThrow("429");
  });
});
