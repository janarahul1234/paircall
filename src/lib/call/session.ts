/**
 * Session-scoped storage only: nothing here outlives the browser tab. The
 * display name is kept for the current session so a refresh does not ask again,
 * and the host mark tells a reloaded `/call/CODE` page that this tab created it.
 */

const NAME_KEY = "paircall:name";
const HOST_PREFIX = "paircall:host:";

export const MAX_NAME_LENGTH = 24;

/*
 * A microscopic external store, so React can read sessionStorage through
 * `useSyncExternalStore` instead of writing state inside an effect.
 */
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // Accessing sessionStorage itself throws in some hardened/private modes.
    const store = window.sessionStorage;
    void store.length;
    return store;
  } catch {
    return null;
  }
}

/** Names are trimmed, length-capped and stripped of control characters. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

export function readName(): string {
  return sanitizeName(session()?.getItem(NAME_KEY) ?? "");
}

export function writeName(name: string): void {
  const clean = sanitizeName(name);
  if (!clean) return;
  session()?.setItem(NAME_KEY, clean);
  notify();
}

export function clearName(): void {
  session()?.removeItem(NAME_KEY);
  notify();
}

/** Remembers that *this tab* created the code, so a reload rejoins as host. */
export function markAsHost(code: string): void {
  session()?.setItem(HOST_PREFIX + code, "1");
  notify();
}

export function isLocalHost(code: string): boolean {
  return session()?.getItem(HOST_PREFIX + code) === "1";
}

export function clearHostMark(code: string): void {
  session()?.removeItem(HOST_PREFIX + code);
  notify();
}

/** Called when a tab leaves a call behind and goes back to the start. */
export function clearCallSession(code: string): void {
  clearHostMark(code);
}
