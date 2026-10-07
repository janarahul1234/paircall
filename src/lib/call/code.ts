/**
 * Call codes are the only "credential" in the app: they are random, never
 * derived from user input, and they double as the deterministic PeerJS id of
 * the host. Nothing about a code is persisted server-side.
 */

/** 32 unambiguous characters — 256 % 32 === 0, so `% ALPHABET.length` is unbiased. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 7;
export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 8;

const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_MIN_LENGTH},${CODE_MAX_LENGTH}}$`);

/** Prefix keeps our ids from colliding with other apps on a shared PeerServer. */
const PEER_ID_PREFIX = "pc";

/** Cryptographically random, human-readable call code. */
export function generateCallCode(length: number = CODE_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** Uppercases, strips separators/whitespace and clamps the length. */
export function normalizeCallCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_MAX_LENGTH);
}

export function isValidCallCode(input: string): boolean {
  return CODE_PATTERN.test(normalizeCallCode(input));
}

/**
 * PeerJS ids must start and end with an alphanumeric character and may contain
 * dashes in between. Codes are lowercased because PeerServer ids are treated
 * case-sensitively while humans type them uppercase.
 */
export function peerIdForCode(code: string): string {
  return `${PEER_ID_PREFIX}-${normalizeCallCode(code).toLowerCase()}`;
}

export function callPathForCode(code: string): string {
  return `/call/${normalizeCallCode(code)}`;
}

/** Only ever built from a code we validated ourselves, so the URL is safe to share. */
export function callUrlForCode(code: string): string {
  return `${window.location.origin}${callPathForCode(code)}`;
}
