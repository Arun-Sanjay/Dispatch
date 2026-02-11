"use client";

import { useEffect, useState } from "react";

import { Canvas } from "@react-three/fiber";

import { getPidColor } from "@/components/diagram/pidColors";
import { Scene } from "@/components/diagram/Scene";
import type { FocusTarget } from "@/components/diagram/useCinematicCamera";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SimulatorState } from "@/lib/types";

type DiagramModeProps = {
  state: SimulatorState;
  playbackRunning?: boolean;
  playbackTickMs?: number;
  isReplay?: boolean;
};

export function DiagramMode({
  state,
  playbackRunning = true,
  playbackTickMs,
  isReplay = false,
}: DiagramModeProps) {
  const [view, setView] = useState<FocusTarget>("OVERVIEW");
  const [completionFlash, setCompletionFlash] = useState(false);

  useEffect(() => {
    if (!completionFlash) return;
    const timer = window.setTimeout(() => setCompletionFlash(false), 260);
    return () => window.clearTimeout(timer);
  }, [completionFlash]);

  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[620px] overflow-hidden rounded-2xl border border-white/10 bg-black/55">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ position: [7.8, 5.1, 8.3], fov: 42, near: 0.1, far: 100 }}
      >
        <Scene
          state={state}
          view={view}
          onViewChange={setView}
          onCompletionPulse={() => setCompletionFlash(true)}
          playbackRunning={playbackRunning}
          playbackTickMs={playbackTickMs ?? state.tick_ms}
          isReplay={isReplay}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.08),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.08),transparent_35%)]" />

      <aside className="pointer-events-auto absolute right-4 top-4 z-20 w-[320px] rounded-2xl border border-white/15 bg-zinc-950/60 p-4 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-100">Diagram Inspector</p>
          <div className="flex items-center gap-2">
            {completionFlash ? (
              <Badge variant="outline" className="border-emerald-400/50 bg-emerald-500/15 text-emerald-200">
                DONE
              </Badge>
            ) : null}
            <Badge variant="outline" className="border-sky-400/40 bg-sky-500/10 text-sky-200">
              {view}
            </Badge>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant={view === "CPU_FOCUS" ? "default" : "outline"}
            className={
              view === "CPU_FOCUS"
                ? "bg-white text-black hover:bg-zinc-200"
                : "border-white/20 bg-white/5 text-zinc-200 hover:bg-white/10"
            }
            onClick={() => setView("CPU_FOCUS")}
          >
            Focus CPU
          </Button>
          <Button
            size="sm"
            variant={view === "OVERVIEW" ? "default" : "outline"}
            className={
              view === "OVERVIEW"
                ? "bg-white text-black hover:bg-zinc-200"
                : "border-white/20 bg-white/5 text-zinc-200 hover:bg-white/10"
            }
            onClick={() => setView("OVERVIEW")}
          >
            Overview
          </Button>
        </div>

        <div className="space-y-3 text-sm">
          <section className="rounded-xl border border-white/10 bg-zinc-900/45 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Runtime</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-200">
              <span>Running</span>
              <span className="text-right font-medium">{state.running}</span>
              <span>Time</span>
              <span className="text-right font-medium">{state.time}</span>
              <span>Algorithm</span>
              <span className="text-right font-medium">{state.algorithm}</span>
              <span>Tick</span>
              <span className="text-right font-medium">{state.tick_ms} ms</span>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-zinc-900/45 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Queues</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {state.ready_queue.length ? (
                state.ready_queue.slice(0, 10).map((pid) => (
                  <Badge
                    key={pid}
                    variant="outline"
                    className="text-zinc-100"
                    style={{
                      borderColor: `${getPidColor(pid)}80`,
                      backgroundColor: `${getPidColor(pid)}24`,
                    }}
                  >
                    {pid}
                  </Badge>
                ))
              ) : (
                <span className="text-zinc-500">Ready queue empty</span>
              )}
            </div>
            {state.algorithm === "MLQ" ? (
              <div className="mt-2 space-y-1 text-xs text-zinc-300">
                <p>SYS: {(state.sys_queue ?? []).join(", ") || "-"}</p>
                <p>USER: {(state.user_queue ?? []).join(", ") || "-"}</p>
              </div>
            ) : null}
            <p className="mt-3 text-zinc-300">
              I/O active: <span className="font-medium">{state.io_active}</span>
            </p>
          </section>

          <section className="rounded-xl border border-white/10 bg-zinc-900/45 p-3">
            <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">Metrics</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-zinc-200">
              <span>Avg WT</span>
              <span className="text-right font-medium">{state.metrics.avg_wt.toFixed(2)}</span>
              <span>Avg TAT</span>
              <span className="text-right font-medium">{state.metrics.avg_tat.toFixed(2)}</span>
              <span>CPU Util</span>
              <span className="text-right font-medium">{state.metrics.cpu_util.toFixed(2)}%</span>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
