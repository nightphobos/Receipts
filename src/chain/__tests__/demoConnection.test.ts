import { PublicKey } from "@solana/web3.js";
import { DEMO_OTHERS, DEMO_YOU, demoTipTx, demoTx } from "../../core/demoData";
import { fetchRegistry } from "../fetchHistory";
import { fetchSkrBalance } from "../skrBalance";
import { buildTipTransaction } from "../tipTx";
import { tipTotals } from "../../core/tips";

const txs = [demoTipTx(DEMO_YOU, DEMO_OTHERS[0], 50, 1791331200), demoTx(DEMO_YOU, 1791331100, "rcpt:2:test")];
jest.mock("../../demo/store", () => ({ demoChainTxs: () => txs }));
// eslint-disable-next-line import/first
import { demoConnection } from "../../demo/DemoConnection";

describe("DemoConnection", () => {
  it("serves simulated tips that the real registry parser reads back with the amount", async () => {
    const read = await fetchRegistry(demoConnection as never);
    const tip = read.find((t) => t.tip);
    expect(tip).toMatchObject({ signer: DEMO_YOU, tagged: true, tip: txs[0].tip });
    expect(tipTotals(read).get(DEMO_OTHERS[0])).toMatchObject({ tipsSkr: 50, tippers: 1, tipsCount: 1 });
  });

  it("answers SKR balances from the seed", async () => {
    expect(await fetchSkrBalance(demoConnection as never, new PublicKey(DEMO_YOU))).toBeGreaterThanOrEqual(100);
  });
});

describe("demo tip transactions", () => {
  it("build for every demo recipient (some vanity keys are off-curve)", () => {
    for (const w of DEMO_OTHERS)
      expect(() =>
        buildTipTransaction({ from: new PublicKey(DEMO_YOU), to: new PublicKey(w), amount: 10, recentBlockhash: "11111111111111111111111111111111" }),
      ).not.toThrow();
  });
});
