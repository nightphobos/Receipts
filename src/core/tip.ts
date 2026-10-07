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
