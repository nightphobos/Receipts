/** Onboarding visibility (module singleton). Seen flag persisted under `rcpt:onboarded`. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";
import { ONBOARDED_KEY, ONBOARDED_VALUE, shouldShowOnboarding } from "../core/onboarding";

let visible = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  visible = next;
  listeners.forEach((l) => l());
}

/** On launch: show once if the flag is unset. Storage errors → don't block the app. */
export async function loadOnboarding(): Promise<void> {
  try {
    if (shouldShowOnboarding(await AsyncStorage.getItem(ONBOARDED_KEY))) set(true);
  } catch {
    // ignore
  }
}

/** Settings → "How it works". */
export const openOnboarding = () => set(true);

export function finishOnboarding() {
  set(false);
  AsyncStorage.setItem(ONBOARDED_KEY, ONBOARDED_VALUE).catch(() => undefined);
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useOnboardingVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible);
}
