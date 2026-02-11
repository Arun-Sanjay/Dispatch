"use client";

import { useRef } from "react";

import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getPidColor } from "@/components/diagram/pidColors";

type IoBlockProps = {
  ioActivePid: string;
  dimmed?: boolean;
};

export function IoBlock({ ioActivePid, dimmed = false }: IoBlockProps) {
  const blockMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const ledMatRef = useRef<THREE.MeshStandardMaterial | null>(null);

  useFrame(() => {
    const pulse = ioActivePid !== "IDLE" ? (Math.sin(performance.now() * 0.006) + 1) * 0.5 : 0;
    const color = ioActivePid !== "IDLE" ? getPidColor(ioActivePid) : "#f59e0b";

    if (blockMatRef.current) {
      blockMatRef.current.emissive.set(color);
      blockMatRef.current.emissiveIntensity = dimmed ? 0.04 : ioActivePid !== "IDLE" ? 0.2 + pulse * 0.55 : 0.08;
      blockMatRef.current.opacity = dimmed ? 0.18 : 1;
    }
    if (ledMatRef.current) {
      ledMatRef.current.emissive.set(color);
      ledMatRef.current.emissiveIntensity = dimmed ? 0.08 : ioActivePid !== "IDLE" ? 0.5 + pulse * 0.95 : 0.18;
      ledMatRef.current.opacity = dimmed ? 0.18 : 1;
    }
  });

  return (
    <group position={[3.74, 0.72, -0.34]}>
      <RoundedBox args={[2.22, 0.52, 1.74]} radius={0.12} smoothness={5}>
        <meshStandardMaterial
          ref={blockMatRef}
          color="#1d2432"
          emissive="#f59e0b"
          emissiveIntensity={0.08}
          roughness={0.4}
          metalness={0.84}
          transparent={dimmed}
          opacity={dimmed ? 0.18 : 1}
        />
      </RoundedBox>

      <mesh position={[0.84, 0.02, 0.78]}>
        <boxGeometry args={[0.44, 0.2, 0.2]} />
        <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.35} transparent={dimmed} opacity={dimmed ? 0.2 : 1} />
      </mesh>

      <mesh position={[-0.7, 0.16, 0.72]}>
        <boxGeometry args={[0.18, 0.08, 0.08]} />
        <meshStandardMaterial
          ref={ledMatRef}
          color="#1f2937"
          emissive="#f59e0b"
          emissiveIntensity={0.18}
          transparent={dimmed}
          opacity={dimmed ? 0.18 : 1}
        />
      </mesh>

      <Text
        position={[0, 0.15, 0.44]}
        fontSize={0.06}
        color="#9db1cf"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        IO CTRL
      </Text>
    </group>
  );
}
