"use client";

import { STATUS_LABEL } from "@/lib/call/copy";
import type { CallStatus } from "@/lib/call/types";
import { cn } from "@/lib/utils";

const DOT: Record<CallStatus, string> = {
  idle: "bg-muted-foreground",
  "requesting-media": "bg-amber-400",
  "media-ready": "bg-emerald-400",
  starting: "bg-amber-400 animate-pulse",
  waiting: "bg-amber-400 animate-pulse",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  reconnecting: "bg-orange-400 animate-pulse",
  ended: "bg-muted-foreground",
};

/** Compact "what is happening right now" indicator for the call header. */
export function StatusPill({
  status,
  className,
}: {
  status: CallStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-black/35 px-2.5 py-1 text-xs font-medium text-white/80 ring-1 ring-white/10 backdrop-blur",
        className
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}
