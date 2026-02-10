"use client";

import { useMemo, useRef } from "react";

import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getPidColor } from "@/components/diagram/pidColors";
import { useVisualTime } from "@/components/diagram/useVisualTime";

type Timeline3DProps = {
  gantt: string[];
  ioGantt: string[];
  time: number;
  tickMs: number;
  running?: boolean;
};

const WINDOW_SIZE = 60;
const CELL_WIDTH = 0.11;
const GAP = 0.018;
const CELL_HEIGHT = 0.058;
const CELL_DEPTH = 0.075;
const STEP = CELL_WIDTH + GAP;
const TOTAL_WIDTH = WINDOW_SIZE * STEP - GAP;
const HALF_WIDTH = TOTAL_WIDTH * 0.5;
const LEFT_LABEL_X = -HALF_WIDTH - 0.34;
const CPU_Y = 0.095;
const IO_Y = -0.075;

function laneOpacity(index: number) {
  const fadeBand = 6;
  const left = index < fadeBand ? 0.35 + (index / fadeBand) * 0.65 : 1;
  const rightBandStart = WINDOW_SIZE - fadeBand;
  const right = index >= rightBandStart ? 0.35 + ((WINDOW_SIZE - 1 - index) / fadeBand) * 0.65 : 1;
  return Math.max(0.24, Math.min(left, right));
}

export function Timeline3D({ gantt, ioGantt, time, tickMs, running = true }: Timeline3DProps) {
  const { committedTime, windowStart, highlightTick, getVisualFrac } = useVisualTime({
    time,
    tickMs,
    isRunning: running,
    windowSize: WINDOW_SIZE,
  });

  const playheadLineRef = useRef<THREE.Mesh | null>(null);
  const playheadHaloRef = useRef<THREE.Mesh | null>(null);

  const ticks = useMemo(
    () => Array.from({ length: WINDOW_SIZE }, (_, i) => windowStart + i),
    [windowStart],
  );

  const activeCellIndex = Math.max(0, Math.min(WINDOW_SIZE - 1, committedTime - windowStart));

  useFrame(() => {
    const frac = getVisualFrac(performance.now());
    const x = -HALF_WIDTH + activeCellIndex * STEP + frac * STEP + CELL_WIDTH * 0.5;

    if (playheadLineRef.current) {
      playheadLineRef.current.position.x = x;
    }

    if (playheadHaloRef.current) {
      playheadHaloRef.current.position.x = x;
      const pulse = 0.9 + Math.sin(performance.now() * 0.012) * 0.08;
      playheadHaloRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <group position={[0, 0.31, -2.08]} rotation={[-0.24, 0, 0]}>
      <RoundedBox args={[TOTAL_WIDTH + 0.7, 0.54, 0.11]} radius={0.08} smoothness={4} position={[0, 0.005, -0.02]}>
        <meshStandardMaterial
          color="#060912"
          transparent
          opacity={0.64}
          roughness={0.2}
          metalness={0.5}
          emissive="#0b1220"
          emissiveIntensity={0.24}
        />
      </RoundedBox>

      <RoundedBox args={[TOTAL_WIDTH + 0.56, 0.49, 0.012]} radius={0.05} smoothness={4} position={[0, 0.01, 0.043]}>
        <meshStandardMaterial color="#0f172a" transparent opacity={0.4} roughness={0.25} metalness={0.35} />
      </RoundedBox>

      <Text
        position={[LEFT_LABEL_X, CPU_Y, 0.095]}
        fontSize={0.085}
        color="#93c5fd"
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#020617"
      >
        CPU
      </Text>

      <Text
        position={[LEFT_LABEL_X, IO_Y, 0.095]}
        fontSize={0.085}
        color="#fcd34d"
        anchorX="left"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#020617"
      >
        I/O
      </Text>

      {ticks.map((tick, index) => {
        const cpuPid = tick < gantt.length ? gantt[tick] : "IDLE";
        const ioPid = tick < ioGantt.length ? ioGantt[tick] : "IDLE";

        const x = -HALF_WIDTH + index * STEP + CELL_WIDTH * 0.5;
        const isCurrent = tick === committedTime;
        const isCommitFlash = tick === highlightTick;
        const alpha = laneOpacity(index);

        const cpuColor = cpuPid === "IDLE" ? "#1f2937" : getPidColor(cpuPid);
        const ioColor = ioPid === "IDLE" ? "#111827" : getPidColor(ioPid);

        return (
          <group key={`tick-${tick}`} position={[x, 0, 0]}>
            <RoundedBox args={[CELL_WIDTH, CELL_HEIGHT, CELL_DEPTH]} radius={0.018} smoothness={3} position={[0, CPU_Y, 0.08]}>
              <meshStandardMaterial
                color={cpuColor}
                emissive={cpuColor}
                emissiveIntensity={
                  cpuPid === "IDLE"
                    ? 0.04
                    : isCurrent
                      ? 0.35
                      : isCommitFlash
                        ? 0.5
                        : 0.16
                }
                transparent
                opacity={alpha}
                roughness={0.35}
                metalness={0.45}
              />
            </RoundedBox>

            <RoundedBox args={[CELL_WIDTH, CELL_HEIGHT, CELL_DEPTH]} radius={0.018} smoothness={3} position={[0, IO_Y, 0.08]}>
              <meshStandardMaterial
                color={ioColor}
                emissive={ioColor}
                emissiveIntensity={ioPid === "IDLE" ? 0.03 : isCommitFlash ? 0.38 : 0.12}
                transparent
                opacity={alpha}
                roughness={0.35}
                metalness={0.45}
              />
            </RoundedBox>
          </group>
        );
      })}

      <mesh ref={playheadLineRef} position={[-HALF_WIDTH + CELL_WIDTH * 0.5, 0.01, 0.122]}>
        <boxGeometry args={[0.012, 0.33, 0.012]} />
        <meshBasicMaterial color="#7dd3fc" />
      </mesh>

      <mesh ref={playheadHaloRef} position={[-HALF_WIDTH + CELL_WIDTH * 0.5, 0.01, 0.13]}>
        <planeGeometry args={[0.13, 0.35]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}
