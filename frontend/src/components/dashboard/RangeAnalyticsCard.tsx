"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import type { RangeStats, TickRange } from "@/lib/analytics/timelineAnalytics";

type RangeAnalyticsCardProps = {
  title: string;
  range: TickRange;
  maxTick: number;
  stats: RangeStats;
  onRangeChange: (range: TickRange) => void;
};

function normalizeRange(nextValues: number[], maxTick: number): TickRange | null {
  if (nextValues.length < 2) return null;
  const left = Math.max(0, Math.min(Math.round(nextValues[0]), Math.round(nextValues[1]), maxTick));
  const right = Math.max(0, Math.min(Math.max(Math.round(nextValues[0]), Math.round(nextValues[1])), maxTick));
  return { l: left, r: right };
}

export function RangeAnalyticsCard({ title, range, maxTick, stats, onRangeChange }: RangeAnalyticsCardProps) {
  const safeMaxTick = Math.max(0, maxTick);
  const sliderValue = useMemo<[number, number]>(() => {
    const left = Math.max(0, Math.min(range.l, safeMaxTick));
    const right = Math.max(0, Math.min(range.r, safeMaxTick));
    return [Math.min(left, right), Math.max(left, right)];
  }, [range, safeMaxTick]);

  return (
    <div className="neo-panel border-border/50 bg-card/60 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        <Badge variant="outline" className="text-zinc-300">
          t={sliderValue[0]}..{sliderValue[1]}
        </Badge>
      </div>

      <div className="mt-3 space-y-2">
        <Slider
          value={sliderValue}
          min={0}
          max={safeMaxTick}
          step={1}
          onValueChange={(values) => {
            const next = normalizeRange(values, safeMaxTick);
            if (next) onRangeChange(next);
          }}
          disabled={safeMaxTick <= 0}
        />
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>0</span>
          <span>{safeMaxTick}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Busy Ticks</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.busyTicks}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Idle Ticks</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.idleTicks}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Utilization</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.utilPct.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Longest Busy Streak</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.longestBusyStreak}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Longest Idle Streak</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.longestIdleStreak}</p>
        </div>
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/45 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Range Length</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{stats.totalTicks}</p>
        </div>
      </div>
    </div>
  );
}
