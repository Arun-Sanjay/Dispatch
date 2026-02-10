import { Cpu } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type CpuPanelProps = {
  running: string;
};

export function CpuPanel({ running }: CpuPanelProps) {
  const isIdle = running === "IDLE";

  return (
    <Card className="neo-panel border-border/50 bg-card/60 border">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cpu className="size-4 text-sky-400" /> CPU
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`rounded-xl border px-4 py-6 text-center ${
            isIdle
              ? "border-zinc-700 bg-zinc-900/40 text-zinc-400"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Running</p>
          <p className="mt-2 text-3xl font-semibold">{running}</p>
          <p className="mt-1 text-xs text-zinc-500">remaining: --</p>
        </div>
      </CardContent>
    </Card>
  );
}
