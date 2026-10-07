/**
 * Demo mode state (module singleton, persisted under `rcpt.demo.state`). Real-mode data is never read
 * or written here; demo txs live only in memory/AsyncStorage on this phone and are never sent.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { buildDemoSeed, demoTipTx, demoTx, DEMO_YOU } from "../core/demoData";
import type { MemoTx } from "../core/history";
import { decodeMemoV2 } from "../core/memo";
import { deleteSecret } from "../storage/secrets";
import { clearMasterState } from "../storage/master";
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "rcpt.demo.state";

/** `EXPO_PUBLIC_DEMO_MODE=off` removes every demo entry point (dApp Store build). */
export const DEMO_ALLOWED = process.env.EXPO_PUBLIC_DEMO_MODE !== "off";

export interface DemoState {
  active: boolean;
  /** Real unix seconds when the demo was (re)started: the seed is built relative to it. */
  anchor: number;
  /** Time warp: demo clock = real clock + offsetSec. */
  offsetSec: number;
  /** Txs "sent" in this demo session (seals/reveals/tips), appended to the seed. */
  extra: MemoTx[];
  /** Bumped on every change (query invalidation). */
  version: number;
}

let state: DemoState = { active: false, anchor: 0, offsetSec: 0, extra: [], version: 0 };
let seedCache: { anchor: number; txs: MemoTx[] } | null = null;
const listeners = new Set<() => void>();

const realNowSec = () => Math.floor(Date.now() / 1000);

function set(next: Partial<DemoState>) {
  state = { ...state, ...next, version: state.version + 1 };
  listeners.forEach((l) => l());
  const { active, anchor, offsetSec, extra } = state;
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ active, anchor, offsetSec, extra })).catch(() => undefined);
}

export async function loadDemoState(): Promise<void> {
  if (!DEMO_ALLOWED) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw) as Partial<DemoState>;
    if (typeof s.anchor !== "number" || typeof s.offsetSec !== "number" || !Array.isArray(s.extra)) return;
    state = { active: s.active === true, anchor: s.anchor, offsetSec: s.offsetSec, extra: s.extra, version: state.version + 1 };
    listeners.forEach((l) => l());
  } catch {
    // corrupt state: stay in live mode
  }
}

export const getDemoState = (): DemoState => state;
export const isDemoActive = (): boolean => state.active;

/** App clock in ms: the warped demo clock in demo mode, else the real clock. */
export const appNowMs = (): number => Date.now() + (state.active ? state.offsetSec * 1000 : 0);
export const appNowSec = (): number => Math.floor(appNowMs() / 1000);

export function subscribeDemo(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDemo(): DemoState {
  return useSyncExternalStore(subscribeDemo, getDemoState);
}

/** All txs of the simulated chain, newest first. */
export function demoChainTxs(): MemoTx[] {
  if (!seedCache || seedCache.anchor !== state.anchor) seedCache = { anchor: state.anchor, txs: buildDemoSeed(state.anchor) };
  return [...state.extra, ...seedCache.txs].sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0));
}

/** Append a memo "sent" by the demo player at the current demo time; returns its fake signature. */
export function submitDemoMemo(memo: string): string {
  const tx = demoTx(DEMO_YOU, appNowSec(), memo);
  set({ extra: [...state.extra, tx] });
  return tx.signature;
}

/** Append a simulated SKR tip from the demo player (amount = the pressed button); returns its fake signature. */
export function submitDemoTip(recipient: string, amount: number): string {
  const tx = demoTipTx(DEMO_YOU, recipient, amount, appNowSec());
  set({ extra: [...state.extra, tx] });
  return tx.signature;
}

export function enterDemo(): void {
  if (!DEMO_ALLOWED) return;
  if (state.anchor > 0) set({ active: true });
  else set({ active: true, anchor: realNowSec(), offsetSec: 0, extra: [] });
}

export function exitDemo(): void {
  set({ active: false });
}

export function warpDemo(seconds: number): void {
  if (state.active) set({ offsetSec: state.offsetSec + seconds });
}

/** Back to the seed as of now; deletes this session's demo secrets and the demo master key. */
export async function resetDemo(): Promise<void> {
  for (const tx of state.extra) {
    const m = decodeMemoV2(tx.memo);
    if (m?.kind === "commit") await deleteSecret(AsyncStorage, m.hash).catch(() => undefined);
  }
  await clearMasterState(SecureStore, DEMO_YOU).catch(() => undefined);
  set({ active: true, anchor: realNowSec(), offsetSec: 0, extra: [] });
}
