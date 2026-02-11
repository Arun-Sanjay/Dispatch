"use client";

import { useRef } from "react";

import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { ProcessToken } from "@/components/diagram/components/ProcessToken";
import {
  cpuToDone,
  cpuToIo,
  cpuToQueueReturn,
  ioToQueueReturn,
  readyToCpu,
} from "@/components/diagram/paths";
import { type SceneAnchors, locationAnchor, type TokenPathName, type TokenRegistry, type TokenState } from "@/components/diagram/state";
import type { SimulatorState } from "@/lib/types";

type TokenAnimatorProps = {
  registryRef: { current: TokenRegistry };
  anchors: SceneAnchors;
  state: SimulatorState;
  isReplay: boolean;
  playbackRunning: boolean;
};

const PATH_DURATIONS_MS: Record<TokenPathName, number> = {
  readyToCpu: 600,
  cpuToIo: 700,
  ioToQueueReturn: 800,
  cpuToQueueReturn: 640,
  cpuToDone: 700,
};

const CURVE_MAP: Record<TokenPathName, THREE.CatmullRomCurve3> = {
  readyToCpu,
  cpuToIo,
  ioToQueueReturn,
  cpuToQueueReturn,
  cpuToDone,
};

function easeSmooth(value: number): number {
  return value * value * (3 - 2 * value);
}

export function TokenAnimator({ registryRef, anchors, state, isReplay, playbackRunning }: TokenAnimatorProps) {
  const meshRefs = useRef<Record<string, THREE.Group | null>>({});
  const positionRefs = useRef<Record<string, THREE.Vector3>>({});
  const tempVec = useRef(new THREE.Vector3());

  const tokens: TokenState[] = Array.from(registryRef.current.values()).sort((a, b) =>
    a.pid.localeCompare(b.pid),
  );

  useFrame((_ctx, delta) => {
    const now = performance.now();

    for (const token of registryRef.current.values()) {
      const mesh = meshRefs.current[token.pid];
      if (!mesh) continue;

      if (!positionRefs.current[token.pid]) {
        positionRefs.current[token.pid] = locationAnchor(token, state, anchors).clone();
      }

      const currentPos = positionRefs.current[token.pid];
      if (!currentPos) continue;

      if (token.logicalLocation === "IN_TRANSIT" && token.pathName) {
        if (isReplay && !playbackRunning) {
          const snapTarget = locationAnchor(token, state, anchors);
          currentPos.lerp(snapTarget, 0.22);
        } else {
          const pathName = token.pathName;
          const duration = PATH_DURATIONS_MS[token.pathName];
          token.pathProgress += (delta * 1000) / Math.max(duration, 1);
          const raw = Math.max(0, Math.min(1, token.pathProgress));
          const eased = easeSmooth(raw);

          const curve = CURVE_MAP[token.pathName];
          curve.getPointAt(eased, tempVec.current);
          tempVec.current.y += Math.sin(Math.PI * eased) * 0.03;
          currentPos.lerp(tempVec.current, 0.34);

          if (raw >= 1) {
            token.pathProgress = 0;
            token.pathName = undefined;
            token.lastUpdateT = state.time;
            if (token.logicalLocation === "IN_TRANSIT") {
              if (pathName === "readyToCpu") token.logicalLocation = "CPU_PORT";
              else if (pathName === "cpuToIo") token.logicalLocation = "IO_BLOCK";
              else if (pathName === "cpuToDone") token.logicalLocation = "DONE_BAY";
              else token.logicalLocation = "QUEUE_SLOT";
            }
          }
        }
      } else {
        const target = locationAnchor(token, state, anchors);
        currentPos.lerp(target, 1 - Math.exp(-9 * delta));
      }

      mesh.position.copy(currentPos);
    }
  });

  return (
    <group>
      {tokens.map((token) => (
        <group
          key={token.pid}
          ref={(node) => {
            meshRefs.current[token.pid] = node;
          }}
          position={locationAnchor(token, state, anchors)}
        >
          <ProcessToken pid={token.pid} color={token.color} />
        </group>
      ))}
    </group>
  );
}
