import { useEffect, useState } from "react";
import { appNowSec, subscribeDemo } from "../demo/store";

/** Current unix time in seconds (the warped clock in demo mode), re-rendering every `intervalMs` and on time warp. */
export function useNowSec(intervalMs = 1000): number {
  const [now, setNow] = useState(appNowSec);
  useEffect(() => {
    const tick = () => setNow(appNowSec());
    const id = setInterval(tick, intervalMs);
    const unsub = subscribeDemo(tick);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [intervalMs]);
  return now;
}
