/**
 * Tiny hand-rolled signalling protocol that runs over the PeerJS
 * DataConnection. Only ever used to exchange a display name, presence and
 * device state — no media, no personal data, nothing stored.
 */

export const PROTOCOL_VERSION = 1;

export type HelloSignal = { v: number; t: "hello"; name: string };
export type AcceptSignal = { v: number; t: "accept"; name: string };
export type BusySignal = { v: number; t: "busy" };
export type ByeSignal = { v: number; t: "bye" };
/** Asks the host to re-offer the media leg (ICE restart / new tracks). */
export type RemakeSignal = { v: number; t: "remake" };
/** This side has no camera or microphone, so it will not offer media. */
export type NoMediaSignal = { v: number; t: "nomedia" };
export type DeviceSignal = {
  v: number;
  t: "device";
  mic: boolean;
  camera: boolean;
  sharing: boolean;
};

export type Signal =
  | HelloSignal
  | AcceptSignal
  | BusySignal
  | ByeSignal
  | RemakeSignal
  | NoMediaSignal
  | DeviceSignal;

export type ConnectionMetadata = { v: number; name: string; code: string; role: "host" | "guest" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clipName(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 24) : "";
}

/** Defensive parse: anything unexpected on the wire is ignored, never trusted. */
export function parseSignal(raw: unknown): Signal | null {
  if (!isRecord(raw) || raw.v !== PROTOCOL_VERSION || typeof raw.t !== "string") return null;

  switch (raw.t) {
    case "hello":
    case "accept":
      return { v: PROTOCOL_VERSION, t: raw.t, name: clipName(raw.name) };
    case "busy":
    case "bye":
    case "remake":
    case "nomedia":
      return { v: PROTOCOL_VERSION, t: raw.t };
    case "device":
      return {
        v: PROTOCOL_VERSION,
        t: "device",
        mic: bool(raw.mic),
        camera: bool(raw.camera),
        sharing: bool(raw.sharing),
      };
    default:
      return null;
  }
}

export function deviceSignal(state: {
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
}): DeviceSignal {
  return {
    v: PROTOCOL_VERSION,
    t: "device",
    mic: state.micEnabled,
    camera: state.cameraEnabled,
    sharing: state.screenSharing,
  };
}

export function connectionMetadata(
  displayName: string,
  code: string,
  role: "host" | "guest"
): ConnectionMetadata {
  return { v: PROTOCOL_VERSION, name: displayName, code, role };
}

/** Extracts a display name from connection metadata, with a sane fallback. */
export function nameFromMetadata(metadata: unknown): string {
  if (!isRecord(metadata)) return "";
  return typeof metadata.name === "string" ? metadata.name.slice(0, 24) : "";
}
