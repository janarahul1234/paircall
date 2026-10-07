"use client";

import { Clock, Lock, MicOff, MonitorUp, UserRound } from "lucide-react";
import { Avatar } from "./avatar";
import { CodeShare } from "./code-share";
import { ControlBar } from "./control-bar";
import { NoticeToast } from "./notice-toast";
import { StatusPill } from "./status-pill";
import { VideoSurface } from "./video-surface";
import { formatDuration } from "@/lib/format";
import type { CallState } from "@/lib/call/types";
import { cn } from "@/lib/utils";

/** Meet-style stage: remote video large, local preview floating. */
export function CallStage({
  state,
  now,
  canShareScreen,
  fullscreen,
  stageRef,
  onToggleMic,
  onToggleCamera,
  onToggleShare,
  onToggleFullscreen,
  onHangUp,
  onActivity,
}: {
  state: CallState;
  now: number;
  canShareScreen: boolean;
  fullscreen: boolean;
  stageRef: React.RefObject<HTMLDivElement | null>;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleShare: () => void;
  onToggleFullscreen: () => void;
  onHangUp: () => void;
  /** Keeps an unanswered call alive while the host is actually present. */
  onActivity: () => void;
}) {
  const { remoteName, localName, status } = state;
  const partner = remoteName ?? "Your partner";
  // A participant who muted their camera is still visible if they share a screen.
  const remoteVisible = state.remoteCameraEnabled || state.remoteScreenSharing;
  const showRemoteVideo = status === "connected" && state.remoteStream !== null && remoteVisible;
  const localVisible = state.cameraEnabled || state.screenSharing;

  return (
    <div
      ref={stageRef}
      className="relative flex flex-1 flex-col overflow-hidden bg-stage"
    >
      {/* ---------------------------------------------------------- main tile */}
      <div className="relative flex-1">
        {showRemoteVideo ? (
          <VideoSurface
            stream={state.remoteStream}
            contain={state.remoteScreenSharing}
            className="absolute inset-0"
          />
        ) : (
          <IdleTile
            state={state}
            now={now}
            partner={partner}
            localName={localName}
            onActivity={onActivity}
          />
        )}

        {/* remote identity, always readable over video */}
        {(state.remoteStream || remoteName) && status !== "waiting" && (
          <NameChip
            name={remoteName ?? "Connecting"}
            muted={!state.remoteMicEnabled}
            sharing={state.remoteScreenSharing}
            className="absolute bottom-4 left-4"
          />
        )}

        {/* header strip */}
        <div className="absolute top-0 right-0 left-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <StatusPill status={status} />
            <span className="hidden items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white/70 ring-1 ring-white/10 backdrop-blur sm:inline-flex">
              <Lock aria-hidden className="size-3" />
              <span className="font-mono tracking-[0.16em]">{state.code}</span>
            </span>
          </div>
          <CallClock state={state} now={now} />
        </div>

        {/* local floating preview */}
        <div className="absolute right-3 bottom-28 z-10 w-28 aspect-video overflow-hidden rounded-2xl bg-black/40 shadow-2xl ring-1 ring-white/15 sm:right-4 sm:w-44 md:w-52">
          {state.localStream && localVisible ? (
            <VideoSurface
              stream={state.localStream}
              muted
              mirrored={!state.screenSharing}
              contain={state.screenSharing}
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Avatar name={localName} size="sm" />
            </div>
          )}
          <span className="absolute bottom-1 left-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
            {state.screenSharing ? "Your screen" : `${localName} (you)`}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------ footer */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        <NoticeToast notice={state.notice} />
        <div className="pointer-events-auto">
          <ControlBar
            micEnabled={state.micEnabled}
            cameraEnabled={state.cameraEnabled}
            screenSharing={state.screenSharing}
            canShareScreen={canShareScreen}
            mediaAvailable={state.localStream !== null}
            fullscreen={fullscreen}
            onToggleMic={onToggleMic}
            onToggleCamera={onToggleCamera}
            onToggleShare={onToggleShare}
            onToggleFullscreen={onToggleFullscreen}
            onHangUp={onHangUp}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces -- */

/** Everything the stage shows while there is no remote picture yet. */
function IdleTile({
  state,
  now,
  partner,
  localName,
  onActivity,
}: {
  state: CallState;
  now: number;
  partner: string;
  localName: string;
  onActivity: () => void;
}) {
  const { status, remoteName } = state;
  const visible = state.remoteCameraEnabled || state.remoteScreenSharing;

  if (status === "waiting") {
    return (
      <div
        className="absolute inset-0 grid place-items-center px-4 py-16"
        onPointerMove={onActivity}
        onPointerDown={onActivity}
        onKeyDown={onActivity}
      >
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <Avatar name={localName} size="lg" pulse />
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Waiting for someone to join
            </h2>
            <p className="text-sm text-white/60">
              You are in as{" "}
              <span className="font-medium text-white/85">{localName}</span>. Send the code or link
              below to one other person.
            </p>
          </div>
          <div className="w-full rounded-2xl bg-black/35 p-4 ring-1 ring-white/10 backdrop-blur">
            <CodeShare code={state.code} />
          </div>
          <ExpiryCountdown state={state} now={now} />
        </div>
      </div>
    );
  }

  if (status === "connected" && !visible) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-stage px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <Avatar name={remoteName ?? "?"} size="lg" />
          <p className="text-sm text-white/60">
            {partner} turned their camera off — you can still hear each other.
          </p>
        </div>
      </div>
    );
  }

  const message =
    status === "reconnecting"
      ? `Reconnecting to ${partner}…`
      : status === "connected"
        ? `${partner} isn't sending video — audio only`
        : remoteName
          ? `Connecting with ${remoteName}…`
          : "Connecting to the call…";

  return (
    <div className="absolute inset-0 grid place-items-center bg-stage px-4">
      <div className="flex flex-col items-center gap-5 text-center">
        <Avatar name={remoteName ?? "?"} size="lg" pulse={status !== "reconnecting"} />
        <div className="space-y-1">
          <p className="text-base font-medium text-white/90">{message}</p>
          <p className="text-sm text-white/50">
            {status === "reconnecting"
              ? "Your video comes back automatically once the network does."
              : "Video goes straight between the two browsers — nothing is relayed or stored."}
          </p>
        </div>
      </div>
    </div>
  );
}

function CallClock({ state, now }: { state: CallState; now: number }) {
  if (!state.startedAt) return <span className="w-14" />;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 font-mono text-xs text-white/75 tabular-nums ring-1 ring-white/10 backdrop-blur">
      <Clock aria-hidden className="size-3" />
      {formatDuration(now - state.startedAt)}
    </span>
  );
}

/** Host-only: how long an unanswered call stays open. */
function ExpiryCountdown({ state, now }: { state: CallState; now: number }) {
  if (!state.expiresAt) return null;
  const left = Math.max(0, state.expiresAt - now);
  return (
    <p className={cn("text-xs", left < 60_000 ? "text-amber-400" : "text-white/45")}>
      {left <= 0
        ? "Releasing this code…"
        : `Expires in ${formatDuration(left)} without activity — this screen keeps it alive`}
    </p>
  );
}

function NameChip({
  name,
  muted = false,
  sharing = false,
  className,
}: {
  name: string;
  muted?: boolean;
  sharing?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-[60vw] items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-sm font-medium text-white/90 ring-1 ring-white/10 backdrop-blur",
        className
      )}
    >
      {muted || sharing ? (
        sharing ? (
          <MonitorUp aria-hidden className="size-3.5 shrink-0 text-brand" />
        ) : (
          <MicOff aria-hidden className="size-3.5 shrink-0 text-amber-400" />
        )
      ) : (
        <UserRound aria-hidden className="size-3.5 shrink-0 text-white/45" />
      )}
      <span className="truncate">{name}</span>
    </div>
  );
}
