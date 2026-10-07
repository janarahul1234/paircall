"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_NAME_LENGTH, sanitizeName } from "@/lib/call/session";

/**
 * The name step. The name is never sent anywhere except to the person you
 * connect with, and it is only kept in sessionStorage for the current tab.
 */
export function NameForm({
  defaultName,
  subtitle,
  cta = "Continue",
  onSubmit,
}: {
  defaultName: string;
  subtitle?: string;
  cta?: string;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const clean = sanitizeName(value);
    if (!clean) {
      setError("Enter a name so the other person knows who they are talking to.");
      return;
    }
    setError(null);
    onSubmit(clean);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="display-name" className="text-sm font-medium text-foreground/80">
          Your name
        </label>
        <input
          id="display-name"
          name="name"
          type="text"
          autoComplete="name"
          autoFocus
          maxLength={MAX_NAME_LENGTH}
          placeholder="Ana Moreno"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          aria-invalid={error ? true : undefined}
          className="h-12 w-full rounded-xl bg-input/40 px-4 text-base outline-none ring-1 ring-input transition-shadow placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/70"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        className="h-12 w-full rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {cta}
        <ArrowRight aria-hidden data-icon="inline-end" />
      </Button>

      {subtitle && <p className="text-xs leading-5 text-muted-foreground">{subtitle}</p>}
    </form>
  );
}
