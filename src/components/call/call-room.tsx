"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle } from "lucide-react";
import { CallStage } from "./call-stage";
import { EndScreen } from "./end-screen";
import { PreJoin } from "./pre-join";
import { NameForm } from "@/components/lobby/name-form";
import { AppShell } from "@/components/app-shell";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import {
  callPathForCode,
  generateCallCode,
  isValidCallCode,
  normalizeCallCode,
} from "@/lib/call/code";
import {
  clearCallSession,
  clearName,
  isLocalHost,
  markAsHost,
  readName,
  writeName,
} from "@/lib/call/session";
import { useCallEngine } from "@/lib/call/use-call-engine";
import { useFullscreen } from "@/lib/hooks/use-fullscreen";
import { useTicker } from "@/lib/hooks/use-ticker";
import { useClientValue, useSessionValue } from "@/lib/hooks/use-client-value";
import type { CallRole } from "@/lib/call/types";

/** Screen-share capture is simply absent in some browsers. */
function supportsDisplayCapture(): boolean {
  return typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/**
 * Everything behind `/call/[code]`, in one component that drives the whole
 * sequence: name → camera preview → waiting/connecting → in call → ended.
 */
export function CallRoom({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);

  const code = normalizeCallCode(rawCode);
  const codeValid = isValidCallCode(rawCode);

  // Session storage and device capabilities only exist on the client, so they
  // come through an external store rather than an effect. null = not resolved.
  const storedName = useSessionValue(readName);
  const readIsHost = useCallback(() => isLocalHost(code), [code]);
  const hostMark = useSessionValue(readIsHost);
  const screenCapable = useClientValue(supportsDisplayCapture);

  const resolved = storedName !== null && hostMark !== null;
  const name = storedName ?? "";
  const role: CallRole = hostMark ? "host" : "guest";
  const canShareScreen = screenCapable === true;

  const [engine, state] = useCallEngine({ code, role, localName: name });
  const [joined, setJoined] = useState(false);
  const { active: fullscreen, toggle: toggleFullscreen } = useFullscreen<HTMLDivElement>();
  const now = useTicker(state.startedAt !== null || state.expiresAt !== null);

  // Ask for the camera and microphone the moment the preview screen is up.
  useEffect(() => {
    if (!resolved || !codeValid || !name || joined) return;
    if (state.status !== "idle" || state.localStream || state.mediaBlock) return;
    void engine.startMedia();
  }, [resolved, codeValid, name, joined, state.status, state.localStream, state.mediaBlock, engine]);

  const go = (href: string) => router.push(href, { scroll: false });

  const leave = () => {
    clearCallSession(code);
    go("/");
  };

  const newCall = () => {
    clearCallSession(code);
    const fresh = generateCallCode();
    markAsHost(fresh);
    go(callPathForCode(fresh));
  };

  /* ------------------------------------------------------------- screens -- */

  if (!codeValid) {
    return (
      <AppShell>
        <Panel className="w-full max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/15 text-destructive">
            <KeyRound aria-hidden className="size-6" />
          </span>
          <PanelTitle
            title="That call code doesn't look right"
            subtitle="Codes are 6 to 8 characters, letters and numbers with no spaces. Ask the host to send the link again."
            className="mt-4"
          />
          <Button
            type="button"
            onClick={leave}
            className="mt-6 h-12 w-full rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Back to start
          </Button>
        </Panel>
      </AppShell>
    );
  }

  if (!resolved) {
    return (
      <AppShell>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Opening your call…
        </div>
      </AppShell>
    );
  }

  if (!name) {
    return (
      <AppShell>
        <Panel className="w-full max-w-md">
          <PanelTitle
            title={`Before joining ${code}`}
            subtitle="Your name is shown to the other person only, and only for this call."
            className="mb-5"
          />
          <NameForm defaultName="" cta="Continue" onSubmit={writeName} />
        </Panel>
      </AppShell>
    );
  }

  if (state.status === "ended") {
    return (
      <AppShell>
        <EndScreen
          state={state}
          onHome={leave}
          onNewCall={newCall}
          onRejoin={() => {
            setJoined(true);
            void engine.rejoin();
          }}
        />
      </AppShell>
    );
  }

  if (!joined) {
    return (
      <AppShell>
        <PreJoin
          state={state}
          role={role}
          onJoin={() => {
            setJoined(true);
            void engine.connect();
          }}
          onToggleMic={() => engine.toggleMic()}
          onToggleCamera={() => engine.toggleCamera()}
          onRetryMedia={() => void engine.startMedia()}
          onChangeName={clearName}
        />
      </AppShell>
    );
  }

  return (
    <CallStage
      state={state}
      now={now}
      canShareScreen={canShareScreen}
      fullscreen={fullscreen}
      stageRef={stageRef}
      onToggleMic={() => engine.toggleMic()}
      onToggleCamera={() => engine.toggleCamera()}
      onToggleShare={() => {
        if (state.screenSharing) engine.stopScreenShare();
        else void engine.startScreenShare();
      }}
      onToggleFullscreen={() => toggleFullscreen(stageRef.current)}
      onActivity={() => engine.touch()}
      onHangUp={() => {
        setJoined(false);
        engine.hangUp();
      }}
    />
  );
}
