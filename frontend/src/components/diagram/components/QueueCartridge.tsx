"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { RoundedBox, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { getPidColor } from "@/components/diagram/pidColors";

type QueueCartridgeProps = {
  queue: string[];
  dispatchToken: number;
  dispatchPid: string | null;
  visible: boolean;
};

type VisibleChip = {
  id: string;
  label: string;
  pid: string;
  isOverflow: boolean;
};

const SLOT_COUNT = 8;
const SLOT_STEP = 0.34;

function buildVisible(queue: string[]): VisibleChip[] {
  const chips = queue.slice(0, SLOT_COUNT).map((pid, index) => ({
    id: `${pid}-${index}`,
    label: pid,
    pid,
    isOverflow: false,
  }));

  if (queue.length > SLOT_COUNT) {
    chips[SLOT_COUNT - 1] = {
      id: "overflow",
      label: `+${queue.length - (SLOT_COUNT - 1)}`,
      pid: "overflow",
      isOverflow: true,
    };
  }

  return chips;
}

export function QueueCartridge({ queue, dispatchToken, dispatchPid, visible }: QueueCartridgeProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const frontChipRef = useRef<THREE.Group | null>(null);
  const dispatchAnimRef = useRef<{ token: number; pid: string; startedAt: number } | null>(null);

  const chips = useMemo(() => buildVisible(queue), [queue]);

  useEffect(() => {
    if (!dispatchPid) return;
    if (dispatchToken <= 0) return;
    dispatchAnimRef.current = {
      token: dispatchToken,
      pid: dispatchPid,
      startedAt: performance.now(),
    };
  }, [dispatchToken, dispatchPid]);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      const targetScale = visible ? 1 : 0.84;
      const next = THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 7, delta);
      groupRef.current.scale.set(next, next, next);

      const targetOpacityY = visible ? 0.76 : 0.73;
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, targetOpacityY, 7, delta);
    }

    if (!frontChipRef.current) return;
    const anim = dispatchAnimRef.current;
    if (!anim) {
      frontChipRef.current.position.set(0, 0.09, 0.2);
      frontChipRef.current.visible = true;
      return;
    }

    const t = (performance.now() - anim.startedAt) / 380;
    if (t >= 1) {
      dispatchAnimRef.current = null;
      frontChipRef.current.position.set(0, 0.09, 0.2);
      frontChipRef.current.visible = true;
      return;
    }

    const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    frontChipRef.current.position.x = -eased * 0.66;
    frontChipRef.current.position.y = 0.09 + eased * 0.04;
    frontChipRef.current.position.z = 0.2 + eased * 0.06;
    frontChipRef.current.visible = eased < 0.96;
  });

  const renderChipBody = useCallback(
    (color: string, label: string) => (
      <>
        <RoundedBox args={[0.2, 0.08, 0.22]} radius={0.03} smoothness={4}>
          <meshStandardMaterial
            color="#111827"
            roughness={0.26}
            metalness={0.7}
            transparent
            opacity={visible ? 1 : 0.24}
          />
        </RoundedBox>
        <mesh position={[0, 0.02, 0.11]}>
          <boxGeometry args={[0.18, 0.03, 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={visible ? 0.38 : 0.05} />
        </mesh>
        <Text
          position={[0, 0.016, 0]}
          fontSize={0.05}
          color="#dbeafe"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {label}
        </Text>
      </>
    ),
    [visible],
  );

  return (
    <group ref={groupRef} position={[1.58, visible ? 0.76 : 0.73, 1.54]}>
      <RoundedBox args={[3.2, 0.34, 0.64]} radius={0.08} smoothness={5} position={[1.2, 0, 0]}>
        <meshStandardMaterial
          color="#0f1728"
          roughness={0.32}
          metalness={0.76}
          transparent
          opacity={visible ? 0.96 : 0.15}
        />
      </RoundedBox>

      {Array.from({ length: SLOT_COUNT }).map((_, index) => (
        <mesh key={`slot-${index}`} position={[index * SLOT_STEP, 0.04, 0]}>
          <boxGeometry args={[0.24, 0.018, 0.48]} />
          <meshStandardMaterial
            color="#111a2a"
            emissive="#1e293b"
            emissiveIntensity={visible ? 0.12 : 0.02}
            transparent
            opacity={visible ? 0.92 : 0.2}
          />
        </mesh>
      ))}

      {chips.map((chip, index) => {
        const color = chip.isOverflow ? "#334155" : getPidColor(chip.pid);
        const slotX = index * SLOT_STEP;

        if (index === 0) {
          return (
            <group
              key={chip.id}
              ref={(node) => {
                frontChipRef.current = node;
              }}
              position={[slotX, 0.09, 0.2]}
            >
              {renderChipBody(color, chip.label)}
            </group>
          );
        }

        return (
          <group key={chip.id} position={[slotX, 0.09, 0.2]}>
            {renderChipBody(color, chip.label)}
          </group>
        );
      })}
    </group>
  );
}
