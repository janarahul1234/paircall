"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, KeyRound, ShieldCheck, Users } from "lucide-react";
import { NameForm } from "./name-form";
import { Panel, PanelTitle } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import {
  callPathForCode,
  generateCallCode,
  isValidCallCode,
  normalizeCallCode,
} from "@/lib/call/code";
import { clearName, markAsHost, readName, writeName } from "@/lib/call/session";
import { useSessionValue } from "@/lib/hooks/use-client-value";

/**
 * Landing flow: name first, then either create a call (a fresh random code is
 * minted and we navigate to its URL) or join one with a code.
 *
 * Which step we are on is *derived* from session storage through
 * `useSessionValue`, so there is no duplicate state to keep in sync.
 */
export function Lobby() {
  const router = useRouter();
  // null = not on the client yet, "" = no name stored, otherwise the name.
  const storedName = useSessionValue(readName);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  const go = (href: string) => router.push(href, { scroll: false });

  if (storedName === null) {
    // Matches the prerendered shell: a quiet placeholder, never a name flash.
    return (
      <Shell>
        <div className="h-28 w-full max-w-md animate-pulse rounded-3xl bg-card/60" aria-hidden />
      </Shell>
    );
  }

  if (storedName === "") {
    return (
      <Shell>
        <Panel>
          <PanelTitle
            title="Who is joining?"
            subtitle="Your name is only shown to the person you connect with, and only for this call."
            className="mb-5"
          />
          <NameForm
            defaultName=""
            onSubmit={writeName}
            subtitle="No account, no email, nothing to install."
          />
        </Panel>
      </Shell>
    );
  }

  const createCall = () => {
    const fresh = generateCallCode();
    markAsHost(fresh);
    go(callPathForCode(fresh));
  };

  const joinCall = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValidCallCode(code)) {
      setCodeError("Call codes are 6 to 8 characters, letters and numbers only.");
      return;
    }
    go(callPathForCode(normalizeCallCode(code)));
  };

  return (
    <Shell>
      <Panel className="w-full max-w-md">
        <PanelTitle
          title={`Hi ${storedName}, what would you like to do?`}
          subtitle="Create a call and share its link, or join one that is already waiting."
          className="mb-6"
        />

        <div className="space-y-3">
          <button
            type="button"
            onClick={createCall}
            className="group flex w-full items-center justify-between gap-4 rounded-2xl bg-brand px-4 py-4 text-left text-brand-foreground transition-all hover:bg-brand/95 active:scale-[0.99]"
          >
            <span className="flex items-center gap-3">
              <Users aria-hidden className="size-5" />
              <span>
                <span className="block text-sm font-semibold">Create new call</span>
                <span className="block text-xs font-medium opacity-70">
                  Generates a private 7-character code
                </span>
              </span>
            </span>
            <ChevronRight
              aria-hidden
              className="size-5 opacity-70 transition-transform group-hover:translate-x-0.5"
            />
          </button>

          <form onSubmit={joinCall} className="space-y-2.5">
            <label htmlFor="call-code" className="block text-sm font-medium text-foreground/80">
              Enter call code
            </label>
            <div className="flex gap-2">
              <input
                id="call-code"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="7KQM2DA"
                value={code}
                onChange={(event) => {
                  setCode(normalizeCallCode(event.target.value));
                  if (codeError) setCodeError(null);
                }}
                aria-invalid={codeError ? true : undefined}
                className="h-12 min-w-0 flex-1 rounded-xl bg-input/40 px-4 font-mono text-lg tracking-[0.2em] uppercase outline-none ring-1 ring-input transition-shadow placeholder:tracking-[0.2em] placeholder:text-muted-foreground/40 focus-visible:ring-2 focus-visible:ring-brand/70"
              />
              <Button
                type="submit"
                disabled={code.length < 6}
                variant="secondary"
                className="h-12 shrink-0 rounded-xl px-5 text-sm font-semibold"
              >
                <KeyRound aria-hidden />
                Join
              </Button>
            </div>
            {codeError && (
              <p role="alert" className="text-sm text-destructive">
                {codeError}
              </p>
            )}
          </form>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <button
            type="button"
            onClick={clearName}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            Change name
          </button>
          <ShieldCheck aria-hidden className="size-4 text-muted-foreground/60" />
        </div>
      </Panel>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          One name. One code. One call.
        </h2>
        <p className="text-sm text-muted-foreground">
          Peer-to-peer 1-to-1 video, straight between two browsers.
        </p>
      </div>
      {children}
    </div>
  );
}
