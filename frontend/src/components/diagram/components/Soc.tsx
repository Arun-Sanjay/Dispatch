"use client";

import { useEffect, useMemo, useRef } from "react";

import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getPidColor, getPidIndex } from "@/components/diagram/pidColors";

type SocProps = {
  runningPid: string;
  algorithm: string;
  quantumProgress: number;
  completionTick: number;
};

const CORE_POSITIONS: Array<[number, number, number]> = [
  [-0.56, 1.13, -0.36],
  [0.56, 1.13, -0.36],
  [-0.56, 1.13, 0.4],
  [0.56, 1.13, 0.4],
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function Soc({ runningPid, algorithm, quantumProgress, completionTick }: SocProps) {
  const seamMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const coreMatsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const successRingRef = useRef<THREE.Mesh | null>(null);
  const successRingMatRef = useRef<THREE.MeshBasicMaterial | null>(null);

  const completionPulseRef = useRef(0);
  const previousCompletionRef = useRef(completionTick);

  const showQuantum = algorithm === "RR" || algorithm === "MLQ";
  const safeQuantumProgress = clamp01(quantumProgress);
  const activeCore = runningPid !== "IDLE" ? getPidIndex(runningPid, 4) : -1;
  const activeColor = runningPid !== "IDLE" ? getPidColor(runningPid) : "#334155";

  useEffect(() => {
    if (completionTick <= previousCompletionRef.current) return;
    previousCompletionRef.current = completionTick;
    completionPulseRef.current = 1;
  }, [completionTick]);

  useFrame((_state, delta) => {
    const t = performance.now() * 0.001;
    const runningPulse = runningPid === "IDLE" ? 0 : (Math.sin(t * 7) + 1) * 0.5;

    completionPulseRef.current = Math.max(0, completionPulseRef.current - delta * 4.2);

    if (seamMatRef.current) {
      seamMatRef.current.emissive.set(completionPulseRef.current > 0.02 ? "#22c55e" : activeColor);
      seamMatRef.current.emissiveIntensity =
        (runningPid === "IDLE" ? 0.1 : 0.22 + runningPulse * 0.32) + completionPulseRef.current * 1.2;
    }

    coreMatsRef.current.forEach((material, index) => {
      if (!material) return;
      if (index === activeCore && runningPid !== "IDLE") {
        material.emissive.set(activeColor);
        material.emissiveIntensity = 0.35 + runningPulse * 0.75;
      } else {
        material.emissive.set("#0f172a");
        material.emissiveIntensity = runningPid === "IDLE" ? 0.05 : 0.12;
      }
    });

    if (successRingRef.current && successRingMatRef.current) {
      const pulse = completionPulseRef.current;
      successRingRef.current.visible = pulse > 0.02;
      const scale = 1 + (1 - pulse) * 0.34;
      successRingRef.current.scale.set(scale, scale, scale);
      successRingMatRef.current.opacity = pulse * 0.45;
    }
  });

  const contacts = useMemo(() => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 9; j += 1) {
        out.push([-1.04 + i * 0.26, 0.68, -0.94 + j * 0.22]);
      }
    }
    return out;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      <RoundedBox args={[3.2, 0.72, 2.74]} radius={0.18} smoothness={6} position={[0, 0.98, 0.1]}>
        <meshStandardMaterial color="#121824" roughness={0.3} metalness={0.86} />
      </RoundedBox>

      <RoundedBox args={[2.78, 0.04, 2.38]} radius={0.09} smoothness={6} position={[0, 1.33, 0.1]}>
        <meshStandardMaterial color="#0d121d" roughness={0.25} metalness={0.8} />
      </RoundedBox>

      {[
        [0, 1.34, -1.08, 2.5, 0.02, 0.03],
        [0, 1.34, 1.28, 2.5, 0.02, 0.03],
        [-1.23, 1.34, 0.1, 0.03, 0.02, 2.36],
        [1.23, 1.34, 0.1, 0.03, 0.02, 2.36],
      ].map((segment, index) => (
        <mesh key={`seam-${index}`} position={[segment[0], segment[1], segment[2]]}>
          <boxGeometry args={[segment[3], segment[4], segment[5]]} />
          <meshStandardMaterial
            ref={index === 0 ? seamMatRef : undefined}
            color="#1e293b"
            emissive="#334155"
            emissiveIntensity={0.1}
            roughness={0.26}
            metalness={0.7}
          />
        </mesh>
      ))}

      {CORE_POSITIONS.map((position, index) => (
        <mesh key={`core-${index}`} position={position}>
          <boxGeometry args={[0.86, 0.2, 0.68]} />
          <meshStandardMaterial
            ref={(material) => {
              if (!material) return;
              coreMatsRef.current[index] = material;
            }}
            color="#0b1020"
            emissive="#0f172a"
            emissiveIntensity={0.12}
            roughness={0.35}
            metalness={0.8}
          />
        </mesh>
      ))}

      {contacts.map((position, index) => (
        <mesh key={`contact-${index}`} position={position}>
          <cylinderGeometry args={[0.026, 0.026, 0.012, 9]} />
          <meshStandardMaterial color="#8b7b4a" emissive="#7c6f45" emissiveIntensity={0.06} />
        </mesh>
      ))}

      <mesh position={[0, 0.96, 1.48]}>
        <boxGeometry args={[0.48, 0.2, 0.16]} />
        <meshStandardMaterial color="#060b14" roughness={0.42} metalness={0.4} />
      </mesh>

      <Text
        position={[0, 1.355, 0.65]}
        fontSize={0.13}
        color="#49596f"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        DISPATCH SoC
      </Text>

      {showQuantum ? (
        <group position={[0, 1.355, 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[1.45, 1.53, 64]} />
            <meshBasicMaterial color="#1f2937" transparent opacity={0.45} />
          </mesh>
          <mesh>
            <ringGeometry args={[1.45, 1.53, 64, 1, -Math.PI / 2, Math.max(0.02, Math.PI * 2 * safeQuantumProgress)]} />
            <meshBasicMaterial color={activeColor} transparent opacity={0.95} />
          </mesh>
        </group>
      ) : null}

      <mesh ref={successRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.36, 0.08]} visible={false}>
        <ringGeometry args={[1.56, 1.68, 56]} />
        <meshBasicMaterial
          ref={successRingMatRef}
          color="#22c55e"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
