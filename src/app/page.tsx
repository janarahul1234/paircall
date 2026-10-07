import { AppShell } from "@/components/app-shell";
import { Lobby } from "@/components/lobby/lobby";

export default function Home() {
  return (
    <AppShell>
      <Lobby />
    </AppShell>
  );
}
