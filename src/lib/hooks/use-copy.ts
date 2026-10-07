"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Clipboard write with a hidden-textarea fallback, so "Copy link" keeps working
 * on plain-http origins (e.g. testing on a LAN) where the async API is absent.
 */
export function useCopy(resetMs = 1800): { copied: boolean; copy: (text: string) => Promise<boolean> } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = useCallback(
    async (text: string) => {
      let ok = true;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        ok = legacyCopy(text);
      }
      if (!ok) return false;

      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    },
    [resetMs]
  );

  return { copied, copy };
}

function legacyCopy(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "fixed opacity-0 pointer-events-none";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
