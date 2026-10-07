"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type VideoSurfaceProps = {
  stream: MediaStream | null;
  /** Local previews must never feed audio back into the call. */
  muted?: boolean;
  mirrored?: boolean;
  contain?: boolean;
  className?: string;
};

/**
 * A <video> bound to a MediaStream outside of render. `srcObject` cannot be a
 * React prop, and autoplay is often rejected until a user gesture happens, so
 * we retry on metadata.
 */
export function VideoSurface({
  stream,
  muted = false,
  mirrored = false,
  contain = false,
  className,
}: VideoSurfaceProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    if (!stream) return;

    const attempt = () => {
      void element.play().catch(() => undefined);
    };
    attempt();
    element.addEventListener("loadedmetadata", attempt);
    return () => element.removeEventListener("loadedmetadata", attempt);
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn(
        "h-full w-full bg-stage",
        contain ? "object-contain" : "object-cover",
        mirrored && "-scale-x-100",
        className
      )}
    />
  );
}
