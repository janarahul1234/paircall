/**
 * Shared, dependency-free types for a call session. Kept free of `peerjs`
 * imports so the same module can be safely evaluated on the server.
 */

export type CallRole = "host" | "guest";

export type CallStatus =
  /** Nothing started yet. */
  | "idle"
  /** getUserMedia is in flight. */
  | "requesting-media"
  /** Devices ready: show the pre-join screen. */
  | "media-ready"
  /** Registering the peer / dialling the host. */
  | "starting"
  /** Host is live and nobody has joined yet. */
  | "waiting"
  /** A participant is present but media has not flowed yet. */
  | "connecting"
  | "connected"
  /** Signalling or ICE dropped; recovery in progress. */
  | "reconnecting"
  /** Terminal state. `endReason` explains why. */
  | "ended";

export type EndReason =
  | "you-ended"
  | "peer-ended"
  | "peer-lost"
  | "expired"
  | "occupied"
  | "invalid-code"
  | "code-taken"
  | "signaling-failed"
  | "media-failed"
  | "reconnect-failed";

export type MediaBlock = "denied" | "no-devices" | "busy" | "insecure" | "unsupported";

export type NoticeTone = "info" | "success" | "warning" | "danger";

export type Notice = { id: number; tone: NoticeTone; text: string };

/** Structural subset of `peerjs`' PeerOptions, so we can import type-only. */
export type PeerOptions = {
  config?: { iceServers: RTCIceServer[]; sdpSemantics?: string };
  debug?: number;
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
};

export type CallState = {
  status: CallStatus;
  role: CallRole;
  code: string;
  localName: string;
  remoteName: string | null;
  /** What the local tile shows: the camera, or the shared screen. */
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  remoteMicEnabled: boolean;
  remoteCameraEnabled: boolean;
  remoteScreenSharing: boolean;
  mediaBlock: MediaBlock | null;
  endReason: EndReason | null;
  /** `connected` at this epoch ms, null until media flows. */
  startedAt: number | null;
  /** Epoch ms the call stopped, for the length shown on the end screen. */
  endedAt: number | null;
  /** Epoch ms when an unanswered call is released (host only). */
  expiresAt: number | null;
  notice: Notice | null;
};
