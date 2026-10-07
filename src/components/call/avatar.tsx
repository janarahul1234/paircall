import { avatarTint, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string;
  size?: "sm" | "md" | "lg";
  /** Soft breathing ring, used while waiting for someone to join. */
  pulse?: boolean;
  className?: string;
};

const SIZES = {
  sm: "size-9 text-xs",
  md: "size-14 text-sm",
  lg: "size-20 text-lg",
} as const;

/** Placeholder face for a participant whose video is off or not there yet. */
export function Avatar({ name, size = "md", pulse = false, className }: AvatarProps) {
  return (
    <div className={cn("relative grid place-items-center", className)}>
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 animate-breathe rounded-full bg-brand/20 blur-xl"
        />
      )}
      <span
        className={cn(
          "relative grid place-items-center rounded-full font-semibold text-white/95 ring-1 ring-white/15 select-none",
          SIZES[size]
        )}
        style={{ backgroundColor: avatarTint(name || "?") }}
      >
        {initials(name)}
      </span>
    </div>
  );
}
