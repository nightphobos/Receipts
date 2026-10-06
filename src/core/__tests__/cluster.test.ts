import { clusterConfig, DEFAULT_RPC_URL } from "../cluster";

describe("clusterConfig", () => {
  it("defaults to mainnet-beta on the public RPC", () => {
    expect(clusterConfig({})).toEqual({
      network: "mainnet-beta",
      endpoint: DEFAULT_RPC_URL,
    });
    expect(DEFAULT_RPC_URL).toBe("https://api.mainnet-beta.solana.com");
  });

  it("accepts devnet and uses the devnet RPC when no URL is given", () => {
    expect(clusterConfig({ cluster: "devnet" })).toEqual({
      network: "devnet",
      endpoint: "https://api.devnet.solana.com",
    });
  });

  it("uses an explicit RPC URL", () => {
    expect(
      clusterConfig({ cluster: "mainnet-beta", rpcUrl: " https://rpc.example.com " })
    ).toEqual({ network: "mainnet-beta", endpoint: "https://rpc.example.com" });
  });

  it("falls back to mainnet-beta for unknown clusters and ignores blank URLs", () => {
    expect(clusterConfig({ cluster: "testnet", rpcUrl: "  " })).toEqual({
      network: "mainnet-beta",
      endpoint: DEFAULT_RPC_URL,
    });
  });
});
