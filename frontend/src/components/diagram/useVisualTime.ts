"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseVisualTimeInput = {
  time: number;
  tickMs: number;
  isRunning: boolean;
  windowSize: number;
};

function easeInOutCubic(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function useVisualTime({ time, tickMs, isRunning, windowSize }: UseVisualTimeInput) {
  const [committedTime, setCommittedTime] = useState(Math.max(0, Math.floor(time)));
  const [windowStart, setWindowStart] = useState(Math.max(0, Math.floor(time) - (windowSize - 1)));
  const [highlightTick, setHighlightTick] = useState<number | null>(null);

  const serverTimeRef = useRef(Math.max(0, Math.floor(time)));
  const lastServerTsRef = useRef(0);
  const tickMsRef = useRef(Math.max(1, tickMs));
  const rawFracRef = useRef(0);
  const easedFracRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    const nextTime = Math.max(0, Math.floor(time));

    tickMsRef.current = Math.max(1, tickMs);

    if (nextTime !== serverTimeRef.current) {
      const previous = serverTimeRef.current;
      serverTimeRef.current = nextTime;
      lastServerTsRef.current = now;
      rawFracRef.current = 0;
      easedFracRef.current = 0;

      setCommittedTime(nextTime);
      setWindowStart(Math.max(0, nextTime - (windowSize - 1)));

      if (nextTime > previous) {
        setHighlightTick(nextTime);
        const timeout = window.setTimeout(() => {
          setHighlightTick((current) => (current === nextTime ? null : current));
        }, 200);
        return () => window.clearTimeout(timeout);
      }
    }

    if (lastServerTsRef.current === 0) {
      lastServerTsRef.current = now;
    }

    return undefined;
  }, [time, tickMs, windowSize]);

  useEffect(() => {
    if (!isRunning) return;
    lastServerTsRef.current = performance.now() - rawFracRef.current * tickMsRef.current;
  }, [isRunning]);

  const getVisualFrac = useCallback(
    (now: number) => {
      if (isRunning) {
        const raw = Math.min(Math.max((now - lastServerTsRef.current) / tickMsRef.current, 0), 1);
        rawFracRef.current = raw;
        easedFracRef.current = easeInOutCubic(raw);
      }
      return easedFracRef.current;
    },
    [isRunning],
  );

  return {
    committedTime,
    windowStart,
    highlightTick,
    getVisualFrac,
  };
}
