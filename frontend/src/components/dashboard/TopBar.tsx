"use client";

import { motion } from "framer-motion";
import { Gauge, Pause, Play, RefreshCw, Rocket, SkipForward, Trash2, UserPlus, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { AlgorithmMode, SimulatorState } from "@/lib/types";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type TopBarProps = {
  state: SimulatorState;
  connectionStatus: ConnectionStatus;
  algorithmMode: AlgorithmMode;
  tickMsValue: number;
  quantumValue: number;
  onAlgorithmModeChange: (mode: AlgorithmMode) => void;
  onInitDemo: () => void;
  onStep: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onClearAdded?: () => void;
  clearAddedDisabled?: boolean;
  onSpeedChange: (tickMs: number) => void;
  onQuantumChange: (q: number) => void;
  isPlaying: boolean;
  onAddProcess?: () => void;
  configControlsDisabled?: boolean;
};

const ALGORITHM_OPTIONS: Array<{ value: AlgorithmMode; label: string }> = [
  { value: "FCFS", label: "FCFS" },
  { value: "SJF", label: "SJF" },
  { value: "PRIORITY_NP", label: "PRIORITY (NP)" },
  { value: "PRIORITY_P", label: "PRIORITY (P)" },
  { value: "RR", label: "RR" },
  { value: "MLQ", label: "MLQ" },
];

export function TopBar({
  state,
  connectionStatus,
  algorithmMode,
  tickMsValue,
  quantumValue,
  onAlgorithmModeChange,
  onInitDemo,
  onStep,
  onTogglePlay,
  onReset,
  onClearAdded,
  clearAddedDisabled = false,
  onSpeedChange,
  onQuantumChange,
  isPlaying,
  onAddProcess,
  configControlsDisabled = false,
}: TopBarProps) {
  const connectionBadgeClass =
    connectionStatus === "connected"
      ? "border-emerald-500/40 text-emerald-300"
      : connectionStatus === "connecting"
        ? "border-amber-500/40 text-amber-300"
        : "border-zinc-500/40 text-zinc-400";

  const showQuantum = algorithmMode === "RR" || algorithmMode === "MLQ";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="neo-panel border-border/50 bg-card/70 flex flex-col gap-4 rounded-2xl border px-5 py-4 backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-sky-400/40 bg-sky-500/20 text-sky-300">{algorithmMode}</Badge>
          <Badge variant="outline" className="border-emerald-400/40 text-emerald-300">
            <Gauge className="size-3" /> t={state.time}
          </Badge>
          <Badge variant="outline" className="text-zinc-300">
            tick {tickMsValue}ms
          </Badge>
          <Badge variant="outline" className="text-zinc-300">
            q {quantumValue}
          </Badge>
          <Badge variant="outline" className={connectionBadgeClass}>
            {connectionStatus === "connected" ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {connectionStatus}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onInitDemo} className="gap-1.5" disabled={configControlsDisabled}>
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
          {onClearAdded ? (
            <Button
              variant="outline"
              onClick={onClearAdded}
              className="gap-1.5"
              disabled={configControlsDisabled || clearAddedDisabled}
            >
              <Trash2 className="size-4" /> Clear Added
            </Button>
          ) : null}
          {onAddProcess ? (
            <Button variant="outline" onClick={onAddProcess} className="gap-1.5" disabled={configControlsDisabled}>
              <UserPlus className="size-4" /> Add Process
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
          <p className="text-xs text-zinc-400">Algorithm</p>
          <Select
            value={algorithmMode}
            onValueChange={(value) => onAlgorithmModeChange(value as AlgorithmMode)}
            disabled={configControlsDisabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALGORITHM_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
          <p className="text-xs text-zinc-400">Tick (ms): {tickMsValue}</p>
          <Slider
            value={[tickMsValue]}
            min={50}
            max={1000}
            step={50}
            onValueChange={(v) => {
              const tickMs = v[0];
              if (typeof tickMs === "number") onSpeedChange(tickMs);
            }}
            disabled={configControlsDisabled}
          />
          <p className="text-[11px] text-zinc-500">debug: {tickMsValue} ms</p>
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
          <p className="text-xs text-zinc-400">Quantum ({quantumValue})</p>
          <Slider
            value={[quantumValue]}
            min={1}
            max={10}
            step={1}
            onValueChange={(v) => {
              const q = v[0];
              if (typeof q === "number") onQuantumChange(q);
            }}
            disabled={configControlsDisabled || !showQuantum}
          />
          <p className="text-[11px] text-zinc-500">debug: {quantumValue}</p>
          {!showQuantum ? <p className="text-[11px] text-zinc-500">Used only for RR / MLQ</p> : null}
        </div>
      </div>
    </motion.div>
  );
}
