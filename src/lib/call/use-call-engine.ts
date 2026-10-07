"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { PeerCallEngine } from "./engine";
import type { CallRole, CallState } from "./types";

/**
 * Bridges the imperative {@link PeerCallEngine} into React through an external
 * store: the engine owns signalling, negotiation and cleanup, components just
 * read state and call methods.
 */
export function useCallEngine(config: {
  code: string;
  role: CallRole;
  localName: string;
}): readonly [PeerCallEngine, CallState] {
  // The constructor has no side effects, so this is safe on the server too.
  const [engine] = useState(
    () =>
      new PeerCallEngine({
        code: config.code,
        role: config.role,
        localName: config.localName,
      })
  );

  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);

  // Name and role come from session storage, so they are only known after
  // hydration; the engine reads them when it actually connects.
  useEffect(() => {
    engine.setName(config.localName);
  }, [engine, config.localName]);

  useEffect(() => {
    engine.setRole(config.role);
  }, [engine, config.role]);

  // Unmount, tab close or the route being hidden: release camera + sockets.
  useEffect(() => () => engine.suspend(), [engine]);

  return [engine, state] as const;
}
