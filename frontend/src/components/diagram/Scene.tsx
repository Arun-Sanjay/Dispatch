"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Environment } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";

import { Hotspots } from "@/components/diagram/Hotspots";
import { IoController } from "@/components/diagram/components/IoController";
import { Pcb } from "@/components/diagram/components/Pcb";
import { QueueCartridge } from "@/components/diagram/components/QueueCartridge";
import { Ram } from "@/components/diagram/components/Ram";
import { Soc } from "@/components/diagram/components/Soc";
import { ioCurve, memCurve, readyCurve } from "@/components/diagram/paths";
import { getPidColor } from "@/components/diagram/pidColors";
import { Timeline3D } from "@/components/diagram/Timeline3D";
import { type FocusTarget, useCinematicCamera } from "@/components/diagram/useCinematicCamera";
import { useSimEffects } from "@/components/diagram/useSimEffects";
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

type PacketRoute = "io" | "mem" | "ready";

type Packet = {
  id: number;
  pid: string;
  route: PacketRoute;
  startTs: number;
  durationMs: number;
};

const CURVE_BY_ROUTE: Record<PacketRoute, THREE.CatmullRomCurve3> = {
  ready: readyCurve,
  mem: memCurve,
  io: ioCurve,
};

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

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

function queueForCartridge(state: SimulatorState): string[] {
  if (state.algorithm === "MLQ") {
    return [...(state.sys_queue ?? []), ...(state.user_queue ?? [])];
  }
  return state.ready_queue;
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

  const readyPulseRef = useRef(0);
  const ioPulseRef = useRef(0);
  const memoryPulseRef = useRef(0);
  const nextPacketIdRef = useRef(1);

  const packetMeshRefs = useRef<Record<number, THREE.Mesh | null>>({});
  const packetPosRef = useRef(new THREE.Vector3());

  const [packets, setPackets] = useState<Packet[]>([]);
  const packetsRef = useRef<Packet[]>([]);
  const [dispatchToken, setDispatchToken] = useState(0);
  const [dispatchPid, setDispatchPid] = useState<string | null>(null);
  const [completionTick, setCompletionTick] = useState(0);

  const queueList = useMemo(() => queueForCartridge(state), [state]);

  const quantumProgress = useMemo(() => {
    if (!(state.algorithm === "RR" || state.algorithm === "MLQ")) return 0;
    if (state.running === "IDLE") return 0;
    const quantum = Math.max(1, state.quantum);
    const lastSlice = extractLastSliceTimeForPid(state.event_log, state.running);
    if (lastSlice !== null) {
      return clamp01((state.time - lastSlice) / quantum);
    }
    return clamp01((state.time % quantum) / quantum);
  }, [state.algorithm, state.event_log, state.quantum, state.running, state.time]);

  useEffect(() => {
    focus(view);
  }, [focus, view]);

  useEffect(() => {
    packetsRef.current = packets;
  }, [packets]);

  const spawnPacket = useCallback(
    (route: PacketRoute, pid: string) => {
      if (isReplay && !playbackRunning) return;
      const packet: Packet = {
        id: nextPacketIdRef.current++,
        pid,
        route,
        startTs: performance.now(),
        durationMs:
          route === "ready"
            ? 360 + Math.random() * 100
            : route === "io"
              ? 520 + Math.random() * 120
              : 300 + Math.random() * 100,
      };
      setPackets((previous) => {
        const merged = [...previous, packet];
        return merged.length > 12 ? merged.slice(merged.length - 12) : merged;
      });
    },
    [isReplay, playbackRunning],
  );

  const handlers = useMemo(
    () => ({
      onDispatch: (pid: string) => {
        if (isReplay && !playbackRunning) return;
        setDispatchPid(pid);
        setDispatchToken((value) => value + 1);
        readyPulseRef.current = 1;
        spawnPacket("ready", pid);
      },
      onIoIngress: (pid: string) => {
        if (isReplay && !playbackRunning) return;
        ioPulseRef.current = 1;
        spawnPacket("io", pid);
      },
      onComplete: () => {
        if (isReplay && !playbackRunning) return;
        memoryPulseRef.current = 1;
        setCompletionTick((value) => value + 1);
        spawnPacket("mem", state.running === "IDLE" ? "DONE" : state.running);
        onCompletionPulse?.();
      },
      onQueueChanged: () => {
        if (isReplay && !playbackRunning) return;
        readyPulseRef.current = 1;
      },
    }),
    [isReplay, onCompletionPulse, playbackRunning, spawnPacket, state.running],
  );

  useSimEffects(state, handlers);

  useFrame((_ctx, delta) => {
    readyPulseRef.current = Math.max(0, readyPulseRef.current - delta * 2.8);
    ioPulseRef.current = Math.max(0, ioPulseRef.current - delta * 2.6);
    memoryPulseRef.current = Math.max(0, memoryPulseRef.current - delta * 3.4);

    const now = performance.now();
    let expired = false;

    for (const packet of packetsRef.current) {
      const mesh = packetMeshRefs.current[packet.id];
      if (!mesh) continue;

      const raw = (now - packet.startTs) / packet.durationMs;
      if (raw >= 1) {
        mesh.visible = false;
        expired = true;
        continue;
      }

      const eased = easeInOutCubic(clamp01(raw));
      const curve = CURVE_BY_ROUTE[packet.route];
      curve.getPointAt(eased, packetPosRef.current);
      packetPosRef.current.y += Math.sin(Math.PI * eased) * (packet.route === "ready" ? 0.07 : 0.05);

      mesh.visible = true;
      mesh.position.copy(packetPosRef.current);
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity = 0.5 + (1 - eased) * 0.9;
    }

    if (expired) {
      setPackets((previous) => previous.filter((packet) => now - packet.startTs < packet.durationMs));
    }
  });

  const focusMode = view === "CPU_FOCUS";

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

      <Pcb
        readyPulseRef={readyPulseRef}
        memoryPulseRef={memoryPulseRef}
        ioPulseRef={ioPulseRef}
      />
      <Soc
        runningPid={state.running}
        algorithm={state.algorithm}
        quantumProgress={quantumProgress}
        completionTick={completionTick}
      />
      <Ram dimmed={focusMode} />
      <IoController ioActivePid={state.io_active} dimmed={focusMode} />

      <QueueCartridge
        queue={queueList}
        dispatchToken={dispatchToken}
        dispatchPid={dispatchPid}
        visible={focusMode}
      />

      <Timeline3D
        gantt={state.gantt}
        ioGantt={state.io_gantt}
        time={state.time}
        tickMs={playbackTickMs ?? state.tick_ms}
        running={playbackRunning}
      />

      {packets.map((packet) => {
        const color = getPidColor(packet.pid);
        return (
          <mesh
            key={packet.id}
            ref={(mesh) => {
              packetMeshRefs.current[packet.id] = mesh;
            }}
            visible={false}
            position={[0, 0.4, 0]}
          >
            <sphereGeometry args={[packet.route === "ready" ? 0.08 : 0.07, 16, 16]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.75}
              roughness={0.2}
              metalness={0.42}
            />
          </mesh>
        );
      })}

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
