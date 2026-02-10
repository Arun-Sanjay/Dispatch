"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { PlaybackRate, ReplayMode } from "@/store/replayStore";

type ReplayControlsProps = {
  mode: ReplayMode;
  onModeChange: (mode: ReplayMode) => void;
  replayT: number;
  replayMax: number;
  isPlaying: boolean;
  playbackRate: PlaybackRate;
  onScrub: (t: number) => void;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onStart: () => void;
  onEnd: () => void;
  onRateChange: (rate: PlaybackRate) => void;
};

export function ReplayControls({
  mode,
  onModeChange,
  replayT,
  replayMax,
  isPlaying,
  playbackRate,
  onScrub,
  onPlayPause,
  onStepBack,
  onStepForward,
  onStart,
  onEnd,
  onRateChange,
}: ReplayControlsProps) {
  return (
    <div className="neo-panel border-border/50 bg-card/70 space-y-3 rounded-2xl border p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 p-1">
          <Button
            size="sm"
            variant={mode === "live" ? "default" : "ghost"}
            className={mode === "live" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
            onClick={() => onModeChange("live")}
          >
            Live
          </Button>
          <Button
            size="sm"
            variant={mode === "replay" ? "default" : "ghost"}
            className={mode === "replay" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
            onClick={() => onModeChange("replay")}
          >
            Replay
          </Button>
        </div>

        {mode === "replay" ? (
          <p className="text-xs font-medium text-zinc-300">
            t = {replayT} / {replayMax}
          </p>
        ) : null}
      </div>

      {mode === "replay" ? (
        <>
          <div className="space-y-2 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
            <Slider
              value={[replayT]}
              min={0}
              max={Math.max(1, replayMax)}
              step={1}
              onValueChange={(value) => {
                const t = value[0];
                if (typeof t === "number") {
                  onScrub(t);
                }
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={onStart}>
                <SkipBack className="size-4" />
                Start
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={onStepBack}>
                ◀ Step
              </Button>
              <Button size="sm" onClick={onPlayPause} className="gap-1.5">
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={onStepForward}>
                Step ▶
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={onEnd}>
                End
                <SkipForward className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">Speed</span>
              <Select
                value={String(playbackRate)}
                onValueChange={(value) => onRateChange(Number(value) as PlaybackRate)}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">0.5x</SelectItem>
                  <SelectItem value="1">1x</SelectItem>
                  <SelectItem value="2">2x</SelectItem>
                  <SelectItem value="4">4x</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
