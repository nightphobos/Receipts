import {
  SGT_GROUP,
  SGT_MINT_AUTHORITY,
  TOKEN_2022_PROGRAM,
  heldMints,
  isSeekerGenesisMint,
  type HeldTokenAccount,
} from "../genesis";
import recorded from "./fixtures/sgt-mints-mainnet-2026-10-07.json";

const MEMBER = recorded.member.address;
const memberInfo = (): any => JSON.parse(JSON.stringify(recorded.member.account.data.parsed));
const groupInfo = (): any => JSON.parse(JSON.stringify(recorded.group.account.data.parsed));

describe("isSeekerGenesisMint", () => {
  it("accepts the recorded mainnet Seeker Genesis Token mint", () => {
    expect(isSeekerGenesisMint(MEMBER, memberInfo())).toBe(true);
  });

  it("pins the authority and group addresses", () => {
    expect(SGT_MINT_AUTHORITY).toBe("GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4");
    expect(SGT_GROUP).toBe("GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te");
    expect(TOKEN_2022_PROGRAM).toBe(recorded.member.account.owner);
  });

  it("rejects the group mint itself (it is not a member)", () => {
    expect(isSeekerGenesisMint(recorded.group.address, groupInfo())).toBe(false);
  });

  it("rejects a different mint authority", () => {
    const info = memberInfo();
    info.info.mintAuthority = "11111111111111111111111111111111";
    expect(isSeekerGenesisMint(MEMBER, info)).toBe(false);
  });

  it("rejects a null mint authority", () => {
    const info = memberInfo();
    info.info.mintAuthority = null;
    expect(isSeekerGenesisMint(MEMBER, info)).toBe(false);
  });

  it("rejects membership in another group", () => {
    const info = memberInfo();
    for (const ext of info.info.extensions) if (ext.extension === "tokenGroupMember") ext.state.group = MEMBER;
    expect(isSeekerGenesisMint(MEMBER, info)).toBe(false);
  });

  it("rejects a mint without the tokenGroupMember extension", () => {
    const info = memberInfo();
    info.info.extensions = info.info.extensions.filter((e: any) => e.extension !== "tokenGroupMember");
    expect(isSeekerGenesisMint(MEMBER, info)).toBe(false);
  });

  it("rejects a member record that belongs to another mint", () => {
    expect(isSeekerGenesisMint(SGT_GROUP, memberInfo())).toBe(false);
    expect(isSeekerGenesisMint("So11111111111111111111111111111111111111112", memberInfo())).toBe(false);
  });

  it("rejects a member pointer that points elsewhere", () => {
    const info = memberInfo();
    for (const ext of info.info.extensions)
      if (ext.extension === "groupMemberPointer") ext.state.memberAddress = SGT_GROUP;
    expect(isSeekerGenesisMint(MEMBER, info)).toBe(false);
  });

  it("rejects non-mint and malformed data", () => {
    expect(isSeekerGenesisMint(MEMBER, { ...memberInfo(), type: "account" })).toBe(false);
    expect(isSeekerGenesisMint(MEMBER, null)).toBe(false);
    expect(isSeekerGenesisMint(MEMBER, "garbage")).toBe(false);
    expect(isSeekerGenesisMint(MEMBER, { type: "mint" })).toBe(false);
    expect(isSeekerGenesisMint(MEMBER, { type: "mint", info: { mintAuthority: SGT_MINT_AUTHORITY, extensions: "x" } })).toBe(
      false,
    );
  });
});

describe("heldMints", () => {
  const acct = (mint: string, amount: string, decimals = 0): HeldTokenAccount => ({
    type: "account",
    info: { mint, tokenAmount: { amount, decimals } },
  });

  it("returns unique mints with a positive balance, in first-seen order", () => {
    expect(heldMints([acct("A", "1"), acct("B", "0"), acct("C", "2"), acct("A", "1")])).toEqual(["A", "C"]);
  });

  it("skips malformed entries", () => {
    expect(
      heldMints([
        null,
        "x",
        { type: "mint", info: { mint: "D", tokenAmount: { amount: "1" } } },
        { type: "account", info: { mint: "E" } },
        { type: "account", info: { mint: "F", tokenAmount: { amount: "abc" } } },
        acct("G", "1"),
      ] as unknown[]),
    ).toEqual(["G"]);
  });
});
