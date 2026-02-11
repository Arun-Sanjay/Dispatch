"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Timeline } from "@/components/dashboard/Timeline";
import type { SimulatorState } from "@/lib/types";

type FocusTimelinesProps = {
  state: SimulatorState;
  tickMs: number;
  running: boolean;
  autoFollow: boolean;
};

export function FocusTimelines({ state, tickMs, running, autoFollow }: FocusTimelinesProps) {
  return (
    <Card className="border-zinc-800/70 bg-zinc-950/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Timelines (Last 60 Ticks)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Timeline
          title="CPU"
          items={state.gantt}
          time={state.time}
          tickMs={tickMs}
          running={running}
          autoFollow={autoFollow}
          windowSize={60}
        />
        <Timeline
          title="I/O"
          items={state.io_gantt}
          time={state.time}
          tickMs={tickMs}
          running={running}
          autoFollow={autoFollow}
          windowSize={60}
        />
        <Timeline
          title="MEM"
          items={state.mem_gantt.length > 0 ? state.mem_gantt : state.memory.mem_gantt}
          time={state.time}
          tickMs={tickMs}
          running={running}
          autoFollow={autoFollow}
          variant="memory"
          windowSize={60}
        />
      </CardContent>
    </Card>
  );
}

