/**
 * ICE configuration.
 *
 * STUN is public and safe to hardcode as a fallback. TURN credentials are
 * minted by our own server route (`/api/ice`) from *server-only* environment
 * variables, so secrets never ship in the client bundle and the credentials we
 * hand out are short-lived.
 */

import type { PeerOptions } from "./types";

const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
];

/** Public override, useful for self-hosted deployments without a server route. */
const PUBLIC_STUN_URLS = (process.env.NEXT_PUBLIC_STUN_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

const PEERJS_HOST = process.env.NEXT_PUBLIC_PEERJS_HOST || undefined;
const PEERJS_PORT = Number(process.env.NEXT_PUBLIC_PEERJS_PORT || 0) || undefined;
const PEERJS_PATH = process.env.NEXT_PUBLIC_PEERJS_PATH || undefined;
const PEERJS_SECURE = process.env.NEXT_PUBLIC_PEERJS_SECURE
  ? process.env.NEXT_PUBLIC_PEERJS_SECURE === "true"
  : undefined;

type IceCache = { servers: RTCIceServer[]; expiresAt: number };

let cache: IceCache | null = null;

function fallbackServers(): RTCIceServer[] {
  const urls = PUBLIC_STUN_URLS.length > 0 ? PUBLIC_STUN_URLS : DEFAULT_STUN_URLS;
  return [{ urls }];
}

/**
 * Best-effort lookup of ICE servers. A failure here must never block a call,
 * so everything falls back to public STUN.
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.servers;

  try {
    const response = await fetch("/api/ice", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`ice endpoint responded ${response.status}`);

    const payload = (await response.json()) as {
      iceServers?: RTCIceServer[];
      ttl?: number;
    };
    const servers = Array.isArray(payload.iceServers) ? payload.iceServers : [];
    if (servers.length === 0) throw new Error("empty ice payload");

    const ttl = Math.max(120, Math.min(Number(payload.ttl ?? 3600), 86_400));
    // Refresh a minute early so credentials never expire mid-call.
    cache = { servers, expiresAt: Date.now() + (ttl - 60) * 1000 };
    return servers;
  } catch {
    cache = { servers: fallbackServers(), expiresAt: Date.now() + 60_000 };
    return cache.servers;
  }
}

/** Options passed to `new Peer(...)`. */
export async function buildPeerOptions(): Promise<PeerOptions> {
  const iceServers = await fetchIceServers();
  return {
    config: { iceServers, sdpSemantics: "unified-plan" },
    // PeerJS logs its own errors to the console; we surface them as messages,
    // so keep the library quiet unless someone explicitly asks for logs.
    debug: process.env.NEXT_PUBLIC_PEERJS_DEBUG === "true" ? 2 : 0,
    ...(PEERJS_HOST ? { host: PEERJS_HOST } : {}),
    ...(PEERJS_PORT ? { port: PEERJS_PORT } : {}),
    ...(PEERJS_PATH ? { path: PEERJS_PATH } : {}),
    ...(PEERJS_SECURE === undefined ? {} : { secure: PEERJS_SECURE }),
  };
}

/** WebRTC + getUserMedia availability check with a human-readable reason. */
export function describeWebRtcSupport(): string | null {
  if (typeof window === "undefined") return "This page must run in a browser.";
  if (!("RTCPeerConnection" in window)) {
    return "This browser does not support WebRTC. Try Chrome, Edge, Firefox or Safari.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return window.isSecureContext
      ? "Camera and microphone APIs are unavailable in this browser."
      : "Video calls need a secure (https) origin. Open this app over https or localhost.";
  }
  return null;
}
