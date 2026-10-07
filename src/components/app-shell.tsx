import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-7 place-items-center rounded-lg bg-brand text-[13px] font-bold text-brand-foreground">
        P
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Paircall</span>
    </div>
  );
}

/**
 * Frame for every screen that is not the video stage: brand header, centred
 * content and a short privacy note. Server component on purpose — the shell
 * ships no JavaScript.
 */
export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("stage-grid flex min-h-dvh flex-col", className)}>
      <header className="flex items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Wordmark />
        <p className="hidden text-xs text-muted-foreground sm:block">
          No accounts · Nothing recorded · Two people per call
        </p>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-8">{children}</main>

      <footer className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs leading-5 text-muted-foreground/70 sm:px-8">
        Audio and video travel directly between the two browsers over WebRTC. Your display name
        lives in this tab for this call only.
      </footer>
    </div>
  );
}
