"use client";

import { useCallback } from "react";
import { Check, Link2 } from "lucide-react";
import { callUrlForCode } from "@/lib/call/code";
import { useCopy } from "@/lib/hooks/use-copy";
import { useClientValue } from "@/lib/hooks/use-client-value";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The two sharing primitives a host needs: the human-readable code and the link
 * that pre-fills it. The URL is resolved on the client because it depends on
 * where the app happens to be deployed.
 */
export function CodeShare({ code, className }: { code: string; className?: string }) {
  const { copied, copy } = useCopy();
  const readUrl = useCallback(() => callUrlForCode(code), [code]);
  // The link only exists once we are on the client.
  const url = useClientValue(readUrl);

  const copyLink = () => {
    if (url) void copy(url);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col items-center gap-1">
        <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Call code
        </span>
        <button
          type="button"
          onClick={() => void copy(code)}
          title="Copy the code itself"
          className="font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums transition-colors hover:text-brand"
        >
          {code}
        </button>
      </div>

      <Button
        type="button"
        onClick={copyLink}
        className="h-11 w-full rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
        {copied ? "Link copied" : "Copy link"}
      </Button>

      {url && (
        <p className="truncate text-center text-xs text-muted-foreground" title={url}>
          {url}
        </p>
      )}
    </div>
  );
}
