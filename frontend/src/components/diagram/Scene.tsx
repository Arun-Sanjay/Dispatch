"use client";

import { useEffect, useMemo, useRef } from "react";

import { Environment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

import { parseSimEvents } from "@/components/diagram/events";
import { Hotspots } from "@/components/diagram/Hotspots";
import { DoneBay } from "@/components/diagram/components/DoneBay";
import { IoBlock } from "@/components/diagram/components/IoBlock";
import { Pcb } from "@/components/diagram/components/Pcb";
import { ReadyQueueLane } from "@/components/diagram/components/ReadyQueueLane";
import { Ram } from "@/components/diagram/components/Ram";
import { Soc } from "@/components/diagram/components/Soc";
import { TokenAnimator } from "@/components/diagram/components/TokenAnimator";
import { Timeline3D } from "@/components/diagram/Timeline3D";
import { type FocusTarget, useCinematicCamera } from "@/components/diagram/useCinematicCamera";
import {
  applyEventTransition,
  ensureTokensForState,
  queueListFromState,
  syncQueueSlots,
  type SceneAnchors,
  type TokenRegistry,
} from "@/components/diagram/state";
import type { SimulatorState } from "@/lib/types";

type SceneProps = {
  state: SimulatorState;
  view: FocusTarget;
  onViewChange: (target: FocusTarget) => void;
  onCompletionPulse?: () => void;
  playbackRunning?: boolean;
  playbackTickMs?: number;
  isReplay?: boolean;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function extractLastSliceTimeForPid(eventLog: string[], pid: string): number | null {
  if (!pid || pid === "IDLE") return null;
  const pattern = new RegExp(`t\\s*=\\s*(\\d+):\\s*${pid}\\s+.*time slice`, "i");
  for (let i = eventLog.length - 1; i >= 0; i -= 1) {
    const line = eventLog[i];
    if (!pattern.test(line)) continue;
    const match = line.match(/t\s*=\s*(\d+)/i);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function buildAnchors(): SceneAnchors {
  const queueSlots: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i += 1) {
    queueSlots.push(new THREE.Vector3(1.58 + i * 0.34, 0.47, 2.02));
  }

  const doneSlots: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i += 1) {
    doneSlots.push(new THREE.Vector3(4.04 + i * 0.28, 1.14, -0.14));
  }

  return {
    queueSlots,
    queueExit: new THREE.Vector3(2.95, 0.47, 1.82),
    queueReturn: new THREE.Vector3(2.2, 0.47, 1.82),
    cpuPort: new THREE.Vector3(0.04, 0.64, 1.28),
    ioPort: new THREE.Vector3(3.78, 0.42, -0.28),
    ioReturn: new THREE.Vector3(2.2, 0.47, 1.82),
    doneSlots,
  };
}

export function Scene({
  state,
  view,
  onViewChange,
  onCompletionPulse,
  playbackRunning = true,
  playbackTickMs,
  isReplay = false,
}: SceneProps) {
  const { focus } = useCinematicCamera("OVERVIEW");
  const focusMode = view === "CPU_FOCUS";

  const registryRef = useRef<TokenRegistry>(new Map());
  const lastProcessedEventIndexRef = useRef(0);

  const readyPulseRef = useRef(0);
  const ioPulseRef = useRef(0);
  const returnPulseRef = useRef(0);

  const anchors = useMemo(() => buildAnchors(), []);
  const queueList = useMemo(() => queueListFromState(state), [state]);

  const quantumProgress = useMemo(() => {
    if (!(state.algorithm === "RR" || state.algorithm === "MLQ")) return 0;
    if (state.running === "IDLE") return 0;
    const quantum = Math.max(1, state.quantum);
    const lastSlice = extractLastSliceTimeForPid(state.event_log, state.running);
    if (lastSlice !== null) return clamp01((state.time - lastSlice) / quantum);
    return clamp01((state.time % quantum) / quantum);
  }, [state.algorithm, state.event_log, state.quantum, state.running, state.time]);

  useEffect(() => {
    focus(view);
  }, [focus, view]);

  useEffect(() => {
    ensureTokensForState(registryRef.current, state);

    const queue = queueListFromState(state);
    const queueSlotByPid = new Map<string, number>();
    for (let i = 0; i < Math.min(queue.length, 8); i += 1) queueSlotByPid.set(queue[i], i);

    if (isReplay && !playbackRunning) {
      lastProcessedEventIndexRef.current = state.event_log.length;
      for (const token of registryRef.current.values()) {
        token.pathName = undefined;
        token.pathProgress = 0;
        token.lastUpdateT = state.time;
        if (state.completed.includes(token.pid)) {
          token.logicalLocation = "DONE_BAY";
          continue;
        }
        if (state.running === token.pid) {
          token.logicalLocation = "CPU_PORT";
          continue;
        }
        if (state.io_active === token.pid || state.io_queue.includes(token.pid)) {
          token.logicalLocation = "IO_BLOCK";
          continue;
        }
        const slot = queueSlotByPid.get(token.pid);
        token.logicalLocation = "QUEUE_SLOT";
        token.queueSlotIndex = typeof slot === "number" ? slot : 0;
      }
      return;
    }

    if (state.event_log.length < lastProcessedEventIndexRef.current) {
      lastProcessedEventIndexRef.current = 0;
    }

    const nextIndex = lastProcessedEventIndexRef.current;
    const newEvents = parseSimEvents(state.event_log, nextIndex);
    lastProcessedEventIndexRef.current = state.event_log.length;

    for (const event of newEvents) {
      applyEventTransition(registryRef.current, event);
      if (event.from === "READY" && event.to === "RUNNING") {
        readyPulseRef.current = 1;
      } else if (event.from === "RUNNING" && event.to === "WAITING") {
        ioPulseRef.current = 1;
      } else if (
        (event.from === "WAITING" && event.to === "READY") ||
        (event.from === "RUNNING" && event.to === "READY")
      ) {
        returnPulseRef.current = 1;
      } else if (event.from === "RUNNING" && event.to === "DONE") {
        onCompletionPulse?.();
      }
    }

    syncQueueSlots(registryRef.current, state);
  }, [isReplay, onCompletionPulse, playbackRunning, state]);

  useFrame((_ctx, delta) => {
    readyPulseRef.current = Math.max(0, readyPulseRef.current - delta * 2.8);
    ioPulseRef.current = Math.max(0, ioPulseRef.current - delta * 2.6);
    returnPulseRef.current = Math.max(0, returnPulseRef.current - delta * 2.8);
  });

  return (
    <>
      <color attach="background" args={["#05070d"]} />
      <fog attach="fog" args={["#060910", 8, 22]} />

      <ambientLight intensity={0.24} />
      <directionalLight position={[7, 9, 6]} intensity={1.15} color="#dbeafe" />
      <pointLight position={[0, 2.8, 2]} intensity={0.8} color="#67e8f9" distance={11} />
      <pointLight position={[-3.8, 2.2, -0.2]} intensity={0.55} color="#a78bfa" distance={7} />
      <pointLight position={[3.9, 2.3, -0.6]} intensity={0.5} color="#f59e0b" distance={7} />

      <Environment preset="city" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[28, 28]} />
        <meshStandardMaterial color="#080b12" roughness={0.92} metalness={0.18} />
      </mesh>

      <Pcb readyPulseRef={readyPulseRef} ioPulseRef={ioPulseRef} returnPulseRef={returnPulseRef} />

      <Soc
        runningPid={state.running}
        algorithm={state.algorithm}
        quantumProgress={quantumProgress}
        completionTick={state.completed.length}
      />

      <ReadyQueueLane queue={queueList} focusMode={focusMode} />
      <Ram dimmed={focusMode} />
      <IoBlock ioActivePid={state.io_active} dimmed={focusMode} />
      <DoneBay completedCount={state.completed.length} focusMode={focusMode} />

      <TokenAnimator
        registryRef={registryRef}
        anchors={anchors}
        state={state}
        isReplay={isReplay}
        playbackRunning={playbackRunning}
      />

      <Timeline3D
        gantt={state.gantt}
        ioGantt={state.io_gantt}
        time={state.time}
        tickMs={playbackTickMs ?? state.tick_ms}
        running={playbackRunning}
      />

      <Hotspots
        selected={view}
        onSelect={(target) => {
          onViewChange(target);
          focus(target);
        }}
      />

      <EffectComposer multisampling={4}>
        <Bloom intensity={focusMode ? 0.5 : 0.42} mipmapBlur luminanceThreshold={0.28} />
        <DepthOfField
          focusDistance={focusMode ? 0.01 : 0.02}
          focalLength={focusMode ? 0.028 : 0.022}
          bokehScale={focusMode ? 2.1 : 1.35}
        />
        <Vignette eskil={false} offset={0.16} darkness={0.56} />
        <Noise premultiply opacity={0.018} />
      </EffectComposer>
    </>
  );
}
