import { createHmac, randomBytes } from "node:crypto";
import { connection } from "next/server";

/**
 * ICE server configuration for the browser.
 *
 * Server-only environment variables (never `NEXT_PUBLIC_`) are read here, so
 * TURN secrets stay off the client. When `TURN_SECRET` is set we mint
 * short-lived credentials using the TURN REST API (RFC 9359):
 *
 *   username   = <expiry-epoch>:<random id>
 *   credential = base64(HMAC-SHA1(secret, username))
 *
 * which is exactly what coturn / Cloudflare / Xirivo-style relays expect.
 *
 * GET only, `no-store`, and always request-time: the payload is a fresh
 * credential with a timestamp in it, so it must never be cached or prerendered.
 */

type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

const DEFAULT_STUN_URLS = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];
const DEFAULT_TTL_SECONDS = 3600;
/** Ephemeral credentials should not outlive a reasonable call setup. */
const MAX_REST_TTL_SECONDS = 20 * 60;

export async function GET() {
  // Marks this handler as request-time before any timestamp/random is taken.
  await connection();

  const ttl = clampTtl(numberEnv("ICE_TTL_SECONDS", DEFAULT_TTL_SECONDS));
  const iceServers: IceServer[] = [{ urls: listEnv("STUN_URLS", DEFAULT_STUN_URLS) }];

  const turnUrls = listEnv("TURN_URLS", []);
  const secret = stringEnv("TURN_SECRET");
  if (turnUrls.length > 0) {
    if (secret) {
      const expiry = Math.floor(Date.now() / 1000) + Math.min(ttl, MAX_REST_TTL_SECONDS);
      const username = `${expiry}:${randomBytes(8).toString("hex")}`;
      iceServers.push({
        urls: turnUrls,
        username,
        credential: createHmac("sha1", secret).update(username).digest("base64"),
      });
    } else {
      const username = stringEnv("TURN_USERNAME");
      const credential = stringEnv("TURN_CREDENTIAL");
      if (username && credential) iceServers.push({ urls: turnUrls, username, credential });
    }
  }

  return Response.json(
    { iceServers, ttl },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }
  );
}

function listEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

function stringEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampTtl(value: number): number {
  return Math.max(120, Math.min(Math.round(value), 12 * 60 * 60));
}
