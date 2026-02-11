"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeadlineEvent } from "@/lib/sim/headlineEvent";
import type { SimulatorState } from "@/lib/types";

function memToken(state: SimulatorState): string {
  return state.mem_gantt.at(-1) ?? state.memory.mem_gantt.at(-1) ?? "IDLE";
}

function trailingRunLength(state: SimulatorState): number {
  const pid = state.running;
  if (!pid || pid === "IDLE") return 0;
  let count = 0;
  for (let i = state.gantt.length - 1; i >= 0; i -= 1) {
    if (state.gantt[i] === pid) count += 1;
    else break;
  }
  return count;
}

type TickSummaryCardProps = {
  state: SimulatorState;
  headline: HeadlineEvent;
};

export function TickSummaryCard({ state, headline }: TickSummaryCardProps) {
  const mem = memToken(state);
  const severityClass =
    headline.severity === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : headline.severity === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-sky-500/40 bg-sky-500/10 text-sky-200";

  const quantumProgress =
    state.algorithm === "RR" || state.algorithm === "MLQ"
      ? `${Math.min(trailingRunLength(state), state.quantum)}/${state.quantum}`
      : null;

  return (
    <Card className="border-zinc-800/70 bg-zinc-950/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Tick Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-lg border px-3 py-2 text-sm ${severityClass}`}>
          <p className="font-semibold">{headline.title}</p>
          <p className="mt-1 text-xs opacity-90">{headline.detail}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="text-zinc-200">
            CPU: {state.running || "IDLE"}
          </Badge>
          <Badge variant="outline" className="text-zinc-200">
            IO: {state.io_active || "IDLE"}
          </Badge>
          <Badge variant="outline" className={mem.toUpperCase().startsWith("FAULT") ? "border-rose-400/50 text-rose-300" : "border-emerald-400/50 text-emerald-300"}>
            MEM: {mem}
          </Badge>
          {quantumProgress ? (
            <Badge variant="outline" className="text-zinc-200">
              Quantum: {quantumProgress}
            </Badge>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

