"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProcessRuntimeRow, ProcessRuntimeState, SimulatorState } from "@/lib/types";

const COLUMNS: ProcessRuntimeState[] = ["NEW", "READY", "RUNNING", "WAITING_IO", "WAITING_MEM", "DONE"];

type StateBoardProps = {
  state: SimulatorState;
  states: Record<string, ProcessRuntimeState>;
};

function processInfoMap(state: SimulatorState): Record<string, ProcessRuntimeRow> {
  const out: Record<string, ProcessRuntimeRow> = {};
  for (const process of state.processes ?? []) {
    out[process.pid] = process;
  }
  return out;
}

function faultCounts(state: SimulatorState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of state.event_log ?? []) {
    const match = line.match(/:\s*([A-Za-z0-9_]+)\s+RUNNING\s*(?:->|→)\s*WAITING_MEM/i);
    if (!match?.[1]) continue;
    out[match[1]] = (out[match[1]] ?? 0) + 1;
  }
  return out;
}

export function StateBoard({ state, states }: StateBoardProps) {
  const info = processInfoMap(state);
  const faults = faultCounts(state);

  const readyOrder = [
    ...(state.ready_queue ?? []),
    ...(state.sys_queue ?? []),
    ...(state.user_queue ?? []),
  ].filter((pid) => pid && pid !== "IDLE");

  const allPids = new Set<string>(Object.keys(states));
  readyOrder.forEach((pid) => allPids.add(pid));
  if (state.running && state.running !== "IDLE") allPids.add(state.running);
  for (const pid of state.completed ?? []) {
    if (pid && pid !== "IDLE") allPids.add(pid);
  }

  const grouped: Record<ProcessRuntimeState, string[]> = {
    NEW: [],
    READY: [],
    RUNNING: [],
    WAITING_IO: [],
    WAITING_MEM: [],
    DONE: [],
  };

  for (const pid of allPids) {
    const st = states[pid] ?? "NEW";
    grouped[st].push(pid);
  }

  grouped.READY.sort((a, b) => {
    const ai = readyOrder.indexOf(a);
    const bi = readyOrder.indexOf(b);
    if (ai < 0 && bi < 0) return a.localeCompare(b);
    if (ai < 0) return 1;
    if (bi < 0) return -1;
    return ai - bi;
  });
  grouped.RUNNING = grouped.RUNNING.slice(0, 1);

  return (
    <Card className="border-zinc-800/70 bg-zinc-950/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">State Board</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {COLUMNS.map((column) => (
            <div key={column} className="rounded-xl border border-zinc-800/70 bg-zinc-900/45 p-2">
              <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-300">{column}</p>
              <div className="space-y-2">
                {grouped[column].length === 0 ? (
                  <p className="text-[11px] text-zinc-500">Empty</p>
                ) : (
                  grouped[column].map((pid) => {
                    const p = info[pid];
                    return (
                      <div key={`${column}-${pid}`} className="rounded-lg border border-white/10 bg-zinc-800/70 px-2 py-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-zinc-100">{pid}</p>
                          {faults[pid] ? (
                            <Badge variant="outline" className="text-[10px] text-rose-300 border-rose-500/40">
                              f:{faults[pid]}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                          {typeof p?.priority === "number" ? (
                            <Badge variant="outline" className="text-zinc-300">
                              pr {p.priority}
                            </Badge>
                          ) : null}
                          {p?.queue ? (
                            <Badge variant="outline" className="text-zinc-300">
                              {p.queue}
                            </Badge>
                          ) : null}
                          {typeof p?.remaining_in_current_burst === "number" ? (
                            <Badge variant="outline" className="text-zinc-300">
                              rem {p.remaining_in_current_burst}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

