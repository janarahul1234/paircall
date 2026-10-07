"use client";

import { useEffect, useState } from "react";

/**
 * One shared 1s tick for call durations and expiry countdowns. Only runs while
 * `active`, and never during prerendering.
 */
export function useTicker(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    // Fire once on the next task so the first paint is not a stale zero.
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);

  return now;
}
