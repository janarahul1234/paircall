/**
 * PeerCallEngine
 *
 * Owns everything WebRTC/PeerJS related for a single 1-to-1 call, outside of
 * React, so the state machine stays readable and testable:
 *
 *  - host registers a deterministic peer id derived from the call code
 *  - guest dials that id over a reliable DataConnection (signalling)
 *  - the host then offers the media leg; the guest answers with its own stream
 *  - one DataConnection + one MediaConnection exist at a time (max 2 people)
 *  - dropped legs are renegotiated before we give up; nothing is ever recorded
 *
 * Browser-only: instantiate from a client component, never during render on the
 * server (the constructor touches no browser APIs, `connect()` does).
 */

import type { DataConnection, MediaConnection, Peer as PeerInstance } from "peerjs";
import type { PeerOptions as PeerJsOptions } from "peerjs";
import { peerIdForCode } from "./code";
import { buildPeerOptions } from "./peer-config";
import {
  connectionMetadata,
  deviceSignal,
  nameFromMetadata,
  parseSignal,
  type Signal,
} from "./protocol";
import type { CallRole, CallState, EndReason, MediaBlock, NoticeTone } from "./types";

/** A host releases an unanswered, inactive call after this long. */
const HOST_IDLE_TIMEOUT_MS = 10 * 60_000;
/** Interaction in the waiting room postpones the expiry by this much. */
const HOST_TOUCH_THROTTLE_MS = 15_000;
/** How long a guest waits for a host to answer before giving up. */
const GUEST_DIAL_DEADLINE_MS = 15_000;
/** How long a host waits for a dropped participant to come back. */
const HOST_REJOIN_WINDOW_MS = 30_000;
/** How long a guest keeps re-dialling a host that disappeared. */
const GUEST_REDIAL_LIMIT = 4;
/** Grace period before we renegotiate a stalled ICE leg. */
const ICE_RECOVERY_GRACE_MS = 5_000;
/** Upper bound for media to arrive once two people are paired. */
const MEDIA_SETTLE_MS = 8_000;
const MEDIA_RENEGOTIATION_LIMIT = 3;
/** Signalling socket reconnect attempts before we declare failure. */
const SIGNAL_RETRY_LIMIT = 4;
/** After telling a third person the call is full, hold the socket this long. */
const BUSY_HOLD_MS = 2_000;
/** ...but never keep a refused channel alive longer than this. */
const BUSY_DEADLINE_MS = 15_000;
/** How long a freshly captured screen may stay muted before we send it anyway. */
const FIRST_FRAME_WAIT_MS = 2_000;

type Timer = ReturnType<typeof setTimeout>;

export type EngineConfig = { code: string; role: CallRole; localName: string };

const INITIAL_STATE: CallState = {
  status: "idle",
  role: "guest",
  code: "",
  localName: "",
  remoteName: null,
  localStream: null,
  remoteStream: null,
  micEnabled: false,
  cameraEnabled: false,
  screenSharing: false,
  remoteMicEnabled: true,
  remoteCameraEnabled: true,
  remoteScreenSharing: false,
  mediaBlock: null,
  endReason: null,
  startedAt: null,
  endedAt: null,
  expiresAt: null,
  notice: null,
};

export class PeerCallEngine {
  private state: CallState = { ...INITIAL_STATE };
  private listeners = new Set<() => void>();
  private timers = new Set<Timer>();

  private peer: PeerInstance | null = null;
  private data: DataConnection | null = null;
  private media: MediaConnection | null = null;
  /** Peer id of the remote side we are paired with. */
  private remotePeerId: string | null = null;

  private micTrack: MediaStreamTrack | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenStream: MediaStream | null = null;
  /** The single stream we hand to PeerJS; its video track is swapped in place. */
  private outbound: MediaStream | null = null;

  private teardown = true;
  private recovering = false;
  private negotiatedOnce = false;
  private networkWatched = false;
  private mediaRenegotiations = 0;
  private redialAttempts = 0;
  private signalRetries = 0;
  private unavailableRetries = 0;
  private noticeSeq = 0;

  private recoverTimer: Timer | null = null;
  private rejoinTimer: Timer | null = null;
  private redialTimer: Timer | null = null;
  private expiryTimer: Timer | null = null;
  private settleTimer: Timer | null = null;
  private dialDeadline: Timer | null = null;
  private lastTouched = 0;

  constructor(config: EngineConfig) {
    this.state = {
      ...INITIAL_STATE,
      role: config.role,
      code: config.code,
      localName: config.localName,
    };
  }

  /* ---------------------------------------------------------------- store -- */

  getSnapshot = (): CallState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(next: Partial<CallState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  private announce(tone: NoticeTone, text: string): void {
    this.noticeSeq += 1;
    this.patch({ notice: { id: this.noticeSeq, tone, text } });
  }

  private after(ms: number, fn: () => void): Timer {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.teardown) fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  private clear(...timers: (Timer | null)[]): void {
    for (const timer of timers) {
      if (timer) clearTimeout(timer);
    }
  }

  /* --------------------------------------------------------------- media -- */

  /** Requests camera + mic, degrading to audio-only / video-only when possible. */
  async startMedia(): Promise<void> {
    if (this.outbound) {
      this.patch({ status: "media-ready", mediaBlock: null });
      return;
    }
    this.patch({ status: "requesting-media", mediaBlock: null });

    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    const video: MediaTrackConstraints = {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
    };

    const attempts: MediaStreamConstraints[] = [
      { video, audio },
      { video: false, audio },
      { video, audio: false },
    ];

    let stream: MediaStream | null = null;
    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!stream) {
      this.patch({ status: "idle", mediaBlock: classifyMediaError(lastError) });
      return;
    }

    this.micTrack = stream.getAudioTracks()[0] ?? null;
    this.cameraTrack = stream.getVideoTracks()[0] ?? null;
    this.outbound = new MediaStream([
      ...(this.micTrack ? [this.micTrack] : []),
      ...(this.cameraTrack ? [this.cameraTrack] : []),
    ]);

    this.patch({
      status: "media-ready",
      localStream: this.outbound,
      micEnabled: this.micTrack?.enabled ?? false,
      cameraEnabled: this.cameraTrack?.enabled ?? false,
      mediaBlock: null,
    });
  }

  private stopLocalTracks(): void {
    for (const track of [this.micTrack, this.cameraTrack]) track?.stop();
    this.micTrack = null;
    this.cameraTrack = null;
    this.outbound?.getTracks().forEach((track) => track.stop());
    this.outbound = null;
  }

  private stopScreenShareTracks(): void {
    if (!this.screenStream) return;
    const track = this.screenStream.getVideoTracks()[0] ?? null;
    track?.removeEventListener("ended", this.handleScreenEnded);
    this.screenStream.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
  }

  toggleMic(): void {
    if (!this.micTrack) return;
    this.micTrack.enabled = !this.micTrack.enabled;
    this.patch({ micEnabled: this.micTrack.enabled });
    this.broadcastDeviceState();
  }

  toggleCamera(): void {
    if (!this.cameraTrack || this.state.screenSharing) return;
    this.cameraTrack.enabled = !this.cameraTrack.enabled;
    this.patch({ cameraEnabled: this.cameraTrack.enabled });
    this.broadcastDeviceState();
  }

  private broadcastDeviceState(): void {
    this.send(
      deviceSignal({
        micEnabled: this.state.micEnabled,
        cameraEnabled: this.state.cameraEnabled,
        screenSharing: this.state.screenSharing,
      })
    );
  }

  /* --------------------------------------------------------- screen share -- */

  async startScreenShare(): Promise<boolean> {
    if (this.screenStream) return true;
    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      // The user dismissed the picker: not an error worth surfacing.
      return false;
    }
    const track = display.getVideoTracks()[0];
    if (!track) return false;

    // Screen content is text and a cursor, not motion. Telling the encoder that
    // and capping the frame rate is what keeps a 1080p capture from stalling on
    // an ordinary upload; a rejected constraint simply leaves the defaults.
    track.contentHint = "detail";
    try {
      await track.applyConstraints({
        width: { max: 1920 },
        height: { max: 1080 },
        frameRate: { ideal: 15, max: 30 },
      });
    } catch {
      /* keep whatever the picker chose */
    }

    this.screenStream = display;
    track.addEventListener("ended", this.handleScreenEnded);
    this.swapOutboundVideo(track);
    this.patch({ screenSharing: true, localStream: this.outbound });
    this.broadcastDeviceState();
    this.announce("info", "You are now sharing your screen");
    return true;
  }

  stopScreenShare(): void {
    if (!this.screenStream) return;
    this.stopScreenShareTracks();
    this.swapOutboundVideo(this.cameraTrack);
    this.patch({ screenSharing: false });
    this.broadcastDeviceState();
    this.announce("info", "You stopped sharing your screen");
  }

  private handleScreenEnded = (): void => {
    if (this.screenStream) this.stopScreenShare();
  };

  /**
   * Swaps the outgoing video track on the live peer connection. Track
   * replacement normally needs no renegotiation, so the remote side never sees
   * a reconnect. The swap is asynchronous and can fail quietly, so the result
   * is verified by `applyOutboundVideo`.
   */
  private swapOutboundVideo(track: MediaStreamTrack | null): void {
    if (!this.outbound) this.outbound = new MediaStream();
    for (const existing of this.outbound.getVideoTracks()) this.outbound.removeTrack(existing);

    if (track) {
      // The camera keeps whatever on/off state the user picked; a screen is live.
      track.enabled = track === this.cameraTrack ? this.state.cameraEnabled : true;
      this.outbound.addTrack(track);
    }

    void this.applyOutboundVideo(track);
  }

  /**
   * Gets `track` onto the wire. Three outcomes, in order of preference:
   *
   *  1. the current video sender accepts it, which we confirm by reading the
   *     sender back, because a fulfilled `replaceTrack()` is not proof that the
   *     track is being sent,
   *  2. otherwise a fresh media leg is negotiated, which always includes the
   *     track we just put in the outbound stream,
   *  3. otherwise say so — a sharer must never be left believing their screen
   *     is visible when only they can see it.
   */
  private async applyOutboundVideo(track: MediaStreamTrack | null): Promise<void> {
    if (this.teardown) return;

    const sender = this.findVideoSender();
    if (sender) {
      if (track) await this.waitForFirstFrame(track);
      if (this.teardown) return;
      try {
        await sender.replaceTrack(track);
      } catch {
        /* verified below, then renegotiated */
      }
      if (sender.track === track) return;
    }

    if (!track) return;
    if (this.data?.open && this.peer?.open) {
      // No usable video send section: a new media leg has to be negotiated so
      // the track is actually included in the offer.
      this.inviteMedia();
      return;
    }
    this.announce("warning", "Your screen is not reaching the other person");
  }

  /**
   * Chrome hands out a display track that reports `muted` until its first real
   * frame. Replacing with it right away can leave the other side on the picture
   * it already had, so wait briefly for the frame and never longer.
   */
  private waitForFirstFrame(track: MediaStreamTrack): Promise<void> {
    if (!track.muted && track.readyState === "live") return Promise.resolve();

    return new Promise((resolve) => {
      const done = () => {
        track.removeEventListener("unmute", done);
        this.clear(timer);
        resolve();
      };
      const timer = this.after(FIRST_FRAME_WAIT_MS, done);
      track.addEventListener("unmute", done, { once: true });
    });
  }

  /**
   * The transceiver section that can put video on the wire. A `recvonly` or
   * `inactive` section will happily accept `replaceTrack()` and send nothing,
   * so direction is checked rather than guessed from the track alone.
   */
  private findVideoSender(): RTCRtpSender | null {
    const connection = this.media?.peerConnection;
    if (!connection) return null;

    const sendable = (entry: RTCRtpTransceiver) =>
      entry.direction === "sendrecv" || entry.direction === "sendonly";
    const isVideoSection = (entry: RTCRtpTransceiver) =>
      entry.sender.track?.kind === "video" ||
      (!entry.sender.track && entry.receiver.track?.kind === "video");

    const candidates = connection
      .getTransceivers()
      .filter((entry) => sendable(entry) && isVideoSection(entry));
    const alreadySending = candidates.find((entry) => entry.sender.track !== null);
    return (alreadySending ?? candidates[0])?.sender ?? null;
  }

  /** Remembers the partner's display name as soon as it is announced. */
  private handlePeerName(name: string): void {
    if (!name || this.state.remoteName === name) return;
    this.patch({ remoteName: name });
  }

  /* ------------------------------------------------------------- connect -- */

  setName(name: string): void {
    this.patch({ localName: name });
  }

  /**
   * The role is resolved from session storage after hydration, so it can only
   * be known from an effect. It is read again when we connect, which is the
   * first moment it matters.
   */
  setRole(role: CallRole): void {
    if (this.peer) return;
    this.patch({ role });
  }

  /** Boots the peer and, for a guest, dials the host. */
  async connect(): Promise<void> {
    if (this.peer) return;
    this.teardown = false;
    this.patch({ status: "starting", endReason: null });

    let Peer: typeof PeerInstance;
    try {
      ({ Peer } = await import("peerjs"));
    } catch {
      this.endCall("signaling-failed");
      return;
    }

    const options = await buildPeerOptions();
    const id = this.state.role === "host" ? peerIdForCode(this.state.code) : undefined;

    const peer = id ? new Peer(id, options as PeerJsOptions) : new Peer(options as PeerJsOptions);
    this.peer = peer;
    this.wirePeerLifecycle(peer);
    this.watchNetwork();

    if (this.state.role === "guest") {
      // Pre-register the host id so a fast guest doesn't race the host's offer.
      peer.on("open", () => {
        this.dial();
        this.armDialDeadline();
      });
    }
  }

  /**
   * A host that never answers (wrong code, closed tab) must not leave the guest
   * staring at a spinner: PeerJS does not reliably repeat `peer-unavailable`,
   * so this deadline is the guaranteed exit.
   */
  private armDialDeadline(): void {
    this.clear(this.dialDeadline);
    this.dialDeadline = this.after(GUEST_DIAL_DEADLINE_MS, () => {
      this.dialDeadline = null;
      if (this.teardown || this.data?.open) return;
      this.endCall(this.negotiatedOnce ? "peer-lost" : "invalid-code");
    });
  }

  /** Retry after a failure screen: rebuild the peer and dial again. */
  async rejoin(): Promise<void> {
    this.release();
    this.resetAttempts();
    this.patch(SHELVED);
    await this.startMedia();
    await this.connect();
  }

  private wirePeerLifecycle(peer: PeerInstance): void {
    peer.on("open", () => this.handlePeerOpen());

    peer.on("connection", (incoming) => this.acceptDataConnection(incoming));

    peer.on("call", (incoming) => this.answerMediaConnection(incoming));

    peer.on("disconnected", () => this.handleSignalingDrop());

    peer.on("close", () => {
      if (!this.teardown) this.endCall("signaling-failed");
    });

    peer.on("error", (error) => this.handlePeerError(error.type));
  }

  /** Reacts to the browser losing or regaining network access. */
  private watchNetwork(): void {
    if (this.networkWatched) return;
    this.networkWatched = true;
    window.addEventListener("offline", this.handleOffline);
    window.addEventListener("online", this.handleOnline);
  }

  /** Reacts to the signalling socket being (re)established. */
  private handlePeerOpen(): void {
    this.signalRetries = 0;
    if (this.teardown || this.state.status === "ended") return;

    if (this.state.role === "host") {
      // Only fall back to "waiting" when nobody is paired yet; a signalling
      // blip must not drop an established participant.
      if (!this.data) this.beginWaiting();
      return;
    }
    if (this.state.status === "reconnecting") this.patch({ status: "connecting" });
  }

  private beginWaiting(): void {
    if (this.state.role !== "host") return;
    this.patch({ status: "waiting" });
    this.armExpiry();
  }

  private armExpiry(): void {
    this.clear(this.expiryTimer);
    this.patch({ expiresAt: Date.now() + HOST_IDLE_TIMEOUT_MS });
    this.expiryTimer = this.after(HOST_IDLE_TIMEOUT_MS, () => {
      if (this.state.status === "waiting") this.endCall("expired");
    });
  }

  /**
   * Any interaction with the waiting screen keeps the code alive: an abandoned
   * call is one nobody is looking at, not merely one nobody joined.
   */
  touch(): void {
    if (this.state.status !== "waiting" || this.state.expiresAt === null) return;
    const now = Date.now();
    if (now - this.lastTouched < HOST_TOUCH_THROTTLE_MS) return;
    this.lastTouched = now;
    this.armExpiry();
  }

  /* ---------------------------------------------------------- data layer -- */

  private dial(): void {
    const peer = this.peer;
    if (!peer || this.teardown) return;
    if (this.data?.open) return;

    const connection = peer.connect(peerIdForCode(this.state.code), {
      label: "paircall",
      reliable: true,
      metadata: connectionMetadata(this.state.localName, this.state.code, "guest"),
    });
    // A guest knows the host's id up front, so it can offer media too.
    this.remotePeerId = connection.peer;
    this.attachDataConnection(connection);
  }

  private acceptDataConnection(connection: DataConnection): void {
    // A channel that is still negotiating already counts as the one partner we
    // allow, otherwise two near-simultaneous joiners could both take the slot.
    const occupied = this.data !== null;

    // Hard cap of two participants: refuse anyone else while we are paired.
    if (occupied && connection.peer !== this.remotePeerId) {
      this.refuseAsBusy(connection);
      return;
    }
    if (occupied) {
      // Stale duplicate from the same participant: drop the older channel.
      this.closeDataConnection();
    }

    this.remotePeerId = connection.peer;
    this.clear(this.rejoinTimer);
    // Metadata rides the connection request, so the name is known immediately.
    if (this.state.role === "host") this.handlePeerName(nameFromMetadata(connection.metadata));
    this.attachDataConnection(connection);
  }

  /**
   * Turns away a third person. `busy` can only travel once the channel opens,
   * which needs ICE to finish first, and closing discards anything still
   * queued — so refusing has to wait for the open and then hold the socket for
   * a moment. Doing it immediately leaves the newcomer with no explanation and
   * a channel that simply vanishes.
   */
  private refuseAsBusy(connection: DataConnection): void {
    let dropped = false;
    const drop = () => {
      if (dropped) return;
      dropped = true;
      safeClose(connection);
    };
    const announce = () => {
      if (dropped) return;
      writeSignal(connection, { v: 1, t: "busy" });
      this.after(BUSY_HOLD_MS, drop);
    };

    if (connection.open) announce();
    else connection.on("open", announce);
    // A channel that never finishes negotiating must not linger.
    this.after(BUSY_DEADLINE_MS, drop);
  }

  private attachDataConnection(connection: DataConnection): void {
    this.data = connection;
    // PeerJS keeps emitting on objects we already replaced; ignore those.
    const stale = () => this.data !== connection;

    connection.on("open", () => {
      if (stale()) return;
      // Deliberately not resetting `redialAttempts` here: a channel that opens
      // and is then closed would hand out a fresh retry budget every time and
      // the guest would never give up. Only real media counts as proof of a
      // working pair.
      this.signalRetries = 0;
      this.unavailableRetries = 0;
      this.clear(this.dialDeadline);
      this.dialDeadline = null;
      // Names and the media offer only travel once the channel is really open.
      if (this.state.role === "guest") {
        writeSignal(connection, { v: 1, t: "hello", name: this.state.localName });
      } else {
        writeSignal(connection, { v: 1, t: "accept", name: this.state.localName });
        if (this.outbound) this.inviteMedia();
        else {
          writeSignal(connection, { v: 1, t: "nomedia" });
          this.markMedialess();
        }
      }
      if (this.state.status !== "connected") {
        this.clear(this.expiryTimer);
        this.patch({ status: "connecting", expiresAt: null });
      }
      // Never leave someone hanging once they are paired: if no media shows up
      // (one side has no devices), settle into a connected call without it.
      this.clear(this.settleTimer);
      this.settleTimer = this.after(MEDIA_SETTLE_MS, () => {
        this.settleTimer = null;
        if (this.state.status === "connecting" && !this.state.remoteStream) this.markMedialess();
      });
      this.broadcastDeviceState();
    });

    connection.on("data", (raw) => {
      if (stale()) return;
      this.handleSignal(parseSignal(raw));
    });

    connection.on("close", () => {
      if (stale()) return;
      this.handleDataClosed();
    });
    connection.on("error", () => {
      if (stale()) return;
      this.handleDataClosed();
    });
  }

  private send(signal: Signal): void {
    writeSignal(this.data, signal);
  }

  private closeDataConnection(): void {
    const connection = this.data;
    this.data = null;
    try {
      connection?.close();
    } catch {
      /* already gone */
    }
  }

  private handleSignal(signal: Signal | null): void {
    if (!signal) return;
    switch (signal.t) {
      case "hello":
      case "accept":
        this.handlePeerName(signal.name);
        break;
      case "busy":
        this.endCall("occupied");
        break;
      case "bye":
        this.endCall("peer-ended");
        break;
      case "remake":
        // Whoever actually has a stream offers the media leg.
        if (this.outbound) this.inviteMedia();
        break;
      case "nomedia":
        // The other side cannot offer media; whoever can, does.
        if (this.outbound) this.inviteMedia();
        else this.markMedialess();
        break;
      case "device":
        this.patch({
          remoteMicEnabled: signal.mic,
          remoteCameraEnabled: signal.camera,
          remoteScreenSharing: signal.sharing,
        });
        break;
    }
  }

  private handleDataClosed(): void {
    if (this.teardown) return;
    this.data = null;

    if (this.state.role === "host") {
      const partner = this.state.remoteName;
      this.patch({ status: "reconnecting" });
      this.announce("warning", `${partner ?? "Your partner"} disconnected — waiting for them…`);
      this.rejoinTimer = this.after(HOST_REJOIN_WINDOW_MS, () => {
        if (this.state.status !== "reconnecting") return;
        this.remotePeerId = null;
        this.closeMediaConnection();
        this.patch({ remoteName: null, remoteStream: null });
        // Code stays alive, but go back to waiting for a fresh participant.
        this.beginWaiting();
        this.announce("info", "Waiting for someone to join");
      });
      return;
    }

    this.scheduleRedial();
  }

  private scheduleRedial(): void {
    if (this.teardown) return;
    if (this.redialAttempts >= GUEST_REDIAL_LIMIT) {
      this.endCall(this.negotiatedOnce ? "peer-lost" : "invalid-code");
      return;
    }
    this.redialAttempts += 1;
    this.patch({ status: "reconnecting" });
    this.announce("warning", "Lost contact with the host — reconnecting…");
    this.clear(this.redialTimer);
    this.redialTimer = this.after(1200 * this.redialAttempts, () => {
      if (this.peer?.disconnected) this.reconnectSignaling();
      else this.dial();
    });
  }

  /* ---------------------------------------------------------- media layer -- */

  private inviteMedia(): void {
    const peer = this.peer;
    if (!peer || !this.remotePeerId || this.teardown) return;
    // Nothing to send: stay on the data channel instead of offering empty media.
    if (!this.outbound) {
      this.markMedialess();
      return;
    }
    this.closeMediaConnection();
    const call = peer.call(this.remotePeerId, this.streamForCall(), {
      metadata: connectionMetadata(this.state.localName, this.state.code, this.state.role),
    });
    this.attachMediaConnection(call);
  }

  private answerMediaConnection(call: MediaConnection): void {
    // Only take media from the peer we deliberately paired with.
    if (this.remotePeerId && call.peer !== this.remotePeerId) {
      safeClose(call);
      return;
    }
    this.remotePeerId = call.peer;
    this.clear(this.rejoinTimer);
    this.closeMediaConnection();
    this.attachMediaConnection(call);
    call.answer(this.streamForCall());
  }

  private streamForCall(): MediaStream {
    return this.outbound ?? new MediaStream();
  }

  private attachMediaConnection(call: MediaConnection): void {
    this.media = call;
    // A replaced connection keeps firing events; only the current one matters.
    const stale = () => this.media !== call;

    call.on("stream", (stream) => {
      if (stale()) return;
      this.handleRemoteStream(stream);
    });
    call.on("close", () => {
      if (stale()) return;
      this.handleMediaClosed();
    });
    call.on("error", () => {
      if (stale()) return;
      this.handleMediaClosed();
    });
    call.on("iceStateChanged", (iceState) => {
      if (stale()) return;
      if (iceState === "disconnected" || iceState === "failed") this.scheduleRecovery();
      if (iceState === "connected") this.markLive();
    });

    call.peerConnection?.addEventListener("connectionstatechange", () => {
      if (stale()) return;
      this.handlePeerConnectionState();
    });
  }

  private handlePeerConnectionState = (): void => {
    const state = this.media?.peerConnection?.connectionState;
    if (state === "connected") this.markLive();
    if (state === "disconnected" || state === "failed") this.scheduleRecovery();
  };

  private markLive(): void {
    if (this.state.status === "connected") return;
    if (this.state.remoteStream) this.patch({ status: "connected" });
  }

  /**
   * Paired, but no picture or sound is travelling: still a live call, and
   * better than an endless "connecting" spinner.
   */
  private markMedialess(): void {
    if (this.teardown || this.state.status === "ended") return;
    this.negotiatedOnce = true;
    this.clear(this.expiryTimer);
    this.patch({
      status: "connected",
      startedAt: this.state.startedAt ?? Date.now(),
      expiresAt: null,
    });
    if (!this.outbound) {
      this.announce("info", "You are in the call without a camera or microphone");
    }
  }

  private handleRemoteStream(stream: MediaStream): void {
    this.recovering = false;
    this.mediaRenegotiations = 0;
    this.negotiatedOnce = true;
    // Two people genuinely exchange media, so any reconnect counting starts over.
    this.redialAttempts = 0;

    const previous = this.state.remoteStream;
    // PeerJS emits `stream` once per incoming track, so the very same stream
    // object arrives again for audio/video. Re-binding it is pointless and
    // would announce a recovery that never happened.
    if (previous === stream) {
      this.markLive();
      return;
    }
    // Anything else is a genuine first picture, or a new one after a recovery.
    this.patch({
      remoteStream: stream,
      status: "connected",
      startedAt: this.state.startedAt ?? Date.now(),
      expiresAt: null,
    });
    if (previous !== null) {
      this.announce("success", "Video is back");
    } else {
      const partner = this.state.remoteName;
      this.announce("success", partner ? `Connected with ${partner}` : "Connected");
    }
    // An established call is no longer an abandoned one.
    this.clear(this.expiryTimer);
  }

  private closeMediaConnection(): void {
    const call = this.media;
    this.media = null;
    try {
      call?.close();
    } catch {
      /* already gone */
    }
  }

  private handleMediaClosed(): void {
    if (this.teardown) return;
    this.media = null;

    // Expected while renegotiating a new media leg.
    if (this.recovering) {
      this.recovering = false;
      return;
    }
    if (!this.data?.open) {
      this.endCall(this.negotiatedOnce ? "peer-ended" : "peer-lost");
      return;
    }
    // Signalling is fine but media died: renegotiate instead of ending.
    this.patch({ remoteStream: null });
    this.scheduleRecovery();
  }

  private scheduleRecovery(): void {
    if (this.teardown || this.recoverTimer) return;
    if (this.state.status === "ended" || this.state.status === "idle") return;
    // Only a call that was actually live deserves a "hiccup" message.
    if (this.state.status === "connected") {
      this.patch({ status: "reconnecting" });
      this.announce("warning", "Connection hiccup — reconnecting…");
    }

    this.recoverTimer = this.after(ICE_RECOVERY_GRACE_MS, () => {
      this.recoverTimer = null;
      const live = this.media?.peerConnection?.connectionState === "connected";
      if (live || this.state.status === "connected") return;
      this.requestMediaRenegotiation();
    });
  }

  private requestMediaRenegotiation(): void {
    if (this.teardown) return;
    if (this.mediaRenegotiations >= MEDIA_RENEGOTIATION_LIMIT) {
      this.endCall("reconnect-failed");
      return;
    }
    this.mediaRenegotiations += 1;
    this.recovering = true;
    this.patch({ status: "reconnecting" });

    // A fresh offer is effectively an ICE restart. Either side can make it, so
    // the one holding a stream does; the other just asks for one.
    if (this.outbound) {
      this.inviteMedia();
      return;
    }
    this.send({ v: 1, t: "remake" });
    if (!this.data?.open) this.scheduleRedial();
  }

  /* ------------------------------------------------------- signaling glue -- */

  private handleSignalingDrop(): void {
    if (this.teardown) return;
    this.announce("warning", "Lost the signalling connection — retrying…");
    this.reconnectSignaling();
  }

  private reconnectSignaling(): void {
    const peer = this.peer;
    if (!peer || !peer.disconnected || this.teardown) return;
    if (this.signalRetries >= SIGNAL_RETRY_LIMIT) {
      this.endCall("signaling-failed");
      return;
    }
    this.signalRetries += 1;
    this.patch({ status: "reconnecting" });
    try {
      peer.reconnect();
    } catch {
      this.endCall("signaling-failed");
      return;
    }
    this.after(4000, () => {
      if (this.peer?.disconnected) this.reconnectSignaling();
    });
  }

  private handleOffline = (): void => {
    if (this.teardown || this.state.status === "ended") return;
    this.announce("danger", "You appear to be offline");
    if (this.state.status !== "idle") this.patch({ status: "reconnecting" });
  };

  private handleOnline = (): void => {
    if (this.teardown || this.state.status === "ended") return;
    this.announce("success", "Back online — restoring the call");
    if (this.peer?.disconnected) this.reconnectSignaling();
    else if (this.state.role === "guest" && !this.data?.open) this.dial();
    else this.requestMediaRenegotiation();
  };

  private handlePeerError(type: string): void {
    switch (type) {
      case "peer-unavailable":
        // The host id is gone. Retry a couple of times first: the host may be
        // mid-refresh rather than actually finished.
        if (this.state.role === "guest" && !this.negotiatedOnce && this.unavailableRetries < 2) {
          this.unavailableRetries += 1;
          this.patch({ status: "connecting" });
          this.announce("info", "That call is not answering yet — trying again…");
          this.after(1500, () => this.dial());
          break;
        }
        this.endCall(this.negotiatedOnce ? "peer-lost" : "invalid-code");
        break;
      case "unavailable-id":
        // Someone already owns this code (a stale tab, or a colliding code).
        this.endCall(this.state.role === "host" ? "code-taken" : "signaling-failed");
        break;
      case "browser-incompatible":
        this.patch({ mediaBlock: "unsupported" });
        this.endCall("media-failed");
        break;
      case "ssl-unavailable":
      case "invalid-id":
      case "invalid-key":
        this.endCall("signaling-failed");
        break;
      case "disconnected":
      case "socket-closed":
        // Handled by the reconnect path; the peer is still usable.
        break;
      case "network":
      case "server-error":
      case "socket-error":
        if (this.state.role === "guest" && !this.negotiatedOnce) {
          this.scheduleRedial();
          break;
        }
        this.handleSignalingDrop();
        break;
      case "webrtc":
        this.requestMediaRenegotiation();
        break;
      default:
        this.endCall("signaling-failed");
    }
  }

  /* ------------------------------------------------------------- closing -- */

  hangUp(): void {
    if (this.state.status === "ended") return;
    this.send({ v: 1, t: "bye" });
    this.teardown = true;
    this.endCall("you-ended");
  }

  private endCall(reason: EndReason): void {
    if (this.state.status === "ended") return;
    this.release();
    this.patch({
      status: "ended",
      endReason: reason,
      localStream: null,
      remoteStream: null,
      screenSharing: false,
      endedAt: this.state.startedAt ? Date.now() : null,
      expiresAt: null,
    });
  }

  /**
   * Releases everything the engine holds: peer, connections, camera, mic,
   * screen capture and timers. The object stays usable so `rejoin()` can start
   * over without re-mounting the component.
   */
  private release(): void {
    if (this.state.status !== "ended") this.send({ v: 1, t: "bye" });
    this.teardown = true;
    this.clear(...Array.from(this.timers));
    this.timers.clear();
    this.recoverTimer =
      this.rejoinTimer =
      this.redialTimer =
      this.expiryTimer =
      this.settleTimer =
      this.dialDeadline =
        null;
    this.closeMediaConnection();
    this.closeDataConnection();
    this.stopScreenShareTracks();
    this.stopLocalTracks();
    this.destroyPeer();
    window.removeEventListener("offline", this.handleOffline);
    window.removeEventListener("online", this.handleOnline);
    this.networkWatched = false;
  }

  private resetAttempts(): void {
    this.mediaRenegotiations = 0;
    this.redialAttempts = 0;
    this.signalRetries = 0;
    this.unavailableRetries = 0;
    this.recovering = false;
    this.negotiatedOnce = false;
  }

  private destroyPeer(): void {
    const peer = this.peer;
    this.peer = null;
    this.remotePeerId = null;
    if (!peer || peer.destroyed) return;
    try {
      peer.destroy();
    } catch {
      /* nothing left to clean */
    }
  }

  /**
   * Called from the component's effect cleanup. Never touches the camera or a
   * socket if the call was never started, so a development remount (or the
   * route being hidden by Cache Components) is completely free.
   */
  suspend(): void {
    if (!this.peer && !this.outbound) return;
    this.release();
    this.resetAttempts();
    this.patch(SHELVED);
  }
}

/** Where the engine lands once it is suspended or reset. */
const SHELVED: Partial<CallState> = {
  status: "idle",
  localStream: null,
  remoteStream: null,
  remoteName: null,
  screenSharing: false,
  expiresAt: null,
  startedAt: null,
  endedAt: null,
  endReason: null,
  notice: null,
};

/** A data connection may not be open yet; queued sends are simply dropped. */
function writeSignal(connection: DataConnection | null, signal: Signal): void {
  if (!connection?.open) return;
  try {
    connection.send(signal);
  } catch {
    /* the channel is closing */
  }
}

function safeClose(connection: { close(): void }): void {
  try {
    connection.close();
  } catch {
    /* already closed */
  }
}

/** Maps a getUserMedia failure onto a message the UI can show. */
function classifyMediaError(error: unknown): MediaBlock {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: string }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return window.isSecureContext ? "denied" : "insecure";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no-devices";
    case "NotReadableError":
    case "AbortError":
      return "busy";
    default:
      return typeof navigator.mediaDevices?.getUserMedia === "function" ? "busy" : "unsupported";
  }
}
