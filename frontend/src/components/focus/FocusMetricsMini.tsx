"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SimulatorState } from "@/lib/types";

type FocusMetricsMiniProps = {
  state: SimulatorState;
};

export function FocusMetricsMini({ state }: FocusMetricsMiniProps) {
  const [showMore, setShowMore] = useState(false);
  const isFull = (state.memory.enabled ?? state.memory.mode) === "FULL";

  return (
    <Card className="border-zinc-800/70 bg-zinc-950/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Key Metrics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2 text-sm">
            <p className="text-zinc-500">CPU Util</p>
            <p className="font-semibold text-zinc-100">{state.metrics.cpu_util.toFixed(1)}%</p>
          </div>
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2 text-sm">
            <p className="text-zinc-500">Avg TAT</p>
            <p className="font-semibold text-zinc-100">{state.metrics.avg_tat.toFixed(2)}</p>
          </div>
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2 text-sm">
            <p className="text-zinc-500">Throughput</p>
            <p className="font-semibold text-zinc-100">{state.metrics.throughput.toFixed(3)}</p>
          </div>
          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2 text-sm">
            <p className="text-zinc-500">Hit Ratio</p>
            <p className="font-semibold text-zinc-100">
              {isFull ? `${(state.memory.hit_ratio * 100).toFixed(1)}%` : "N/A"}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-zinc-300">
            {state.algorithm}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => setShowMore((prev) => !prev)}>
            {showMore ? "Hide more" : "Show more"}
          </Button>
        </div>

        {showMore ? (
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            <div className="rounded-md border border-zinc-800/70 bg-zinc-900/45 p-2">
              <p className="text-zinc-500">Avg WT</p>
              <p className="font-semibold text-zinc-100">{state.metrics.avg_wt.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-zinc-800/70 bg-zinc-900/45 p-2">
              <p className="text-zinc-500">Avg RT</p>
              <p className="font-semibold text-zinc-100">{state.metrics.avg_rt.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-zinc-800/70 bg-zinc-900/45 p-2">
              <p className="text-zinc-500">Makespan</p>
              <p className="font-semibold text-zinc-100">{state.metrics.makespan}</p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

