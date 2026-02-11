"use client";

import { Play, Pause, StepForward, RotateCcw, Plus, BarChart3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SimulatorState } from "@/lib/types";

type FocusHeaderProps = {
  state: SimulatorState;
  uiMode: "FOCUS" | "CLASSIC";
  onUiModeChange: (mode: "FOCUS" | "CLASSIC") => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: () => void;
  onAddProcess: () => void;
  onCompare: () => void;
};

export function FocusHeader({
  state,
  uiMode,
  onUiModeChange,
  isPlaying,
  onTogglePlay,
  onStep,
  onReset,
  onAddProcess,
  onCompare,
}: FocusHeaderProps) {
  return (
    <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Dispatch</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-zinc-200">
              {state.algorithm}
            </Badge>
            <Badge variant="outline" className="text-zinc-200">
              t={state.time}
            </Badge>
            <Badge variant="outline" className="text-zinc-200">
              {state.tick_ms} ms
            </Badge>
            <Badge variant="outline" className="border-sky-400/50 text-sky-300">
              FOCUS
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/70 p-1">
            <Button
              size="sm"
              variant={uiMode === "FOCUS" ? "default" : "ghost"}
              className={uiMode === "FOCUS" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300"}
              onClick={() => onUiModeChange("FOCUS")}
            >
              Focus
            </Button>
            <Button
              size="sm"
              variant={uiMode === "CLASSIC" ? "default" : "ghost"}
              className={uiMode === "CLASSIC" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300"}
              onClick={() => onUiModeChange("CLASSIC")}
            >
              Classic
            </Button>
          </div>

          <Button size="sm" variant="outline" onClick={onTogglePlay}>
            {isPlaying ? <Pause className="mr-1 size-4" /> : <Play className="mr-1 size-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="outline" onClick={onStep}>
            <StepForward className="mr-1 size-4" />
            Step
          </Button>
          <Button size="sm" variant="outline" onClick={onReset}>
            <RotateCcw className="mr-1 size-4" />
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={onAddProcess}>
            <Plus className="mr-1 size-4" />
            Add Process
          </Button>
          <Button size="sm" variant="outline" onClick={onCompare}>
            <BarChart3 className="mr-1 size-4" />
            Compare
          </Button>
        </div>
      </div>
    </div>
  );
}

