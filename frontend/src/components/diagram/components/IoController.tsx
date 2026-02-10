"use client";

import { useRef } from "react";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getPidColor } from "@/components/diagram/pidColors";

type IoControllerProps = {
  ioActivePid: string;
  dimmed?: boolean;
};

export function IoController({ ioActivePid, dimmed = false }: IoControllerProps) {
  const mainMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const ledMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    const t = performance.now() * 0.001;
    const pulse = ioActivePid !== "IDLE" ? (Math.sin(t * 5.2) + 1) * 0.5 : 0;
    const color = ioActivePid !== "IDLE" ? getPidColor(ioActivePid) : "#f59e0b";

    if (mainMatRef.current) {
      mainMatRef.current.emissive.set(color);
      mainMatRef.current.emissiveIntensity = dimmed ? 0.05 : ioActivePid !== "IDLE" ? 0.24 + pulse * 0.5 : 0.08;
      mainMatRef.current.opacity = dimmed ? 0.16 : 1;
      mainMatRef.current.transparent = dimmed;
    }

    if (ledMatRef.current) {
      ledMatRef.current.emissive.set(color);
      ledMatRef.current.emissiveIntensity = dimmed ? 0.06 : ioActivePid !== "IDLE" ? 0.5 + pulse * 0.8 : 0.15;
      ledMatRef.current.opacity = dimmed ? 0.16 : 1;
      ledMatRef.current.transparent = dimmed;
    }
  });

  return (
    <group position={[3.75, 0.72, -0.34]}>
      <RoundedBox args={[2.2, 0.52, 1.7]} radius={0.12} smoothness={5}>
        <meshStandardMaterial
          ref={mainMatRef}
          color="#1d2432"
          emissive="#f59e0b"
          emissiveIntensity={0.12}
          roughness={0.42}
          metalness={0.84}
          transparent={dimmed}
          opacity={dimmed ? 0.16 : 1}
        />
      </RoundedBox>

      <mesh position={[0.85, 0.02, 0.78]}>
        <boxGeometry args={[0.44, 0.2, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.35} transparent={dimmed} opacity={dimmed ? 0.18 : 1} />
      </mesh>

      <mesh position={[-0.7, 0.15, 0.72]}>
        <boxGeometry args={[0.18, 0.08, 0.08]} />
        <meshStandardMaterial
          ref={ledMatRef}
          color="#1f2937"
          emissive="#f59e0b"
          emissiveIntensity={0.2}
          transparent={dimmed}
          opacity={dimmed ? 0.16 : 1}
        />
      </mesh>
    </group>
  );
}
