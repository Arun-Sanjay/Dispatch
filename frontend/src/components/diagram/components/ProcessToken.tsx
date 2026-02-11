"use client";

import { RoundedBox, Text } from "@react-three/drei";

type ProcessTokenProps = {
  pid: string;
  color: string;
  ghost?: boolean;
  scale?: number;
};

export function ProcessToken({ pid, color, ghost = false, scale = 1 }: ProcessTokenProps) {
  return (
    <group scale={[scale, scale, scale]}>
      <RoundedBox args={[0.24, 0.1, 0.16]} radius={0.05} smoothness={4}>
        <meshStandardMaterial
          color="#0f172a"
          roughness={0.3}
          metalness={0.72}
          transparent
          opacity={ghost ? 0.45 : 1}
        />
      </RoundedBox>

      <mesh position={[0, 0.026, 0.08]}>
        <boxGeometry args={[0.22, 0.03, 0.03]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={ghost ? 0.12 : 0.35}
          transparent
          opacity={ghost ? 0.5 : 1}
        />
      </mesh>

      <mesh position={[0.08, 0.018, -0.045]}>
        <sphereGeometry args={[0.012, 10, 10]} />
        <meshStandardMaterial
          color={ghost ? "#334155" : "#22d3ee"}
          emissive={ghost ? "#1e293b" : "#22d3ee"}
          emissiveIntensity={ghost ? 0.06 : 0.45}
        />
      </mesh>

      <Text
        position={[0, 0.01, 0]}
        fontSize={0.044}
        color="#dbeafe"
        anchorX="center"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {pid}
      </Text>
    </group>
  );
}
