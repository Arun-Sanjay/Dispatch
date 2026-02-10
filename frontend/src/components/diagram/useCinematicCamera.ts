"use client";

import { useCallback, useEffect, useRef } from "react";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

export type FocusTarget = "CPU_FOCUS" | "OVERVIEW";

type Pose = {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
};

const POSES: Record<FocusTarget, Pose> = {
  OVERVIEW: {
    position: new THREE.Vector3(7.8, 5.1, 8.3),
    lookAt: new THREE.Vector3(0, 0.95, 0.3),
  },
  CPU_FOCUS: {
    position: new THREE.Vector3(2.5, 2.35, 3.05),
    lookAt: new THREE.Vector3(0.05, 1.02, 0.95),
  },
};

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function useCinematicCamera(initialTarget: FocusTarget = "OVERVIEW") {
  const camera = useThree((state) => state.camera);

  const fromPosRef = useRef(new THREE.Vector3());
  const toPosRef = useRef(new THREE.Vector3());
  const fromLookRef = useRef(new THREE.Vector3());
  const toLookRef = useRef(new THREE.Vector3());
  const currentLookRef = useRef(new THREE.Vector3());
  const tempLookRef = useRef(new THREE.Vector3());

  const animStartRef = useRef(0);
  const animDurationRef = useRef(760);
  const animatingRef = useRef(false);

  const focus = useCallback(
    (target: FocusTarget) => {
      const pose = POSES[target];
      if (!pose) return;

      fromPosRef.current.copy(camera.position);
      fromLookRef.current.copy(currentLookRef.current);
      toPosRef.current.copy(pose.position);
      toLookRef.current.copy(pose.lookAt);

      animStartRef.current = performance.now();
      animDurationRef.current = 820;
      animatingRef.current = true;
    },
    [camera],
  );

  useEffect(() => {
    const pose = POSES[initialTarget];
    camera.position.copy(pose.position);
    currentLookRef.current.copy(pose.lookAt);
    camera.lookAt(pose.lookAt);
  }, [camera, initialTarget]);

  useFrame(() => {
    if (!animatingRef.current) return;

    const elapsed = performance.now() - animStartRef.current;
    const t = Math.min(Math.max(elapsed / animDurationRef.current, 0), 1);
    const eased = easeInOutQuad(t);

    camera.position.lerpVectors(fromPosRef.current, toPosRef.current, eased);
    tempLookRef.current.lerpVectors(fromLookRef.current, toLookRef.current, eased);
    camera.lookAt(tempLookRef.current);

    if (t >= 1) {
      animatingRef.current = false;
      currentLookRef.current.copy(toLookRef.current);
    }
  });

  return { focus };
}
