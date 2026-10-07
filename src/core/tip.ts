/**
 * SKR tips: a direct wallet→wallet SPL transfer the tipper approves in their wallet.
 * The app never holds funds.
 */

/** SKR (Seeker) mint, verified on mainnet 2026-10-07: owner SPL Token program, 6 decimals, metadata "Seeker"/"SKR". */
export const SKR_MINT = "SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3";
export const SKR_DECIMALS = 6;

/** Tip buttons, in whole SKR. */
export const TIP_AMOUNTS = [10, 50, 100] as const;

/** Whole SKR → base units (bigint). Throws on non-positive, fractional or unsafe amounts. */
export function skrToBaseUnits(amount: number): bigint {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error(`invalid tip amount: ${amount}`);
  return BigInt(amount) * 10n ** BigInt(SKR_DECIMALS);
}

/** A tip needs a connected wallet that isn't the recipient. */
export function canTip(me: string | null | undefined, recipient: string): boolean {
  return !!me && me !== recipient;
}

/**
 * Leaderboard SKR gate, in whole SKR: a wallet holding at least this much SKR (summed over its
 * SPL Token accounts) is eligible without a Seeker Genesis Token (spec "SKR integration v2").
 */
export const SKR_GATE_MIN = 100;

const BASE58_KEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Whole-SKR balance from `getParsedTokenAccountsByOwner(owner, { mint: SKR })` →
 * `value[].account.data.parsed`. Other mints, wrong decimals and malformed entries are ignored.
 */
export function skrBalanceOf(parsedAccounts: readonly unknown[]): number {
  let units = 0n;
  for (const p of parsedAccounts) {
    const info = (p as { info?: { mint?: unknown; tokenAmount?: { amount?: unknown; decimals?: unknown } } } | null)
      ?.info;
    const amount = info?.tokenAmount?.amount;
    if (info?.mint !== SKR_MINT || info.tokenAmount?.decimals !== SKR_DECIMALS) continue;
    if (typeof amount !== "string" || !/^\d+$/.test(amount)) continue;
    units += BigInt(amount);
  }
  return Number(units) / 10 ** SKR_DECIMALS;
}

export const isSkrHolder = (balance: number): boolean => balance >= SKR_GATE_MIN;

/** Memo of a tip tx, so the registry lists it: `rcpt:2:t:<recipient wallet>`. */
export const TIP_MEMO_PREFIX = "rcpt:2:t:";

export function tipMemo(recipient: string): string {
  if (!BASE58_KEY.test(recipient)) throw new Error(`invalid recipient: ${recipient}`);
  return TIP_MEMO_PREFIX + recipient;
}

/** Recipient named by a tip memo, else null. The memo never carries the amount. */
export function parseTipMemo(memo: string): string | null {
  if (!memo.startsWith(TIP_MEMO_PREFIX)) return null;
  const r = memo.slice(TIP_MEMO_PREFIX.length);
  return BASE58_KEY.test(r) ? r : null;
}
