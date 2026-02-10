"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { getPidColor } from "@/components/diagram/pidColors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TimelineProps = {
  title: string;
  items: string[];
  time: number;
  tickMs: number;
  running: boolean;
};

const CELL_WIDTH = 54;
const GAP = 10;
const WINDOW_SIZE = 60;
const STRIDE = CELL_WIDTH + GAP;

export function Timeline({ title, items, time, tickMs, running }: TimelineProps) {
  const safeTickMs = Math.max(1, tickMs);
  const committedTime = Math.max(0, Math.floor(time));

  const [highlightTick, setHighlightTick] = useState<number | null>(null);

  const lastServerTimeRef = useRef<number>(committedTime);
  const lastServerTsRef = useRef<number>(0);
  const fracRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const activeFillRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  const startIndex = Math.max(0, committedTime - (WINDOW_SIZE - 1));
  const activeCellIndex = Math.max(0, Math.min(WINDOW_SIZE - 1, committedTime - startIndex));

  const visibleTicks = useMemo(
    () => Array.from({ length: WINDOW_SIZE }, (_, i) => startIndex + i),
    [startIndex],
  );

  useEffect(() => {
    const now = performance.now();
    const prev = lastServerTimeRef.current;

    if (committedTime !== prev) {
      setHighlightTick(committedTime);
      const timeout = window.setTimeout(() => {
        setHighlightTick((curr) => (curr === committedTime ? null : curr));
      }, 220);

      lastServerTimeRef.current = committedTime;
      lastServerTsRef.current = now;
      fracRef.current = 0;

      return () => window.clearTimeout(timeout);
    }

    if (lastServerTsRef.current === 0) {
      lastServerTsRef.current = now;
    }

    return undefined;
  }, [committedTime]);

  useEffect(() => {
    if (!running) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Resume from frozen fraction instead of restarting at 0.
    lastServerTsRef.current = performance.now() - fracRef.current * safeTickMs;

    const frame = (now: number) => {
      const elapsed = now - lastServerTsRef.current;
      const nextFrac = Math.min(Math.max(elapsed / safeTickMs, 0), 1);
      fracRef.current = nextFrac;

      if (activeFillRef.current) {
        activeFillRef.current.style.width = `${nextFrac * 100}%`;
      }

      if (cursorRef.current) {
        const cursorX = activeCellIndex * STRIDE + nextFrac * STRIDE;
        cursorRef.current.style.transform = `translate3d(${cursorX}px, 0, 0)`;
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
  }, [running, safeTickMs, activeCellIndex]);

  useEffect(() => {
    // Keep visuals synced immediately after discrete tick commits and window snaps.
    if (activeFillRef.current) {
      activeFillRef.current.style.width = `${fracRef.current * 100}%`;
    }
    if (cursorRef.current) {
      const cursorX = activeCellIndex * STRIDE + fracRef.current * STRIDE;
      cursorRef.current.style.transform = `translate3d(${cursorX}px, 0, 0)`;
    }
  }, [activeCellIndex, startIndex]);

  return (
    <div className="neo-panel border-border/50 bg-card/60 rounded-2xl border p-4">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>

      <div className="relative mt-3">
        <div className="pointer-events-none absolute bottom-6 left-0 top-0 z-20 w-10 bg-gradient-to-r from-black/70 to-transparent" />
        <div className="pointer-events-none absolute bottom-6 right-0 top-0 z-20 w-10 bg-gradient-to-l from-black/70 to-transparent" />

        <div className="overflow-hidden">
          <TooltipProvider>
            <div className="space-y-2">
              <div className="relative overflow-hidden">
                <div
                  className="flex"
                  style={{
                    gap: `${GAP}px`,
                    width: `${WINDOW_SIZE * STRIDE - GAP}px`,
                  }}
                >
                  {visibleTicks.map((tick) => {
                    const committed = tick <= committedTime;
                    const pid = committed ? (tick < items.length ? items[tick] : "IDLE") : "";
                    const isActive = tick === committedTime;
                    const isNew = tick === highlightTick;

                    return (
                      <Tooltip key={`${tick}-${pid || "PENDING"}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={[
                              "timeline-cell relative h-10 overflow-hidden rounded-xl border border-white/10 shadow-[0_6px_14px_rgba(0,0,0,0.35)]",
                              "flex items-center justify-center text-[10px] font-semibold text-zinc-100",
                              committed ? "" : "bg-zinc-900/35",
                              isNew ? "timeline-cell-pop" : "",
                            ].join(" ")}
                            style={{
                              width: `${CELL_WIDTH}px`,
                              backgroundColor: committed ? `${getPidColor(pid || "IDLE")}B3` : undefined,
                            }}
                          >
                            {isActive ? (
                              <div
                                ref={(node) => {
                                  activeFillRef.current = node;
                                }}
                                className="pointer-events-none absolute bottom-0 left-0 h-1.5 rounded-r bg-white/55"
                                style={{ width: `${fracRef.current * 100}%` }}
                              />
                            ) : null}
                            <span className="relative z-10">{!committed ? "" : pid === "IDLE" ? "-" : pid}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>t={tick}: {committed ? (pid || "IDLE") : "PENDING"}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <div
                  ref={cursorRef}
                  className="pointer-events-none absolute inset-y-0 z-30 w-[2px] rounded-full bg-sky-300/85 shadow-[0_0_12px_rgba(125,211,252,0.8)]"
                  style={{ transform: `translate3d(${activeCellIndex * STRIDE}px, 0, 0)` }}
                />
              </div>

              <div className="overflow-hidden">
                <div
                  className="flex text-[10px] text-zinc-500"
                  style={{
                    gap: `${GAP}px`,
                    width: `${WINDOW_SIZE * STRIDE - GAP}px`,
                  }}
                >
                  {visibleTicks.map((tick) => (
                    <div key={tick} className="text-center" style={{ width: `${CELL_WIDTH}px` }}>
                      {tick}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
