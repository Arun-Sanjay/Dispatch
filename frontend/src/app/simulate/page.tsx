"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { AddProcessModal } from "@/components/dashboard/AddProcessModal";
import { CompareView } from "@/components/dashboard/CompareView";
import { CpuPanel } from "@/components/dashboard/CpuPanel";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { QueuePanel } from "@/components/dashboard/QueuePanel";
import { Timeline } from "@/components/dashboard/Timeline";
import { TopBar } from "@/components/dashboard/TopBar";
import { DiagramMode } from "@/components/diagram/DiagramMode";
import { ReplayControls } from "@/components/sim/ReplayControls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockState } from "@/lib/mock";
import { getReplayMax, getReplayViewState } from "@/lib/replay";
import type { AlgorithmMode, ProcessInput, SimulatorState } from "@/lib/types";
import { type PlaybackRate, useReplayStore } from "@/store/replayStore";
import { useSimSocket } from "@/lib/ws";

const WS_URL = "ws://127.0.0.1:8000/ws/state";
const API_BASE = "http://127.0.0.1:8000";
const CONFIG_DEBOUNCE_MS = 200;

const demoProcesses: ProcessInput[] = [
  { pid: "P1", arrival_time: 0, bursts: [5, 2, 2], priority: 2, queue: "USER" },
  { pid: "P2", arrival_time: 1, bursts: [3], priority: 1, queue: "SYS" },
  { pid: "P3", arrival_time: 2, bursts: [2, 3, 1], priority: 3, queue: "USER" },
];

function deriveAlgorithmMode(state: SimulatorState): AlgorithmMode {
  if (state.algorithm === "PRIORITY") {
    return state.preemptive === false ? "PRIORITY_NP" : "PRIORITY_P";
  }
  if (state.algorithm === "FCFS" || state.algorithm === "SJF" || state.algorithm === "RR" || state.algorithm === "MLQ") {
    return state.algorithm;
  }
  return "FCFS";
}

function toConfigPayload(mode: AlgorithmMode, tickMs: number, quantum: number) {
  if (mode === "PRIORITY_NP") {
    return { algorithm: "PRIORITY", preemptive: false, tick_ms: tickMs, quantum };
  }
  if (mode === "PRIORITY_P") {
    return { algorithm: "PRIORITY", preemptive: true, tick_ms: tickMs, quantum };
  }
  return {
    algorithm: mode,
    preemptive: true,
    tick_ms: tickMs,
    quantum,
  };
}

function normalizeProcessInput(process: ProcessInput): ProcessInput {
  const bursts =
    process.bursts && process.bursts.length > 0
      ? process.bursts.map((value) => Math.max(1, Math.round(value)))
      : [Math.max(1, Math.round(process.burst_time ?? 1))];

  return {
    pid: process.pid.trim(),
    arrival_time: Math.max(0, Math.round(process.arrival_time)),
    priority: Math.max(0, Math.round(process.priority ?? 1)),
    queue: process.queue ?? "USER",
    bursts,
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    return payload.detail || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export default function SimulatePage() {
  const { state, status, connect, disconnect, send } = useSimSocket(WS_URL);
  const [tab, setTab] = useState("simulation");
  const [viewMode, setViewMode] = useState<"dashboard" | "diagram">("dashboard");
  const [livePlaying, setLivePlaying] = useState(false);
  const [showAddProcess, setShowAddProcess] = useState(false);
  const [showClearAddedConfirm, setShowClearAddedConfirm] = useState(false);
  const [addedProcesses, setAddedProcesses] = useState<ProcessInput[]>([]);
  const [algorithmMode, setAlgorithmMode] = useState<AlgorithmMode>("RR");
  const [tickMsControl, setTickMsControl] = useState(200);
  const [quantumControl, setQuantumControl] = useState(2);

  const mode = useReplayStore((s) => s.mode);
  const replayT = useReplayStore((s) => s.replayT);
  const replayMax = useReplayStore((s) => s.replayMax);
  const replayPlaying = useReplayStore((s) => s.isPlaying);
  const playbackRate = useReplayStore((s) => s.playbackRate);
  const setMode = useReplayStore((s) => s.setMode);
  const jumpTo = useReplayStore((s) => s.jumpTo);
  const setReplayMax = useReplayStore((s) => s.setReplayMax);
  const setReplayPlaying = useReplayStore((s) => s.setPlaying);
  const setPlaybackRate = useReplayStore((s) => s.setPlaybackRate);
  const stepReplay = useReplayStore((s) => s.stepReplay);

  const liveTickIntervalRef = useRef<number | null>(null);
  const replayRafRef = useRef<number | null>(null);
  const replayLastTsRef = useRef<number | null>(null);
  const replayAccumRef = useRef(0);
  const replayTRef = useRef(replayT);
  const configDebounceRef = useRef<number | null>(null);

  const liveState = state ?? mockState;
  const isReplay = mode === "replay";

  const replayState = useMemo(() => getReplayViewState(liveState, replayT), [liveState, replayT]);
  const effectiveState = isReplay ? replayState : liveState;

  const effectiveTickMs = isReplay
    ? Math.max(1, Math.round(liveState.tick_ms / playbackRate))
    : effectiveState.tick_ms;

  const animationRunning = isReplay ? replayPlaying : livePlaying && status === "connected";

  const existingPids = useMemo(
    () => Array.from(new Set(liveState.per_process.map((row) => row.pid).filter(Boolean))),
    [liveState.per_process],
  );

  const compareRefreshKey = useMemo(() => {
    const processPart = liveState.per_process
      .map((row) => `${row.pid}:${row.at}:${row.pr ?? 0}:${row.queue ?? "USER"}`)
      .join("|");
    const addedPart = addedProcesses
      .map((process) => {
        const bursts =
          process.bursts && process.bursts.length > 0
            ? process.bursts
            : [Math.max(1, Math.round(process.burst_time ?? 1))];
        return `${process.pid}:${process.arrival_time}:${bursts.join("-")}`;
      })
      .join("|");
    return `${liveState.algorithm}:${liveState.quantum}:${liveState.preemptive ? 1 : 0}:${processPart}:${addedPart}`;
  }, [liveState.algorithm, liveState.per_process, liveState.preemptive, liveState.quantum, addedProcesses]);

  useEffect(() => {
    if (mode === "live") {
      setAlgorithmMode(deriveAlgorithmMode(liveState));
      if (configDebounceRef.current === null) {
        setTickMsControl(liveState.tick_ms);
        setQuantumControl(liveState.quantum);
      }
    }
  }, [mode, liveState]);

  const clearLiveTickLoop = useCallback(() => {
    if (liveTickIntervalRef.current !== null) {
      window.clearInterval(liveTickIntervalRef.current);
      liveTickIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    replayTRef.current = replayT;
  }, [replayT]);

  useEffect(() => {
    connect();
    return () => {
      clearLiveTickLoop();
      if (replayRafRef.current !== null) {
        cancelAnimationFrame(replayRafRef.current);
      }
      if (configDebounceRef.current !== null) {
        window.clearTimeout(configDebounceRef.current);
      }
      disconnect();
    };
  }, [connect, disconnect, clearLiveTickLoop]);

  useEffect(() => {
    if (status === "connected") return;
    clearLiveTickLoop();
    setLivePlaying(false);
  }, [status, clearLiveTickLoop]);

  useEffect(() => {
    clearLiveTickLoop();

    if (mode !== "live" || !livePlaying || status !== "connected") {
      return;
    }

    liveTickIntervalRef.current = window.setInterval(() => {
      send({ type: "tick" });
    }, liveState.tick_ms);

    return () => clearLiveTickLoop();
  }, [mode, livePlaying, status, liveState.tick_ms, send, clearLiveTickLoop]);

  useEffect(() => {
    const max = getReplayMax(liveState);
    setReplayMax(max);
  }, [liveState, setReplayMax]);

  useEffect(() => {
    if (mode !== "replay" || !replayPlaying) {
      if (replayRafRef.current !== null) {
        cancelAnimationFrame(replayRafRef.current);
        replayRafRef.current = null;
      }
      replayLastTsRef.current = null;
      replayAccumRef.current = 0;
      return;
    }

    const frame = (now: number) => {
      if (replayLastTsRef.current === null) {
        replayLastTsRef.current = now;
      }

      const dt = now - (replayLastTsRef.current ?? now);
      replayLastTsRef.current = now;
      replayAccumRef.current += dt;

      const stepIntervalMs = Math.max(8, liveState.tick_ms / playbackRate);

      if (replayAccumRef.current >= stepIntervalMs) {
        const steps = Math.floor(replayAccumRef.current / stepIntervalMs);
        replayAccumRef.current -= steps * stepIntervalMs;

        const nextT = Math.min(replayTRef.current + steps, replayMax);
        jumpTo(nextT);

        if (nextT >= replayMax) {
          setReplayPlaying(false);
          return;
        }
      }

      replayRafRef.current = requestAnimationFrame(frame);
    };

    replayRafRef.current = requestAnimationFrame(frame);

    return () => {
      if (replayRafRef.current !== null) {
        cancelAnimationFrame(replayRafRef.current);
      }
      replayRafRef.current = null;
      replayLastTsRef.current = null;
      replayAccumRef.current = 0;
    };
  }, [mode, replayPlaying, liveState.tick_ms, playbackRate, replayMax, jumpTo, setReplayPlaying]);

  const applyConfig = useCallback(
    async (
      nextAlgorithmMode: AlgorithmMode,
      nextTickMs: number,
      nextQuantum: number,
      options?: { showToast?: boolean },
    ) => {
      if (isReplay) return;
      if (configDebounceRef.current !== null) {
        window.clearTimeout(configDebounceRef.current);
        configDebounceRef.current = null;
      }

      const payload = toConfigPayload(nextAlgorithmMode, nextTickMs, nextQuantum);
      setAlgorithmMode(nextAlgorithmMode);
      setTickMsControl(Math.round(nextTickMs));
      setQuantumControl(Math.round(nextQuantum));

      try {
        const configRes = await fetch(`${API_BASE}/sim/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!configRes.ok) {
          throw new Error(await parseErrorMessage(configRes));
        }

        const resetRes = await fetch(`${API_BASE}/sim/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!resetRes.ok) {
          throw new Error(await parseErrorMessage(resetRes));
        }

        send({ type: "sync" });
        if (options?.showToast !== false) {
          toast.success("Scheduler config applied");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to apply scheduler config";
        toast.error(message);
      }
    },
    [isReplay, send],
  );

  const scheduleDebouncedConfig = useCallback(
    (nextTickMs: number, nextQuantum: number) => {
      if (isReplay) return;

      if (configDebounceRef.current !== null) {
        window.clearTimeout(configDebounceRef.current);
      }

      configDebounceRef.current = window.setTimeout(() => {
        configDebounceRef.current = null;
        void applyConfig(algorithmMode, nextTickMs, nextQuantum, { showToast: false });
      }, CONFIG_DEBOUNCE_MS);
    },
    [algorithmMode, applyConfig, isReplay],
  );

  const onInitDemo = useCallback(() => {
    setAddedProcesses([]);
    send({
      type: "init",
      algorithm: "RR",
      tick_ms: 200,
      quantum: 2,
      processes: demoProcesses,
    });
  }, [send]);

  const onStep = useCallback(() => {
    if (isReplay) {
      setReplayPlaying(false);
      stepReplay(1);
      return;
    }
    send({ type: "tick" });
  }, [isReplay, send, setReplayPlaying, stepReplay]);

  const onReset = useCallback(() => {
    if (isReplay) {
      setReplayPlaying(false);
      jumpTo(0);
      return;
    }
    send({ type: "reset" });
  }, [isReplay, send, setReplayPlaying, jumpTo]);

  const onSpeedChange = useCallback(
    (tickMs: number) => {
      const nextTickMs = Math.max(50, Math.round(tickMs));
      setTickMsControl(nextTickMs);
      scheduleDebouncedConfig(nextTickMs, quantumControl);
    },
    [quantumControl, scheduleDebouncedConfig],
  );

  const onQuantumChange = useCallback(
    (quantum: number) => {
      const nextQuantum = Math.max(1, Math.round(quantum));
      setQuantumControl(nextQuantum);
      scheduleDebouncedConfig(tickMsControl, nextQuantum);
    },
    [scheduleDebouncedConfig, tickMsControl],
  );

  const onSubmitProcess = useCallback(
    async (process: ProcessInput) => {
      if (isReplay) {
        toast.error("Switch to Live mode to add processes");
        return false;
      }

      try {
        const response = await fetch(`${API_BASE}/sim/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(process),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }

        const normalized = normalizeProcessInput(process);
        setAddedProcesses((prev) => (prev.some((item) => item.pid === normalized.pid) ? prev : [...prev, normalized]));
        send({ type: "sync" });
        toast.success(`Added process ${process.pid}`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add process";
        toast.error(message);
        return false;
      }
    },
    [isReplay, send],
  );

  const onRemoveAddedProcess = useCallback(
    async (pid: string) => {
      if (isReplay) {
        toast.error("Switch to Live mode to remove processes");
        return false;
      }

      try {
        const response = await fetch(`${API_BASE}/sim/remove/${encodeURIComponent(pid)}`, {
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }

        setAddedProcesses((prev) => prev.filter((process) => process.pid !== pid));
        send({ type: "sync" });
        toast.success(`Removed process ${pid}`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to remove process ${pid}`;
        toast.error(message);
        return false;
      }
    },
    [isReplay, send],
  );

  const onClearAddedProcesses = useCallback(async () => {
    if (isReplay) {
      toast.error("Switch to Live mode to clear processes");
      return false;
    }

    try {
      const response = await fetch(`${API_BASE}/sim/clear_added`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await parseErrorMessage(response));
      }

      setAddedProcesses([]);
      send({ type: "sync" });
      toast.success("Cleared all added processes");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear added processes";
      toast.error(message);
      return false;
    }
  }, [isReplay, send]);

  const handleModeChange = useCallback(
    (nextMode: "live" | "replay") => {
      if (nextMode === "replay") {
        setLivePlaying(false);
        clearLiveTickLoop();
        setReplayPlaying(false);
        const max = getReplayMax(liveState);
        setReplayMax(max);
        jumpTo(Math.min(liveState.time, max));
      } else {
        setReplayPlaying(false);
      }
      setMode(nextMode);
    },
    [clearLiveTickLoop, jumpTo, liveState, setMode, setReplayMax, setReplayPlaying],
  );

  const handleReplayRate = useCallback(
    (rate: PlaybackRate) => {
      setPlaybackRate(rate);
    },
    [setPlaybackRate],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Simulation</h1>
          <p className="text-sm text-zinc-400">Run live scheduling, replay, and compare algorithms.</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 p-1">
          <Button
            size="sm"
            variant={viewMode === "dashboard" ? "default" : "ghost"}
            className={viewMode === "dashboard" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
            onClick={() => setViewMode("dashboard")}
          >
            Dashboard
          </Button>
          <Button
            size="sm"
            variant={viewMode === "diagram" ? "default" : "ghost"}
            className={viewMode === "diagram" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
            onClick={() => setViewMode("diagram")}
          >
            Diagram
          </Button>
        </div>
      </div>

      <ReplayControls
        mode={mode}
        onModeChange={handleModeChange}
        replayT={replayT}
        replayMax={replayMax}
        isPlaying={replayPlaying}
        playbackRate={playbackRate}
        onScrub={(t) => {
          setReplayPlaying(false);
          jumpTo(t);
        }}
        onPlayPause={() => setReplayPlaying(!replayPlaying)}
        onStepBack={() => {
          setReplayPlaying(false);
          stepReplay(-1);
        }}
        onStepForward={() => {
          setReplayPlaying(false);
          stepReplay(1);
        }}
        onStart={() => {
          setReplayPlaying(false);
          jumpTo(0);
        }}
        onEnd={() => {
          setReplayPlaying(false);
          jumpTo(replayMax);
        }}
        onRateChange={handleReplayRate}
      />

      <TopBar
        state={effectiveState}
        connectionStatus={status}
        algorithmMode={algorithmMode}
        tickMsValue={isReplay ? effectiveTickMs : tickMsControl}
        quantumValue={isReplay ? effectiveState.quantum : quantumControl}
        onAlgorithmModeChange={(nextMode) =>
          applyConfig(
            nextMode,
            isReplay ? effectiveTickMs : tickMsControl,
            isReplay ? effectiveState.quantum : quantumControl,
            { showToast: true },
          )
        }
        onInitDemo={onInitDemo}
        onStep={onStep}
        onTogglePlay={() => {
          if (isReplay) {
            setReplayPlaying(!replayPlaying);
            return;
          }
          setLivePlaying((prev) => !prev);
        }}
        onReset={onReset}
        onClearAdded={isReplay ? undefined : () => setShowClearAddedConfirm(true)}
        clearAddedDisabled={addedProcesses.length === 0}
        onSpeedChange={onSpeedChange}
        onQuantumChange={onQuantumChange}
        isPlaying={isReplay ? replayPlaying : livePlaying}
        onAddProcess={isReplay ? undefined : () => setShowAddProcess(true)}
        configControlsDisabled={isReplay}
      />

      {viewMode === "dashboard" ? (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="border border-zinc-800/70 bg-zinc-900/70">
            <TabsTrigger value="simulation">Simulation</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="simulation" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
              <div className="space-y-4">
                <CpuPanel running={effectiveState.running} />
                <QueuePanel
                  algorithm={effectiveState.algorithm}
                  readyQueue={effectiveState.ready_queue}
                  sysQueue={effectiveState.sys_queue}
                  userQueue={effectiveState.user_queue}
                />
                <MetricsPanel metrics={effectiveState.metrics} />
              </div>

              <div className="space-y-4">
                <Timeline
                  title="CPU Timeline"
                  items={effectiveState.gantt}
                  time={effectiveState.time}
                  tickMs={effectiveTickMs}
                  running={animationRunning}
                />
                <Timeline
                  title="I/O Timeline"
                  items={effectiveState.io_gantt}
                  time={effectiveState.time}
                  tickMs={effectiveTickMs}
                  running={animationRunning}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="compare">
            <CompareView refreshKey={compareRefreshKey} />
          </TabsContent>
        </Tabs>
      ) : (
        <DiagramMode
          state={effectiveState}
          playbackRunning={animationRunning}
          isReplay={isReplay}
          playbackTickMs={effectiveTickMs}
        />
      )}

      <AddProcessModal
        open={showAddProcess}
        onOpenChange={setShowAddProcess}
        onSubmitProcess={onSubmitProcess}
        addedProcesses={addedProcesses}
        onRemoveAddedProcess={onRemoveAddedProcess}
        onClearAddedProcesses={onClearAddedProcesses}
        existingPids={existingPids}
        disabled={isReplay}
      />

      <AlertDialog open={showClearAddedConfirm} onOpenChange={setShowClearAddedConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all added processes?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes only user-added processes and resets the simulation timeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const ok = await onClearAddedProcesses();
                if (ok) setShowClearAddedConfirm(false);
              }}
            >
              Clear Added
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
