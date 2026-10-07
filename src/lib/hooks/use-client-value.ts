"use client";

import { useSyncExternalStore } from "react";
import { subscribeSession } from "@/lib/call/session";

const noEvents = () => () => {};
const notOnClient = () => null;

/**
 * Reads a browser-only value (`window`, `navigator`, storage) without a
 * hydration mismatch: `null` means "not on the client yet", and callers must
 * render something sensible for it. This is also the lint-clean alternative to
 * writing state inside an effect.
 *
 * `read` must return a primitive (or a cached object), because React compares
 * snapshots with `Object.is`.
 */
export function useClientValue<T>(read: () => T): T | null {
  return useSyncExternalStore(noEvents, read, notOnClient);
}

/** Same, but re-reads whenever this tab's session storage changes. */
export function useSessionValue<T>(read: () => T): T | null {
  return useSyncExternalStore(subscribeSession, read, notOnClient);
}
