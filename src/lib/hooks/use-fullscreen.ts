"use client";

import { useCallback, useEffect, useState } from "react";

/** Fullscreen for a single element, tracking browser-initiated exits too. */
export function useFullscreen<T extends HTMLElement>(): {
  active: boolean;
  toggle: (element: T | null) => void;
} {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onChange = () => setActive(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback((element: T | null) => {
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void element.requestFullscreen({ navigationUI: "hide" }).catch(() => undefined);
  }, []);

  return { active, toggle };
}
