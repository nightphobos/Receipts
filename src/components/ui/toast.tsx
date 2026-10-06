import React, { useEffect, useState } from "react";
import { Snackbar } from "react-native-paper";

type Toast = { id: number; message: string; error: boolean };

let nextId = 1;
let listener: ((t: Toast) => void) | null = null;

/** Show a short message at the bottom of the screen. Safe to call outside React (e.g. QueryCache). */
export function showToast(message: string, opts: { error?: boolean } = {}) {
  const toast = { id: nextId++, message, error: opts.error ?? false };
  if (listener) listener(toast);
  else console.log(message);
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Toast for an RPC / wallet failure; also logged. */
export function showErrorToast(prefix: string, e: unknown) {
  console.log(prefix, e);
  showToast(`${prefix}: ${errorMessage(e)}`, { error: true });
}

/** Renders the most recent toast. Mount once inside PaperProvider. */
export function ToastHost() {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);
  return (
    <Snackbar
      key={toast?.id}
      visible={toast !== null}
      onDismiss={() => setToast(null)}
      duration={toast?.error ? 5000 : 2500}
      action={{ label: "OK", onPress: () => setToast(null) }}
    >
      {toast?.message ?? ""}
    </Snackbar>
  );
}
