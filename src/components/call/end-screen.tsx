"use client";

import { ArrowLeft, PhoneOff, RefreshCw, Users } from "lucide-react";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { describeEnd } from "@/lib/call/copy";
import { describeElapsed } from "@/lib/format";
import type { CallState } from "@/lib/call/types";
import { cn } from "@/lib/utils";

/**
 * Terminal screen for every way a call can stop: you hung up, they hung up,
 * nobody joined in time, the code was wrong or already full, the network lost
 * the plot. Same shape, different copy and actions.
 */
export function EndScreen({
  state,
  onHome,
  onRejoin,
  onNewCall,
}: {
  state: CallState;
  onHome: () => void;
  onRejoin: () => void;
  onNewCall: () => void;
}) {
  const reason = state.endReason ?? "you-ended";
  const copy = describeEnd(reason, state.remoteName);
  const elapsed =
    state.startedAt && state.endedAt ? describeElapsed(state.endedAt - state.startedAt) : null;

  // Rejoining makes sense unless the code itself is unusable.
  const canRejoin = reason !== "code-taken" && reason !== "expired";

  return (
    <Panel className="w-full max-w-md text-center">
      <div className="flex flex-col items-center gap-4">
        <span
          className={cn(
            "grid size-12 place-items-center rounded-2xl",
            copy.tone === "danger"
              ? "bg-destructive/15 text-destructive"
              : copy.tone === "warning"
                ? "bg-amber-400/15 text-amber-400"
                : "bg-muted text-muted-foreground"
          )}
        >
          <PhoneOff aria-hidden className="size-6" />
        </span>

        <PanelTitle title={copy.title} subtitle={copy.body} />

        {elapsed && (
          <p className="text-xs text-muted-foreground">
            Call length <span className="font-mono text-foreground/80">{elapsed}</span>
            {state.remoteName && <> · with {state.remoteName}</>}
          </p>
        )}

        <div className="mt-2 flex w-full flex-col gap-2">
          {canRejoin && (
            <Button
              type="button"
              onClick={onRejoin}
              className="h-12 w-full rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <RefreshCw aria-hidden />
              Rejoin this call
            </Button>
          )}
          <Button
            type="button"
            onClick={onNewCall}
            variant="secondary"
            className="h-12 w-full rounded-xl text-sm font-semibold"
          >
            <Users aria-hidden />
            Create a new call
          </Button>
          <Button
            type="button"
            onClick={onHome}
            variant="ghost"
            className="h-11 w-full rounded-xl text-sm font-medium"
          >
            <ArrowLeft aria-hidden />
            Back to start
          </Button>
        </div>
      </div>
    </Panel>
  );
}
