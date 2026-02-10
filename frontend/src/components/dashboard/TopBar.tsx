"use client";

import { motion } from "framer-motion";
import { Gauge, Pause, Play, RefreshCw, Rocket, SkipForward, UserPlus, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { SimulatorState } from "@/lib/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type TopBarProps = {
  state: SimulatorState;
  connectionStatus: ConnectionStatus;
  onInitDemo: () => void;
  onStep: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onSpeedChange: (tickMs: number) => void;
  onQuantumChange: (q: number) => void;
  isPlaying: boolean;
  onAddProcess?: () => void;
};

export function TopBar({
  state,
  connectionStatus,
  onInitDemo,
  onStep,
  onTogglePlay,
  onReset,
  onSpeedChange,
  onQuantumChange,
  isPlaying,
  onAddProcess,
}: TopBarProps) {
  const connectionBadgeClass =
    connectionStatus === "connected"
      ? "border-emerald-500/40 text-emerald-300"
      : connectionStatus === "connecting"
        ? "border-amber-500/40 text-amber-300"
        : "border-zinc-500/40 text-zinc-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="neo-panel border-border/50 bg-card/70 flex flex-col gap-4 rounded-2xl border px-5 py-4 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-sky-400/40 bg-sky-500/20 text-sky-300">{state.algorithm}</Badge>
          <Badge variant="outline" className="border-emerald-400/40 text-emerald-300">
            <Gauge className="size-3" /> t={state.time}
          </Badge>
          <Badge variant="outline" className="text-zinc-300">
            tick {state.tick_ms}ms
          </Badge>
          <Badge variant="outline" className="text-zinc-300">
            q {state.quantum}
          </Badge>
          <Badge variant="outline" className={connectionBadgeClass}>
            {connectionStatus === "connected" ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {connectionStatus}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onInitDemo} className="gap-1.5">
            <Rocket className="size-4" /> Load Demo
          </Button>
          <Button onClick={onTogglePlay} className="gap-1.5">
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button variant="outline" onClick={onStep} className="gap-1.5">
            <SkipForward className="size-4" /> Step
          </Button>
          <Button variant="outline" onClick={onReset} className="gap-1.5">
            <RefreshCw className="size-4" /> Reset
          </Button>
          {onAddProcess ? (
            <Button variant="outline" onClick={onAddProcess} className="gap-1.5">
              <UserPlus className="size-4" /> Add Process
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
          <p className="text-xs text-zinc-400">Speed ({state.tick_ms} ms)</p>
          <Slider
            value={[state.tick_ms]}
            min={50}
            max={1000}
            step={50}
            onValueChange={(v) => {
              const tickMs = v[0];
              if (typeof tickMs === "number") onSpeedChange(tickMs);
            }}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
          <p className="text-xs text-zinc-400">Quantum ({state.quantum})</p>
          <Slider
            value={[state.quantum]}
            min={1}
            max={10}
            step={1}
            onValueChange={(v) => {
              const q = v[0];
              if (typeof q === "number") onQuantumChange(q);
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}
