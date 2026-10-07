"use client";

import {
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  PhoneOff,
  ScreenShareOff,
  Video,
  VideoOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ControlButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Highlighted = the feature is currently off / destructive. */
  tone?: "default" | "off" | "active" | "danger";
  disabled?: boolean;
  wide?: boolean;
};

export function ControlButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
  disabled = false,
  wide = false,
}: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={tone === "active"}
      className={cn(
        "group relative grid place-items-center rounded-full transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-brand/70 disabled:opacity-40 disabled:pointer-events-none",
        "active:scale-[0.96]",
        wide ? "size-14" : "size-11",
        tone === "default" && "bg-white/10 text-white hover:bg-white/20",
        tone === "active" && "bg-brand text-brand-foreground hover:bg-brand/90",
        tone === "off" && "bg-white/10 text-white ring-1 ring-inset ring-white/25 hover:bg-white/15",
        tone === "danger" && "bg-red-500 text-white hover:bg-red-500/90"
      )}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

export type ControlBarProps = {
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  canShareScreen: boolean;
  /** False when the user joined without a camera or microphone. */
  mediaAvailable: boolean;
  fullscreen: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleShare: () => void;
  onToggleFullscreen: () => void;
  onHangUp: () => void;
};

/** The single row of call controls: mic, camera, screen, fullscreen, leave. */
export function ControlBar({
  micEnabled,
  cameraEnabled,
  screenSharing,
  canShareScreen,
  mediaAvailable,
  fullscreen,
  onToggleMic,
  onToggleCamera,
  onToggleShare,
  onToggleFullscreen,
  onHangUp,
}: ControlBarProps) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/60 p-1.5 ring-1 ring-white/10 backdrop-blur-xl">
      <ControlButton
        icon={micEnabled ? Mic : MicOff}
        label={mediaAvailable ? (micEnabled ? "Mute microphone" : "Unmute microphone") : "No microphone in use"}
        tone={micEnabled ? "default" : "off"}
        onClick={onToggleMic}
        disabled={!mediaAvailable}
      />
      <ControlButton
        icon={cameraEnabled ? Video : VideoOff}
        label={mediaAvailable ? (cameraEnabled ? "Turn camera off" : "Turn camera on") : "No camera in use"}
        tone={cameraEnabled ? "default" : "off"}
        onClick={onToggleCamera}
        disabled={!mediaAvailable || screenSharing}
      />
      <ControlButton
        icon={screenSharing ? ScreenShareOff : MonitorUp}
        label={
          screenSharing
            ? "Stop sharing screen"
            : canShareScreen
              ? "Share your screen"
              : "Screen sharing is not available here"
        }
        tone={screenSharing ? "active" : "default"}
        onClick={onToggleShare}
        disabled={!canShareScreen && !screenSharing}
      />
      <ControlButton
        icon={fullscreen ? Minimize : Maximize}
        label={fullscreen ? "Exit full screen" : "Full screen"}
        onClick={onToggleFullscreen}
      />
      <ControlButton icon={PhoneOff} label="End call" tone="danger" wide onClick={onHangUp} />
    </div>
  );
}
