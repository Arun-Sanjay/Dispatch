"use client";

import { type MutableRefObject, useRef } from "react";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { ioBusCurve, readyLaneCurve, returnLaneCurve } from "@/components/diagram/paths";

type PcbProps = {
  readyPulseRef: MutableRefObject<number>;
  ioPulseRef: MutableRefObject<number>;
  returnPulseRef: MutableRefObject<number>;
};

export function Pcb({ readyPulseRef, ioPulseRef, returnPulseRef }: PcbProps) {
  const readyTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const ioTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const returnTraceMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    if (readyTraceMatRef.current) {
      readyTraceMatRef.current.emissiveIntensity = 0.07 + readyPulseRef.current * 1.05;
    }
    if (ioTraceMatRef.current) {
      ioTraceMatRef.current.emissiveIntensity = 0.07 + ioPulseRef.current * 1.05;
    }
    if (returnTraceMatRef.current) {
      returnTraceMatRef.current.emissiveIntensity = 0.07 + returnPulseRef.current * 1.05;
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

      <mesh position={[0, 0.01, 0]}>
        <tubeGeometry args={[readyLaneCurve, 80, 0.027, 10, false]} />
        <meshStandardMaterial
          ref={readyTraceMatRef}
          color="#0b1220"
          emissive="#67e8f9"
          emissiveIntensity={0.07}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>

      <mesh position={[0, 0.01, 0]}>
        <tubeGeometry args={[ioBusCurve, 80, 0.027, 10, false]} />
        <meshStandardMaterial
          ref={ioTraceMatRef}
          color="#0b1220"
          emissive="#f59e0b"
          emissiveIntensity={0.07}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>

      <mesh position={[0, 0.01, 0]}>
        <tubeGeometry args={[returnLaneCurve, 80, 0.027, 10, false]} />
        <meshStandardMaterial
          ref={returnTraceMatRef}
          color="#0b1220"
          emissive="#4ade80"
          emissiveIntensity={0.07}
          roughness={0.35}
          metalness={0.76}
        />
      </mesh>
    </group>
  );
}
