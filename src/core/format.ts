/** Display helpers shared by the screens. Pure TS: no RN/Expo imports. */
import { isCall, isCallV2, type Call, type CallV2 } from "./call";

export function formatUsd(p: number): string {
  return p >= 1 ? p.toFixed(2) : p.toPrecision(4);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Compact time left: "45s", "12m 05s", "5h 07m", "3d 4h". Non-positive → "0s". */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad2(m)}m`;
  if (m > 0) return `${m}m ${pad2(s % 60)}s`;
  return `${s}s`;
}

/** "SOL above $250.50". */
export function describeCall(call: Call): string {
  return `${call.asset} ${call.dir} $${formatUsd(call.target)}`;
}

/** Call from a stored/revealed JSON string, or null if it isn't one. */
export function callFromJson(json: string): Call | null {
  try {
    const x: unknown = JSON.parse(json);
    return isCall(x) ? x : null;
  } catch {
    return null;
  }
}

/** "SOL ▲ up" / "SKR ▼ down". */
export function describeCallV2(call: CallV2): string {
  return `${call.asset} ${call.dir === "up" ? "▲ up" : "▼ down"}`;
}

/** v2 call from a stored/revealed JSON string, or null if it isn't one. */
export function callV2FromJson(json: string): CallV2 | null {
  try {
    const x: unknown = JSON.parse(json);
    return isCallV2(x) ? x : null;
  } catch {
    return null;
  }
}

/** Solscan tx link; `?cluster=` only for devnet/testnet (anything else is treated as mainnet). */
export function solscanTxUrl(signature: string, cluster?: string): string {
  const base = `https://solscan.io/tx/${signature}`;
  return cluster === "devnet" || cluster === "testnet" ? `${base}?cluster=${cluster}` : base;
}
