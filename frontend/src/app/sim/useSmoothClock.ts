"use client";

import { useEffect, useRef, useState } from "react";

type SmoothClockInput = {
  serverTime: number;
  tickMs: number;
  isRunning: boolean;
};

const EPS = 0.0005;

export function useSmoothClock({ serverTime, tickMs, isRunning }: SmoothClockInput) {
  const [visualTime, setVisualTime] = useState<number>(serverTime);
  const lastServerTimeRef = useRef<number>(serverTime);
  const lastServerTsRef = useRef<number>(0);
  const visualTimeRef = useRef<number>(serverTime);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const prevServer = lastServerTimeRef.current;
    const delta = serverTime - prevServer;

    if (delta > 1 || delta < 0) {
      lastServerTimeRef.current = serverTime;
      lastServerTsRef.current = now;
      visualTimeRef.current = serverTime;
      setVisualTime(serverTime);
      return;
    }

    lastServerTimeRef.current = serverTime;
    lastServerTsRef.current = now;

    if (!isRunning) {
      visualTimeRef.current = serverTime;
      setVisualTime(serverTime);
    }
  }, [serverTime, isRunning]);

  useEffect(() => {
    if (!isRunning) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const safeTickMs = Math.max(1, tickMs);

    const frame = (now: number) => {
      const elapsed = now - lastServerTsRef.current;
      const progress = Math.min(Math.max(elapsed / safeTickMs, 0), 1);
      const next = lastServerTimeRef.current + progress;

      if (Math.abs(next - visualTimeRef.current) > EPS) {
        visualTimeRef.current = next;
        setVisualTime(next);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    };
  }, [isRunning, tickMs]);

  return visualTime;
}
