import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Elevated surface used by every non-video screen. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-card/80 p-5 ring-1 ring-white/10 backdrop-blur-xl sm:p-7",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  title,
  subtitle,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
      {subtitle && <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
