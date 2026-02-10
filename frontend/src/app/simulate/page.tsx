"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AddProcessModal } from "@/components/dashboard/AddProcessModal";
import { CompareView } from "@/components/dashboard/CompareView";
import { CpuPanel } from "@/components/dashboard/CpuPanel";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { QueuePanel } from "@/components/dashboard/QueuePanel";
import { Timeline } from "@/components/dashboard/Timeline";
import { TopBar } from "@/components/dashboard/TopBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockState } from "@/lib/mock";
import type { ProcessInput } from "@/lib/types";
import { useSimSocket } from "@/lib/ws";

const WS_URL = "ws://127.0.0.1:8000/ws/state";

const demoProcesses: ProcessInput[] = [
  { pid: "P1", arrival_time: 0, bursts: [5, 2, 2], priority: 2, queue: "USER" },
  { pid: "P2", arrival_time: 1, bursts: [3], priority: 1, queue: "SYS" },
  { pid: "P3", arrival_time: 2, bursts: [2, 3, 1], priority: 3, queue: "USER" },
];

export default function SimulatePage() {
  const { state, status, connect, disconnect, send } = useSimSocket(WS_URL);
  const [tab, setTab] = useState("simulation");
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAddProcess, setShowAddProcess] = useState(false);
  const tickIntervalRef = useRef<number | null>(null);

  const viewState = state ?? mockState;

  const clearTickLoop = useCallback(() => {
    if (tickIntervalRef.current !== null) {
      window.clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTickLoop();
      disconnect();
    };
  }, [connect, disconnect, clearTickLoop]);

  useEffect(() => {
    if (status === "connected") return;
    clearTickLoop();
    setIsPlaying(false);
  }, [status, clearTickLoop]);

  useEffect(() => {
    clearTickLoop();

    if (!isPlaying || status !== "connected") {
      return;
    }

    tickIntervalRef.current = window.setInterval(() => {
      send({ type: "tick" });
    }, viewState.tick_ms);

    return () => clearTickLoop();
  }, [isPlaying, status, viewState.tick_ms, send, clearTickLoop]);

  const onInitDemo = useCallback(() => {
    send({
      type: "init",
      algorithm: "RR",
      tick_ms: 200,
      quantum: 2,
      processes: demoProcesses,
    });
  }, [send]);

  const onStep = useCallback(() => {
    send({ type: "tick" });
  }, [send]);

  const onReset = useCallback(() => {
    send({ type: "reset" });
  }, [send]);

  const onSpeedChange = useCallback(
    (tickMs: number) => {
      send({ type: "set_speed", tick_ms: tickMs });
    },
    [send],
  );

  const onQuantumChange = useCallback(
    (quantum: number) => {
      send({ type: "set_quantum", quantum });
    },
    [send],
  );

  const onSubmitProcess = useCallback(
    (process: ProcessInput) => {
      send({ type: "add_process", process });
    },
    [send],
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Simulation</h1>
        <p className="text-sm text-zinc-400">Run live scheduling and compare algorithms.</p>
      </div>

      <TopBar
        state={viewState}
        connectionStatus={status}
        onInitDemo={onInitDemo}
        onStep={onStep}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        onReset={onReset}
        onSpeedChange={onSpeedChange}
        onQuantumChange={onQuantumChange}
        isPlaying={isPlaying}
        onAddProcess={() => setShowAddProcess(true)}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="border border-zinc-800/70 bg-zinc-900/70">
          <TabsTrigger value="simulation">Simulation</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="simulation" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
            <div className="space-y-4">
              <CpuPanel running={viewState.running} />
              <QueuePanel
                algorithm={viewState.algorithm}
                readyQueue={viewState.ready_queue}
                sysQueue={viewState.sys_queue}
                userQueue={viewState.user_queue}
              />
              <MetricsPanel metrics={viewState.metrics} />
            </div>

            <div className="space-y-4">
              <Timeline title="CPU Timeline" items={viewState.gantt} />
              <Timeline title="I/O Timeline" items={viewState.io_gantt} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <CompareView />
        </TabsContent>
      </Tabs>

      <AddProcessModal
        open={showAddProcess}
        onOpenChange={setShowAddProcess}
        onSubmitProcess={onSubmitProcess}
      />
    </div>
  );
}
