import type { CallStatus, EndReason, MediaBlock, NoticeTone } from "./types";

export type Copy = { title: string; body: string; tone: NoticeTone };

const PARTNER = "the other person";

export const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Not started",
  "requesting-media": "Checking devices",
  "media-ready": "Ready to join",
  starting: "Connecting",
  waiting: "Waiting for participant",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  ended: "Call ended",
};

function who(remoteName: string | null): string {
  return remoteName?.trim() || PARTNER;
}

export function describeEnd(reason: EndReason, remoteName: string | null): Copy {
  switch (reason) {
    case "you-ended":
      return {
        title: "You left the call",
        body: `The connection to ${who(remoteName)} was closed.`,
        tone: "info",
      };
    case "peer-ended":
      return {
        title: `${who(remoteName)} hung up`,
        body: "The call ended and the video link is closed.",
        tone: "info",
      };
    case "peer-lost":
      return {
        title: `${who(remoteName)} disconnected`,
        body: "Their connection dropped and did not come back. Nothing was recorded.",
        tone: "warning",
      };
    case "expired":
      return {
        title: "This call expired",
        body: "Nobody joined and the waiting screen saw no activity for 10 minutes, so the code was released.",
        tone: "warning",
      };
    case "occupied":
      return {
        title: "This call already has two people",
        body: `${who(remoteName)} is already in this call. Paircall only supports 1-to-1 calls.`,
        tone: "warning",
      };
    case "invalid-code":
      return {
        title: "We couldn't find that call",
        body: "The code is wrong, or the call it belonged to has already ended.",
        tone: "danger",
      };
    case "code-taken":
      return {
        title: "That code is already in use",
        body: "Another call is holding this code. Create a new call to get a fresh one.",
        tone: "danger",
      };
    case "signaling-failed":
      return {
        title: "Connection to the call service failed",
        body: "We couldn't reach the signalling server. Check your network and try again.",
        tone: "danger",
      };
    case "media-failed":
      return {
        title: "Video could not be established",
        body: "The browsers couldn't open a peer-to-peer media path. Retrying over a relay usually fixes this.",
        tone: "danger",
      };
    case "reconnect-failed":
      return {
        title: "Reconnection attempts ran out",
        body: "Your network stayed unreachable for too long, so the call was closed.",
        tone: "danger",
      };
  }
}

export function describeMediaBlock(block: MediaBlock): Copy {
  switch (block) {
    case "denied":
      return {
        title: "Camera and microphone access was blocked",
        body: "Allow camera and microphone permission for this site in your browser settings, then try again.",
        tone: "danger",
      };
    case "no-devices":
      return {
        title: "No camera or microphone found",
        body: "Plug in a device (or accept the browser prompt) and try again. You can still wait in the call for the other person.",
        tone: "warning",
      };
    case "busy":
      return {
        title: "Your camera or microphone is in use",
        body: "Another app is holding the device. Close it, then try again.",
        tone: "warning",
      };
    case "insecure":
      return {
        title: "This page is not secure",
        body: "Browsers only allow camera access over https. Open this app through an https URL.",
        tone: "danger",
      };
    case "unsupported":
      return {
        title: "Your browser can't do video calls",
        body: "Use a current version of Chrome, Edge, Firefox or Safari.",
        tone: "danger",
      };
  }
}
