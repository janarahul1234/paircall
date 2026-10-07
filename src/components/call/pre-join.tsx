"use client";

import { LoaderCircle, Mic, MicOff, SquarePen, TriangleAlert, Video, VideoOff } from "lucide-react";
import { Avatar } from "./avatar";
import { CodeShare } from "./code-share";
import { ControlButton } from "./control-bar";
import { VideoSurface } from "./video-surface";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { describeMediaBlock } from "@/lib/call/copy";
import type { CallRole, CallState } from "@/lib/call/types";
import { cn } from "@/lib/utils";

/**
 * The gate before media starts flowing: permission handling, camera preview,
 * device toggles, the name you will appear as and the join action.
 */
export function PreJoin({
  state,
  role,
  onJoin,
  onToggleMic,
  onToggleCamera,
  onRetryMedia,
  onChangeName,
}: {
  state: CallState;
  role: CallRole;
  onJoin: () => void;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onRetryMedia: () => void;
  onChangeName: () => void;
}) {
  const { mediaBlock, status, localName } = state;
  const blocked = mediaBlock !== null;
  const requesting = status === "requesting-media";
  const starting = status === "starting" || status === "connecting";

  const headline =
    role === "host" ? "Your call is ready" : `Joining ${state.code}`;
  const subline =
    role === "host"
      ? "Share the code or link below. Your camera stays off until you press Start."
      : "Check your camera and microphone, then join. Two people maximum.";

  return (
    <div className="grid w-full max-w-4xl gap-4 sm:gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black/50 ring-1 ring-white/10">
        {blocked ? (
          <NoCamera name={localName} />
        ) : (
          <VideoSurface stream={state.localStream} muted mirrored className="absolute inset-0" />
        )}

        {(requesting || !state.localStream) && !blocked && (
          <div className="absolute inset-0 grid place-items-center bg-stage/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 text-center">
              <LoaderCircle aria-hidden className="size-6 animate-spin text-brand" />
              <p className="max-w-[16rem] text-sm text-white/70">
                {requesting
                  ? "Your browser is asking for camera and microphone access."
                  : "Preparing your camera…"}
              </p>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3">
          <ControlButton
            icon={state.micEnabled ? Mic : MicOff}
            label={state.micEnabled ? "Mute microphone" : "Unmute microphone"}
            tone={state.micEnabled ? "default" : "off"}
            onClick={onToggleMic}
            disabled={blocked}
          />
          <ControlButton
            icon={state.cameraEnabled ? Video : VideoOff}
            label={state.cameraEnabled ? "Turn camera off" : "Turn camera on"}
            tone={state.cameraEnabled ? "default" : "off"}
            onClick={onToggleCamera}
            disabled={blocked}
          />
        </div>

        {state.localStream && !requesting && (
          <span className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white/85 backdrop-blur">
            {localName} (you)
          </span>
        )}
      </div>

      <Panel>
        {blocked ? (
          <PermissionBlocked onRetry={onRetryMedia} onJoin={onJoin} block={mediaBlock} />
        ) : (
          <>
            <PanelTitle title={headline} subtitle={subline} />

            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={localName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{localName}</p>
                  <p className="text-xs text-muted-foreground">Your display name</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onChangeName}
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <SquarePen aria-hidden className="size-3.5" />
                Change
              </button>
            </div>

            {role === "host" && (
              <div className="mt-5 rounded-2xl border border-border/70 p-4">
                <CodeShare code={state.code} />
              </div>
            )}

            <Button
              type="button"
              onClick={onJoin}
              disabled={starting || !state.localStream}
              className={cn(
                "mt-5 h-12 w-full rounded-xl text-sm font-semibold",
                "bg-brand text-brand-foreground hover:bg-brand/90"
              )}
            >
              {starting ? (
                <>
                  <LoaderCircle aria-hidden className="animate-spin" />
                  Connecting…
                </>
              ) : role === "host" ? (
                "Start call"
              ) : (
                "Join call"
              )}
            </Button>

            <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">
              Nothing is recorded. Your partner sees your camera only while the call is open.
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}

function NoCamera({ name }: { name: string }) {
  return (
    <div className="grid h-full place-items-center bg-stage">
      <Avatar name={name} size="lg" />
    </div>
  );
}

function PermissionBlocked({
  block,
  onRetry,
  onJoin,
}: {
  block: CallState["mediaBlock"];
  onRetry: () => void;
  onJoin: () => void;
}) {
  const copy = describeMediaBlock(block ?? "unsupported");
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold tracking-tight">{copy.title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <Button
        type="button"
        onClick={onRetry}
        className="h-11 w-full rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand/90"
      >
        Try again
      </Button>
      {/* No camera is not a reason to miss a call: joining without devices
          still lets you listen and talk through the other person's audio. */}
      <Button
        type="button"
        onClick={onJoin}
        variant="ghost"
        className="h-11 w-full rounded-xl text-sm font-medium"
      >
        Join without camera or microphone
      </Button>
    </div>
  );
}
