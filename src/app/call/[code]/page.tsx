import type { Metadata } from "next";
import { Suspense } from "react";
import { CallRoom } from "@/components/call/call-room";

export const metadata: Metadata = {
  title: "In a call",
  description: "A private 1-to-1 peer-to-peer video call.",
};

/**
 * `/call/ABC123`. The code is request-time data, so the room streams in behind a
 * Suspense boundary while the shell stays prerendered (Cache Components).
 */
export default function CallPage(props: PageProps<"/call/[code]">) {
  return (
    <Suspense fallback={<CallLoader />}>
      <CallRoom params={props.params} />
    </Suspense>
  );
}

function CallLoader() {
  return (
    <div className="stage-grid flex min-h-dvh flex-col items-center justify-center gap-3 bg-stage">
      <span className="text-[15px] font-semibold tracking-tight text-white/80">Paircall</span>
      <span className="text-sm text-white/40">Opening your call…</span>
    </div>
  );
}
