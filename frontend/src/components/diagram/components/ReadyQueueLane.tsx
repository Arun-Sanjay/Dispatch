"use client";

import { RoundedBox, Text } from "@react-three/drei";

import { ProcessToken } from "@/components/diagram/components/ProcessToken";

type ReadyQueueLaneProps = {
  queue: string[];
  maxVisible?: number;
  focusMode?: boolean;
};

const DEFAULT_VISIBLE = 8;
const SLOT_STEP = 0.34;

export function ReadyQueueLane({ queue, maxVisible = DEFAULT_VISIBLE, focusMode = false }: ReadyQueueLaneProps) {
  const visible = queue.slice(0, maxVisible);
  const overflow = queue.length > maxVisible ? queue.length - maxVisible : 0;

  return (
    <group position={[1.58, 0.36, 1.86]}>
      <RoundedBox args={[3.5, 0.38, 0.68]} radius={0.08} smoothness={5} position={[1.2, 0, 0]}>
        <meshStandardMaterial
          color="#0e1523"
          roughness={0.35}
          metalness={0.76}
          transparent
          opacity={focusMode ? 1 : 0.78}
        />
      </RoundedBox>

      {Array.from({ length: maxVisible }).map((_, index) => (
        <mesh key={`queue-slot-${index}`} position={[index * SLOT_STEP, 0.05, 0]}>
          <boxGeometry args={[0.25, 0.02, 0.5]} />
          <meshStandardMaterial
            color="#111a2a"
            emissive="#334155"
            emissiveIntensity={focusMode ? 0.11 : 0.07}
            transparent
            opacity={focusMode ? 0.95 : 0.75}
          />
        </mesh>
      ))}

      <Text
        position={[-0.34, 0.13, 0.24]}
        fontSize={0.07}
        color="#8ea7c9"
        anchorX="left"
        anchorY="middle"
        rotation={[-Math.PI / 2, 0, 0]}
      >
        READY
      </Text>

      {visible.map((pid, index) => (
        <group key={`${pid}-${index}`} position={[index * SLOT_STEP, 0.11, 0.16]}>
          <ProcessToken pid={pid} color="#223047" ghost scale={0.92} />
        </group>
      ))}

      {overflow > 0 ? (
        <group position={[(maxVisible - 1) * SLOT_STEP, 0.11, 0.16]}>
          <ProcessToken pid={`+${overflow}`} color="#334155" ghost scale={0.92} />
        </group>
      ) : null}
    </group>
  );
}
