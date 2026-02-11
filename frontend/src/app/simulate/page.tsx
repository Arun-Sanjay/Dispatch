"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { toast } from "sonner";

import { AddProcessModal } from "@/components/dashboard/AddProcessModal";
import { CompareView } from "@/components/dashboard/CompareView";
import { CpuPanel } from "@/components/dashboard/CpuPanel";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { QueuePanel } from "@/components/dashboard/QueuePanel";
import { RangeAnalyticsCard } from "@/components/dashboard/RangeAnalyticsCard";
import { Timeline } from "@/components/dashboard/Timeline";
import { TopBar } from "@/components/dashboard/TopBar";
import { DiagramMode } from "@/components/diagram/DiagramMode";
import { FocusHeader } from "@/components/focus/FocusHeader";
import { FocusMetricsMini } from "@/components/focus/FocusMetricsMini";
import { FocusTimelines } from "@/components/focus/FocusTimelines";
import { StateBoard } from "@/components/focus/StateBoard";
import { TickSummaryCard } from "@/components/focus/TickSummaryCard";
import { ReplayControls } from "@/components/sim/ReplayControls";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildTimelineAnalytics,
  clampTickRange,
  getEmptyRangeStats,
  type RangeStats,
  type TickRange,
  type TimelineAnalytics,
} from "@/lib/analytics/timelineAnalytics";
import { mockState } from "@/lib/mock";
import { getReplayMax, getReplayViewState } from "@/lib/replay";
import { deriveProcessStates } from "@/lib/sim/deriveProcessStates";
import { deriveHeadlineEvent } from "@/lib/sim/headlineEvent";
import type { AlgorithmMode, MemoryMode, ProcessInput, SimulatorState } from "@/lib/types";
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

function rangesEqual(a: TickRange, b: TickRange): boolean {
  return a.l === b.l && a.r === b.r;
}

function deriveAlgorithmMode(state: SimulatorState): AlgorithmMode {
  if (state.algorithm === "PRIORITY") {
    return state.preemptive === false ? "PRIORITY_NP" : "PRIORITY_P";
  }
  if (state.algorithm === "FCFS" || state.algorithm === "SJF" || state.algorithm === "RR" || state.algorithm === "MLQ") {
    return state.algorithm;
  }
  return "FCFS";
}

function toConfigPayload(
  mode: AlgorithmMode,
  tickMs: number,
  quantum: number,
  memory: { mode: MemoryMode; frames: number; algo: string; penalty: number; pageSize: number },
) {
  const commonMemory = {
    memory_mode: memory.mode,
    mem_enabled: memory.mode,
    frames_count: memory.frames,
    num_frames: memory.frames,
    frames: memory.frames,
    mem_algo: memory.algo,
    memory_algo: memory.algo,
    page_size: memory.pageSize,
    fault_penalty_ticks: memory.penalty,
  };
  if (mode === "PRIORITY_NP") {
    return { algorithm: "PRIORITY", preemptive: false, tick_ms: tickMs, quantum, ...commonMemory };
  }
  if (mode === "PRIORITY_P") {
    return { algorithm: "PRIORITY", preemptive: true, tick_ms: tickMs, quantum, ...commonMemory };
  }
  return {
    algorithm: mode,
    preemptive: true,
    tick_ms: tickMs,
    quantum,
    ...commonMemory,
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
    burst_segments: process.burst_segments,
    working_set_size: process.working_set_size,
    working_set_pages: process.working_set_pages,
    refs_per_cpu_tick: process.refs_per_cpu_tick,
    fault_penalty_ticks: process.fault_penalty_ticks,
    addr_pattern: process.addr_pattern,
    custom_addrs: process.custom_addrs,
    vm_size_bytes: process.vm_size_bytes,
    address_base: process.address_base,
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

function parseMemPid(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(":");
  if (parts.length < 2) return null;
  return parts[1] || null;
}

function getMemoryFrameCount(state: SimulatorState): number {
  const direct = state.memory.num_frames ?? state.memory.frames_count;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) return Math.floor(direct);
  if (Array.isArray(state.memory.frames) && state.memory.frames.length > 0) return state.memory.frames.length;
  return 4;
}

function getMemoryMode(state: SimulatorState): MemoryMode {
  return (state.memory.enabled ?? state.memory.mode ?? "CPU_ONLY") as MemoryMode;
}

function buildStateWarnings(state: SimulatorState): string[] {
  const warnings: string[] = [];
  const ioTail = state.io_gantt[state.io_gantt.length - 1] ?? "IDLE";
  const memTail = state.mem_gantt[state.mem_gantt.length - 1] ?? "IDLE";
  const memTailPid = parseMemPid(memTail);

  for (const process of state.processes ?? []) {
    if (process.state === "WAITING_IO" && ioTail !== process.pid) {
      warnings.push(
        `${process.pid} is WAITING_IO, but latest I/O timeline tick is ${ioTail}.`,
      );
    }

    if (process.state === "WAITING_MEM") {
      const memHasFault = memTail.toUpperCase().startsWith("FAULT");
      if (!memHasFault || memTailPid !== process.pid) {
        warnings.push(
          `${process.pid} is WAITING_MEM, but latest memory timeline tick is ${memTail}.`,
        );
      }
    }
  }

  return warnings.slice(0, 3);
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
  const [systemMode, setSystemMode] = useState<MemoryMode>("CPU_ONLY");
  const [tickMsControl, setTickMsControl] = useState(200);
  const [quantumControl, setQuantumControl] = useState(2);
  const [cpuRange, setCpuRange] = useState<TickRange>({ l: 0, r: 0 });
  const [ioRange, setIoRange] = useState<TickRange>({ l: 0, r: 0 });
  const [cpuRangeStats, setCpuRangeStats] = useState<RangeStats>(getEmptyRangeStats());
  const [ioRangeStats, setIoRangeStats] = useState<RangeStats>(getEmptyRangeStats());
  const [autoFollow, setAutoFollow] = useState(true);
  const [uiMode, setUiMode] = useState<"FOCUS" | "CLASSIC">("FOCUS");
  const [showFocusAnalytics, setShowFocusAnalytics] = useState(false);
  const [showFocusEventLog, setShowFocusEventLog] = useState(false);
  const [showFocusPerProcess, setShowFocusPerProcess] = useState(false);

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
  const cpuAnalyticsRef = useRef<TimelineAnalytics | null>(null);
  const ioAnalyticsRef = useRef<TimelineAnalytics | null>(null);

  const liveState = state ?? mockState;
  const isReplay = mode === "replay";

  const replayState = useMemo(() => getReplayViewState(liveState, replayT), [liveState, replayT]);
  const effectiveState = isReplay ? replayState : liveState;
  const liveFrameCount = useMemo(() => getMemoryFrameCount(liveState), [liveState]);
  const effectiveFrameCount = useMemo(() => getMemoryFrameCount(effectiveState), [effectiveState]);
  const livePageSize = useMemo(
    () => Math.max(1, liveState.memory.page_size ?? 4096),
    [liveState.memory.page_size],
  );
  const liveMemoryMode = useMemo(() => getMemoryMode(liveState), [liveState]);
  const effectiveMemoryMode = useMemo(() => getMemoryMode(effectiveState), [effectiveState]);
  const memoryTimeline = useMemo(
    () =>
      effectiveState.mem_gantt.length > 0
        ? effectiveState.mem_gantt
        : effectiveState.memory.mem_gantt,
    [effectiveState.mem_gantt, effectiveState.memory.mem_gantt],
  );
  const lastMemoryEvent = useMemo(() => {
    const log = effectiveState.memory.last_translation_log ?? [];
    if (log.length === 0) return "No translations yet";
    return log[log.length - 1] ?? "No translations yet";
  }, [effectiveState.memory.last_translation_log]);
  const stateWarnings = useMemo(() => buildStateWarnings(effectiveState), [effectiveState]);
  const derivedStates = useMemo(() => deriveProcessStates(effectiveState), [effectiveState]);
  const headlineEvent = useMemo(() => deriveHeadlineEvent(effectiveState), [effectiveState]);

  const effectiveTickMs = isReplay
    ? Math.max(1, Math.round(liveState.tick_ms / playbackRate))
    : effectiveState.tick_ms;

  const animationRunning = isReplay ? replayPlaying : livePlaying && status === "connected";
  const cpuMaxTick = Math.max(0, effectiveState.gantt.length - 1);
  const ioMaxTick = Math.max(0, effectiveState.io_gantt.length - 1);

  const existingPids = useMemo(
    () => Array.from(new Set(liveState.per_process.map((row) => row.pid).filter(Boolean))),
    [liveState.per_process],
  );
  const allProcesses = useMemo<ProcessInput[]>(
    () =>
      liveState.processes.map((process) => ({
        pid: process.pid,
        arrival_time: process.arrival_time,
        priority: process.priority ?? 1,
        queue: process.queue ?? "USER",
        bursts: process.bursts ?? [Math.max(1, process.remaining_in_current_burst ?? 1)],
        working_set_pages: process.working_set_pages,
        refs_per_cpu_tick: process.refs_per_cpu_tick,
        addr_pattern:
          process.addr_pattern === "SEQ" ||
          process.addr_pattern === "LOOP" ||
          process.addr_pattern === "RAND" ||
          process.addr_pattern === "CUSTOM"
            ? process.addr_pattern
            : undefined,
        vm_size_bytes: process.vm_size_bytes,
        address_base: process.address_base,
      })),
    [liveState.processes],
  );

  const clampCpuRange = useCallback((range: TickRange) => clampTickRange(range, cpuMaxTick), [cpuMaxTick]);
  const clampIoRange = useCallback((range: TickRange) => clampTickRange(range, ioMaxTick), [ioMaxTick]);

  useEffect(() => {
    if (!cpuAnalyticsRef.current) {
      cpuAnalyticsRef.current = buildTimelineAnalytics(effectiveState.gantt);
    } else {
      cpuAnalyticsRef.current.sync(effectiveState.gantt);
    }

    const normalizedRange = clampCpuRange(cpuRange);
    if (!rangesEqual(normalizedRange, cpuRange)) {
      setCpuRange(normalizedRange);
      setCpuRangeStats(cpuAnalyticsRef.current.getRangeStats(normalizedRange.l, normalizedRange.r));
      return;
    }
    setCpuRangeStats(cpuAnalyticsRef.current.getRangeStats(cpuRange.l, cpuRange.r));
  }, [effectiveState.gantt, cpuRange, clampCpuRange]);

  useEffect(() => {
    if (!ioAnalyticsRef.current) {
      ioAnalyticsRef.current = buildTimelineAnalytics(effectiveState.io_gantt);
    } else {
      ioAnalyticsRef.current.sync(effectiveState.io_gantt);
    }

    const normalizedRange = clampIoRange(ioRange);
    if (!rangesEqual(normalizedRange, ioRange)) {
      setIoRange(normalizedRange);
      setIoRangeStats(ioAnalyticsRef.current.getRangeStats(normalizedRange.l, normalizedRange.r));
      return;
    }
    setIoRangeStats(ioAnalyticsRef.current.getRangeStats(ioRange.l, ioRange.r));
  }, [effectiveState.io_gantt, ioRange, clampIoRange]);

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
      setSystemMode(liveMemoryMode);
      if (configDebounceRef.current === null) {
        setTickMsControl(liveState.tick_ms);
        setQuantumControl(liveState.quantum);
      }
    }
  }, [mode, liveState, liveMemoryMode]);

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

      const payload = toConfigPayload(nextAlgorithmMode, nextTickMs, nextQuantum, {
        mode: systemMode,
        frames: liveFrameCount,
        algo: liveState.memory.algo,
        penalty: liveState.memory.fault_penalty,
        pageSize: livePageSize,
      });
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
    [isReplay, liveFrameCount, livePageSize, liveState.memory.algo, liveState.memory.fault_penalty, send, systemMode],
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
      memory_mode: systemMode,
      mem_enabled: systemMode,
      frames_count: liveFrameCount,
      num_frames: liveFrameCount,
      mem_algo: liveState.memory.algo,
      page_size: livePageSize,
      fault_penalty_ticks: liveState.memory.fault_penalty,
      processes: demoProcesses,
    });
  }, [liveFrameCount, livePageSize, liveState.memory.algo, liveState.memory.fault_penalty, send, systemMode]);

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

  const onSystemModeChange = useCallback(
    async (nextMode: MemoryMode) => {
      if (isReplay) return;
      setSystemMode(nextMode);

      try {
        const response = await fetch(`${API_BASE}/sim/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            memory_mode: nextMode,
            mem_enabled: nextMode,
            frames_count: liveFrameCount,
            num_frames: liveFrameCount,
            mem_algo: liveState.memory.algo,
            page_size: livePageSize,
            fault_penalty_ticks: liveState.memory.fault_penalty,
          }),
        });

        if (!response.ok) {
          throw new Error(await parseErrorMessage(response));
        }
        send({ type: "sync" });
        toast.success(`System mode set to ${nextMode === "FULL" ? "Full System" : "CPU Only"}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update system mode";
        toast.error(message);
      }
    },
    [isReplay, liveFrameCount, livePageSize, liveState.memory.algo, liveState.memory.fault_penalty, send],
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 p-1">
            <Button
              size="sm"
              variant={systemMode === "CPU_ONLY" ? "default" : "ghost"}
              className={systemMode === "CPU_ONLY" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
              onClick={() => void onSystemModeChange("CPU_ONLY")}
              disabled={isReplay}
            >
              CPU Only
            </Button>
            <Button
              size="sm"
              variant={systemMode === "FULL" ? "default" : "ghost"}
              className={systemMode === "FULL" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
              onClick={() => void onSystemModeChange("FULL")}
              disabled={isReplay}
            >
              Full System (CPU + Memory)
            </Button>
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

          {viewMode === "dashboard" ? (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 p-1">
              <Button
                size="sm"
                variant={uiMode === "FOCUS" ? "default" : "ghost"}
                className={uiMode === "FOCUS" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
                onClick={() => setUiMode("FOCUS")}
              >
                Focus
              </Button>
              <Button
                size="sm"
                variant={uiMode === "CLASSIC" ? "default" : "ghost"}
                className={uiMode === "CLASSIC" ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300 hover:text-zinc-100"}
                onClick={() => setUiMode("CLASSIC")}
              >
                Classic
              </Button>
            </div>
          ) : null}
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

      {viewMode === "dashboard" && tab === "simulation" && uiMode === "FOCUS" ? (
        <FocusHeader
          state={effectiveState}
          uiMode={uiMode}
          onUiModeChange={setUiMode}
          isPlaying={isReplay ? replayPlaying : livePlaying}
          onTogglePlay={() => {
            if (isReplay) {
              setReplayPlaying(!replayPlaying);
              return;
            }
            setLivePlaying((prev) => !prev);
          }}
          onStep={onStep}
          onReset={onReset}
          onAddProcess={() => {
            if (!isReplay) setShowAddProcess(true);
          }}
          onCompare={() => setTab("compare")}
        />
      ) : (
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
      )}

      {viewMode === "dashboard" ? (
        <Tabs value={tab} onValueChange={setTab} className="gap-4">
          <TabsList className="border border-zinc-800/70 bg-zinc-900/70">
            <TabsTrigger value="simulation">Simulation</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="simulation" className="space-y-4">
            {uiMode === "FOCUS" ? (
              <div className="space-y-4">
                <TickSummaryCard state={effectiveState} headline={headlineEvent} />
                <StateBoard state={effectiveState} states={derivedStates} />

                <div className="flex items-center justify-end gap-2">
                  <span className="text-xs text-zinc-400">Auto-follow</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={autoFollow ? "default" : "outline"}
                    className={autoFollow ? "bg-white text-black hover:bg-zinc-200" : ""}
                    onClick={() => setAutoFollow((prev) => !prev)}
                  >
                    {autoFollow ? "On" : "Off"}
                  </Button>
                </div>

                <FocusTimelines
                  state={effectiveState}
                  tickMs={effectiveTickMs}
                  running={animationRunning}
                  autoFollow={autoFollow}
                />
                <FocusMetricsMini state={effectiveState} />

                {stateWarnings.length > 0 ? (
                  <Card className="border-amber-500/30 bg-amber-950/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-amber-200">State Warnings</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs text-amber-100/90">
                      {stateWarnings.map((warning) => (
                        <p key={warning} className="rounded-md border border-amber-300/25 bg-amber-900/20 px-2 py-1">
                          {warning}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                <Card className="border-zinc-800/70 bg-zinc-950/60">
                  <CardContent className="pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => setShowFocusAnalytics((prev) => !prev)}>
                        {showFocusAnalytics ? "Hide Range Analytics" : "Show Range Analytics"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowFocusEventLog((prev) => !prev)}>
                        {showFocusEventLog ? "Hide Full Event Log" : "Show Full Event Log"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setShowFocusPerProcess((prev) => !prev)}>
                        {showFocusPerProcess ? "Hide Per-Process Table" : "Show Per-Process Table"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {showFocusAnalytics ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <RangeAnalyticsCard
                      title="CPU Range Analytics"
                      range={cpuRange}
                      maxTick={cpuMaxTick}
                      stats={cpuRangeStats}
                      onRangeChange={(nextRange) => setCpuRange(clampCpuRange(nextRange))}
                    />
                    <RangeAnalyticsCard
                      title="I/O Range Analytics"
                      range={ioRange}
                      maxTick={ioMaxTick}
                      stats={ioRangeStats}
                      onRangeChange={(nextRange) => setIoRange(clampIoRange(nextRange))}
                    />
                  </div>
                ) : null}

                {showFocusEventLog ? (
                  <Card className="border-zinc-800/70 bg-zinc-950/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Full Event Log</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs text-zinc-300">
                      {effectiveState.event_log.slice(-80).map((line, idx) => (
                        <p key={`${idx}-${line}`} className="font-mono">{line}</p>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}

                {showFocusPerProcess ? (
                  <Card className="border-zinc-800/70 bg-zinc-950/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Per-Process Table</CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="min-w-full text-left text-xs text-zinc-300">
                        <thead className="text-zinc-400">
                          <tr>
                            <th className="px-2 py-1">PID</th>
                            <th className="px-2 py-1">AT</th>
                            <th className="px-2 py-1">PR</th>
                            <th className="px-2 py-1">ST</th>
                            <th className="px-2 py-1">CT</th>
                            <th className="px-2 py-1">TAT</th>
                            <th className="px-2 py-1">WT</th>
                            <th className="px-2 py-1">RT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {effectiveState.per_process.map((row) => (
                            <tr key={row.pid} className="border-t border-zinc-800/70">
                              <td className="px-2 py-1">{row.pid}</td>
                              <td className="px-2 py-1">{row.at}</td>
                              <td className="px-2 py-1">{row.pr ?? "-"}</td>
                              <td className="px-2 py-1">{row.st ?? "-"}</td>
                              <td className="px-2 py-1">{row.ct ?? "-"}</td>
                              <td className="px-2 py-1">{row.tat ?? "-"}</td>
                              <td className="px-2 py-1">{row.wt ?? "-"}</td>
                              <td className="px-2 py-1">{row.rt ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ) : (
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
                  {effectiveMemoryMode === "FULL" ? (
                    <Card className="border-zinc-800/70 bg-zinc-950/60">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Memory (Full Mode)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-zinc-300">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-zinc-200">
                            {effectiveState.memory.algo}
                          </Badge>
                          <Badge variant="outline" className="text-zinc-200">
                            frames {effectiveFrameCount}
                          </Badge>
                          <Badge variant="outline" className="text-zinc-200">
                            penalty {effectiveState.memory.fault_penalty}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2">
                            <p className="text-zinc-500">Faults</p>
                            <p className="font-semibold text-rose-300">{effectiveState.memory.faults}</p>
                          </div>
                          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2">
                            <p className="text-zinc-500">Hits</p>
                            <p className="font-semibold text-emerald-300">{effectiveState.memory.hits}</p>
                          </div>
                          <div className="rounded-md border border-zinc-800/70 bg-zinc-900/50 p-2">
                            <p className="text-zinc-500">Hit Ratio</p>
                            <p className="font-semibold text-zinc-100">
                              {(effectiveState.memory.hit_ratio * 100).toFixed(1)}%
                            </p>
                          </div>
                        </div>
                        <div className="rounded-md border border-zinc-800/70 bg-zinc-900/45 p-2 text-xs text-zinc-300">
                          <p className="text-zinc-500">Last Translation</p>
                          <p className="truncate font-mono text-[11px]">{lastMemoryEvent}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                  {stateWarnings.length > 0 ? (
                    <Card className="border-amber-500/30 bg-amber-950/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-amber-200">State Warnings</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs text-amber-100/90">
                        {stateWarnings.map((warning) => (
                          <p key={warning} className="rounded-md border border-amber-300/25 bg-amber-900/20 px-2 py-1">
                            {warning}
                          </p>
                        ))}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-zinc-400">Auto-follow</span>
                    <Button
                      type="button"
                      size="sm"
                      variant={autoFollow ? "default" : "outline"}
                      className={autoFollow ? "bg-white text-black hover:bg-zinc-200" : ""}
                      onClick={() => setAutoFollow((prev) => !prev)}
                    >
                      {autoFollow ? "On" : "Off"}
                    </Button>
                  </div>
                  <Timeline
                    title="CPU Timeline"
                    items={effectiveState.gantt}
                    time={effectiveState.time}
                    tickMs={effectiveTickMs}
                    running={animationRunning}
                    autoFollow={autoFollow}
                    selectedRange={cpuRange}
                    onRangeChange={(nextRange) => setCpuRange(clampCpuRange(nextRange))}
                  />
                  <Timeline
                    title="I/O Timeline"
                    items={effectiveState.io_gantt}
                    time={effectiveState.time}
                    tickMs={effectiveTickMs}
                    running={animationRunning}
                    autoFollow={autoFollow}
                    selectedRange={ioRange}
                    onRangeChange={(nextRange) => setIoRange(clampIoRange(nextRange))}
                  />
                  <Timeline
                    title="Memory Timeline"
                    items={memoryTimeline}
                    time={effectiveState.time}
                    tickMs={effectiveTickMs}
                    running={animationRunning}
                    autoFollow={autoFollow}
                    variant="memory"
                  />

                  <div className="grid gap-4 lg:grid-cols-2">
                    <RangeAnalyticsCard
                      title="CPU Range Analytics"
                      range={cpuRange}
                      maxTick={cpuMaxTick}
                      stats={cpuRangeStats}
                      onRangeChange={(nextRange) => setCpuRange(clampCpuRange(nextRange))}
                    />
                    <RangeAnalyticsCard
                      title="I/O Range Analytics"
                      range={ioRange}
                      maxTick={ioMaxTick}
                      stats={ioRangeStats}
                      onRangeChange={(nextRange) => setIoRange(clampIoRange(nextRange))}
                    />
                  </div>
                </div>
              </div>
            )}
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
        allProcesses={allProcesses}
        systemMode={liveMemoryMode}
        pageSizeBytes={livePageSize}
        onModeChange={(nextMode) => {
          void onSystemModeChange(nextMode);
        }}
        onRemoveAddedProcess={onRemoveAddedProcess}
        onClearAddedProcesses={onClearAddedProcesses}
        onResetProcesses={async () => {
          if (isReplay) {
            toast.error("Switch to Live mode to reset processes");
            return false;
          }
          setAddedProcesses([]);
          try {
            const response = await fetch(`${API_BASE}/sim/init`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                algorithm: deriveAlgorithmMode(liveState),
                preemptive:
                  deriveAlgorithmMode(liveState) === "PRIORITY_NP"
                    ? false
                    : deriveAlgorithmMode(liveState) === "PRIORITY_P"
                      ? true
                      : liveState.preemptive ?? true,
                tick_ms: liveState.tick_ms,
                quantum: liveState.quantum,
                mem_enabled: liveMemoryMode,
                memory_mode: liveMemoryMode,
                num_frames: liveFrameCount,
                frames_count: liveFrameCount,
                mem_algo: liveState.memory.algo,
                page_size: livePageSize,
                fault_penalty_ticks: liveState.memory.fault_penalty,
                processes: [],
              }),
            });
            if (!response.ok) {
              throw new Error(await parseErrorMessage(response));
            }
            send({ type: "sync" });
            toast.success("Simulation reset with empty process list");
            return true;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to reset processes";
            toast.error(message);
            return false;
          }
        }}
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
