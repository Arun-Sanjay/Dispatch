"use client";

import { type MutableRefObject, useRef } from "react";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { ioCurve, memCurve, readyCurve } from "@/components/diagram/paths";

type PcbProps = {
  readyPulseRef: MutableRefObject<number>;
  memoryPulseRef: MutableRefObject<number>;
  ioPulseRef: MutableRefObject<number>;
};

export function Pcb({ readyPulseRef, memoryPulseRef, ioPulseRef }: PcbProps) {
  const readyTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const memTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const ioTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    if (readyTraceMatRef.current) {
      readyTraceMatRef.current.emissiveIntensity = 0.08 + readyPulseRef.current * 1.2;
    }
    if (memTraceMatRef.current) {
      memTraceMatRef.current.emissiveIntensity = 0.08 + memoryPulseRef.current * 1.3;
    }
    if (ioTraceMatRef.current) {
      ioTraceMatRef.current.emissiveIntensity = 0.08 + ioPulseRef.current * 1.1;
    }
  });

  return (
    <group>
      <RoundedBox args={[12.2, 0.26, 6.8]} radius={0.24} smoothness={6} position={[0, 0.08, 0.32]}>
        <meshStandardMaterial color="#0a0f18" roughness={0.88} metalness={0.22} />
      </RoundedBox>

      <RoundedBox args={[11.5, 0.06, 6.1]} radius={0.2} smoothness={6} position={[0, 0.2, 0.32]}>
        <meshStandardMaterial color="#0f1723" roughness={0.8} metalness={0.28} />
      </RoundedBox>

      {[
        { pos: [0, 0.22, -2.1] as [number, number, number], size: [10.8, 0.004, 0.03] as [number, number, number] },
        { pos: [0, 0.22, 2.62] as [number, number, number], size: [10.8, 0.004, 0.03] as [number, number, number] },
        { pos: [-5.25, 0.22, 0.32] as [number, number, number], size: [0.03, 0.004, 5.6] as [number, number, number] },
        { pos: [5.25, 0.22, 0.32] as [number, number, number], size: [0.03, 0.004, 5.6] as [number, number, number] },
      ].map((line, index) => (
        <mesh key={`silk-${index}`} position={line.pos}>
          <boxGeometry args={line.size} />
          <meshBasicMaterial color="#1f2a37" transparent opacity={0.55} />
        </mesh>
      ))}

      <mesh>
        <tubeGeometry args={[readyCurve, 80, 0.03, 10, false]} />
        <meshStandardMaterial
          ref={readyTraceMatRef}
          color="#0b1220"
          emissive="#67e8f9"
          emissiveIntensity={0.08}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>

      <mesh>
        <tubeGeometry args={[memCurve, 80, 0.03, 10, false]} />
        <meshStandardMaterial
          ref={memTraceMatRef}
          color="#0b1220"
          emissive="#60a5fa"
          emissiveIntensity={0.08}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>

      <mesh>
        <tubeGeometry args={[ioCurve, 80, 0.03, 10, false]} />
        <meshStandardMaterial
          ref={ioTraceMatRef}
          color="#0b1220"
          emissive="#f59e0b"
          emissiveIntensity={0.08}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>
    </group>
  );
}
