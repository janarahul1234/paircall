# Paircall

Private 1-to-1 video calls with no accounts, no installs and nothing recorded:
**enter a name → create or enter a code → check your camera → talk.**

Audio and video travel directly between the two browsers over WebRTC (PeerJS).
The Next.js server only serves the app and hands out ICE configuration.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000
npm run build && npm start
npm run lint
npm run test:e2e        # two-peer pairing test (downloads Chromium on first run)
```

Camera and microphone access requires a secure origin: `https://`, or
`http://localhost` for development.

`npm run test:e2e` drives the real flow with Playwright: three separate browser
contexts (host, guest, and a third person who must be refused) pairing over
WebRTC with Chromium's fake camera and microphone, then asserting the partner
name chip, the running clock, and an actual incoming video track on both sides.

## How a call works

1. `Create new call` mints a 7-character code from `crypto.getRandomValues`
   (unambiguous alphabet, no `I O L 0 1`) and navigates to `/call/<CODE>`.
2. The host registers a PeerJS peer whose id is derived from the code, so the
   code *is* the only thing a partner needs.
3. A partner opens the link (or types the code) and connects a reliable
   `DataConnection` carrying a tiny JSON signal set: `hello`, `accept`,
   `busy`, `bye`, `remake`, `nomedia`, `device`.
4. The host then offers the media leg with `peer.call()`; the partner answers
   with its own stream. One media connection carries both directions.
5. Screen sharing uses `sender.replaceTrack()`, so switching between camera and
   screen never renegotiates and never drops the call.

Two people is a hard limit: while a participant is paired, the host replies
`busy` to anybody else and closes that channel.

**Expiry without a database.** Nothing about a call is stored server-side; a
code lives exactly as long as the host's peer socket lives. A host whose
waiting screen sees no interaction for 10 minutes releases its code (any
interaction postpones that), and closing the tab frees the id immediately, so
stale codes cannot be joined.

## State

| Where | What |
| --- | --- |
| `src/lib/call/engine.ts` | PeerJS/WebRTC state machine: pairing, media, screen share, ICE recovery, signalling reconnect, cleanup. Framework-free. |
| `src/lib/call/use-call-engine.ts` | `useSyncExternalStore` bridge into React. |
| `src/lib/call/{code,protocol,peer-config,session,copy,types}.ts` | Codes, signalling messages, ICE/PeerJS options, session storage, user-facing copy, shared types. |
| `src/app/api/ice/route.ts` | Server-only ICE endpoint (STUN + TURN credentials). |
| `src/components/lobby/*` | Name step, create/join actions. |
| `src/components/call/*` | Pre-join preview, stage, controls, waiting/connecting/ended screens. |
| `tests/pairing.spec.ts` | Multi-context end-to-end pairing test (dev-only, not bundled). |

Display names are kept in `sessionStorage` for the current tab only, and are
sent once to the person you connect with. No media is ever recorded, buffered to
disk, or uploaded.

## Environment

Copy `.env.example` to `.env.local`. Everything is optional — with no
variables the app uses PeerJS's public signalling cloud and Google STUN.

Server-side (never bundled to the client), read by `/api/ice`:

| Variable | Purpose |
| --- | --- |
| `STUN_URLS` | Comma-separated STUN list. |
| `TURN_URLS` | Comma-separated TURN URLs (`turn:` / `turns:`). |
| `TURN_SECRET` | Shared secret → per-call ephemeral credentials (TURN REST API, RFC 9359). Preferred. |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | Static credentials, if your relay cannot do ephemeral ones. |
| `ICE_TTL_SECONDS` | Credential lifetime (default 3600). |

Public (inlined at build time): `NEXT_PUBLIC_STUN_URLS` (fallback when
`/api/ice` is unreachable), `NEXT_PUBLIC_PEERJS_HOST` / `_PORT` / `_PATH` /
`_SECURE` (self-hosted PeerServer), `NEXT_PUBLIC_PEERJS_DEBUG=true` for PeerJS
console logs.

## Reliability

Handled explicitly: permission denied / no devices / device busy (with a
"join without camera or microphone" path), invalid code, expired code, call
already occupied, host unreachable, signalling socket drops (`peer.reconnect()`
with backoff), ICE `disconnected`/`failed` (renegotiate a fresh media leg up to
three times), browser offline/online, and a partner who leaves and comes back
within a 30 second window.

## Deploying

Deploy behind HTTPS as usual. If peers are behind symmetric NATs, configure a
TURN relay (`TURN_URLS` + `TURN_SECRET`, e.g. coturn with
`use-auth-secret`/`static-auth-secret`) — without a relay some corporate and
mobile networks cannot connect. If you self-host `peerjs-server`, point the
`NEXT_PUBLIC_PEERJS_*` variables at it and tighten `connect-src` in
`next.config.ts` to that host.
