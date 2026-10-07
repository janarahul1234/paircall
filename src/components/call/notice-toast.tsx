"use client";

import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { Notice, NoticeTone } from "@/lib/call/types";
import { cn } from "@/lib/utils";

const TONE: Record<NoticeTone, { ring: string; icon: string }> = {
  info: { ring: "ring-white/12", icon: "text-white/70" },
  success: { ring: "ring-emerald-400/30", icon: "text-emerald-400" },
  warning: { ring: "ring-amber-400/30", icon: "text-amber-400" },
  danger: { ring: "ring-destructive/40", icon: "text-red-400" },
};

/**
 * Transient connection and participant messages ("Ana joined", "Reconnecting…").
 * The whole lifecycle lives in the `notice` keyframe animation, so there is no
 * timer or extra state to keep in sync.
 */
export function NoticeToast({ notice }: { notice: Notice | null }) {
  if (!notice) return null;

  const tone = TONE[notice.tone];
  const Icon =
    notice.tone === "info" ? Info : notice.tone === "danger" ? CircleAlert : TriangleAlert;

  return (
    <div
      // Remounting on a new id is what restarts the animation.
      key={notice.id}
      role="status"
      aria-live="polite"
      className={cn(
        "animate-notice pointer-events-none flex max-w-[92vw] items-center gap-2.5 rounded-full bg-black/70 px-3.5 py-2 text-sm text-white/90 shadow-lg ring-1 backdrop-blur-md",
        tone.ring
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", tone.icon)} />
      <span className="truncate">{notice.text}</span>
    </div>
  );
}
