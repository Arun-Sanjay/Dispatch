"use client";

import { useEffect, useState } from "react";

import type { FocusTarget } from "@/components/diagram/useCinematicCamera";

type HotspotsProps = {
  selected: FocusTarget;
  onSelect: (target: FocusTarget) => void;
};

type Spot = {
  target: Exclude<FocusTarget, "OVERVIEW">;
  position: [number, number, number];
  size: [number, number, number];
};

const SPOTS: Spot[] = [
  { target: "CPU_FOCUS", position: [0, 1.02, 0.55], size: [3.6, 1.6, 2.8] },
];

export function Hotspots({ selected, onSelect }: HotspotsProps) {
  const [hovered, setHovered] = useState<FocusTarget | null>(null);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "default";
    return () => {
      document.body.style.cursor = "default";
    };
  }, [hovered]);

  return (
    <group>
      {SPOTS.map((spot) => {
        const active = selected === spot.target || hovered === spot.target;
        return (
          <group key={spot.target}>
            <mesh position={spot.position}>
              <boxGeometry args={spot.size} />
              <meshBasicMaterial color="#7dd3fc" transparent opacity={active ? 0.11 : 0} depthWrite={false} />
            </mesh>

            <mesh
              position={spot.position}
              onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(spot.target);
              }}
              onPointerOut={(event) => {
                event.stopPropagation();
                setHovered((current) => (current === spot.target ? null : current));
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(spot.target);
              }}
            >
              <boxGeometry args={spot.size} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
