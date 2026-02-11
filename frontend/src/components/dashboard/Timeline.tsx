"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TickRange } from "@/lib/analytics/timelineAnalytics";
import { getPidColor } from "@/components/diagram/pidColors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TimelineVariant = "default" | "memory";

type TimelineProps = {
  title: string;
  items: string[];
  time: number;
  tickMs: number;
  running: boolean;
  autoFollow?: boolean;
  variant?: TimelineVariant;
  windowSize?: number;
  selectedRange?: TickRange;
  onRangeChange?: (range: TickRange) => void;
};

const CELL_WIDTH = 54;
const GAP = 10;
const WINDOW_SIZE = 60;
const STRIDE = CELL_WIDTH + GAP;

type MemoryCellKind = "IDLE" | "HIT" | "FAULT";

function normalizeRange(startTick: number, endTick: number, maxTick: number): TickRange {
  const safeMaxTick = Math.max(0, Math.floor(maxTick));
  const left = Math.max(0, Math.min(Math.floor(Math.min(startTick, endTick)), safeMaxTick));
  const right = Math.max(0, Math.min(Math.floor(Math.max(startTick, endTick)), safeMaxTick));
  return { l: left, r: right };
}

function parseMemoryCell(value: string): { kind: MemoryCellKind; pid: string | null } {
  const token = String(value || "IDLE").trim();
  if (!token || token.toUpperCase() === "IDLE") {
    return { kind: "IDLE", pid: null };
  }
  if (token.toUpperCase().startsWith("FAULT")) {
    const parts = token.split(":");
    return { kind: "FAULT", pid: parts[1] ?? null };
  }
  if (token.toUpperCase().startsWith("HIT")) {
    const parts = token.split(":");
    return { kind: "HIT", pid: parts[1] ?? null };
  }
  return { kind: "HIT", pid: null };
}

export function Timeline({
  title,
  items,
  time,
  tickMs,
  running,
  autoFollow = true,
  variant = "default",
  windowSize = WINDOW_SIZE,
  selectedRange,
  onRangeChange,
}: TimelineProps) {
  const safeTickMs = Math.max(1, tickMs);
  const committedTime = Math.max(0, Math.floor(time));
  const maxTick = Math.max(0, items.length - 1);
  const safeCeiling = Math.max(committedTime, maxTick);

  const [highlightTick, setHighlightTick] = useState<number | null>(null);
  const [windowEndTick, setWindowEndTick] = useState(committedTime);

  const lastServerTimeRef = useRef<number>(committedTime);
  const lastServerTsRef = useRef<number>(0);
  const fracRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const activeFillRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const dragStartTickRef = useRef<number | null>(null);
  const dragActiveRef = useRef(false);

  useEffect(() => {
    if (autoFollow) {
      setWindowEndTick(committedTime);
      return;
    }
    setWindowEndTick((prev) => Math.max(0, Math.min(prev, safeCeiling)));
  }, [autoFollow, committedTime, safeCeiling]);

  const effectiveWindowSize = Math.max(1, Math.floor(windowSize));
  const strideCount = effectiveWindowSize;
  const startIndex = Math.max(0, windowEndTick - (effectiveWindowSize - 1));
  const endIndex = startIndex + effectiveWindowSize - 1;
  const activeInWindow = committedTime >= startIndex && committedTime <= endIndex;
  const activeCellIndex = activeInWindow ? committedTime - startIndex : -1;

  const visibleTicks = useMemo(
    () => Array.from({ length: effectiveWindowSize }, (_, i) => startIndex + i),
    [startIndex, effectiveWindowSize],
  );

  const normalizedSelectedRange = useMemo(() => {
    if (!selectedRange) return null;
    return normalizeRange(selectedRange.l, selectedRange.r, maxTick);
  }, [selectedRange, maxTick]);

  const emitRange = useCallback(
    (startTick: number, endTick: number) => {
      if (!onRangeChange) return;
      onRangeChange(normalizeRange(startTick, endTick, maxTick));
    },
    [onRangeChange, maxTick],
  );

  const endDragSelection = useCallback(() => {
    dragActiveRef.current = false;
    dragStartTickRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointerup", endDragSelection);
    return () => window.removeEventListener("pointerup", endDragSelection);
  }, [endDragSelection]);

  const onCellPointerDown = useCallback(
    (tick: number) => {
      if (!onRangeChange) return;
      const clampedTick = Math.max(0, Math.min(tick, maxTick));
      dragActiveRef.current = true;
      dragStartTickRef.current = clampedTick;
      emitRange(clampedTick, clampedTick);
    },
    [emitRange, maxTick, onRangeChange],
  );

  const onCellPointerEnter = useCallback(
    (tick: number) => {
      if (!onRangeChange || !dragActiveRef.current || dragStartTickRef.current === null) return;
      emitRange(dragStartTickRef.current, tick);
    },
    [emitRange, onRangeChange],
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

    lastServerTsRef.current = performance.now() - fracRef.current * safeTickMs;

    const frame = (now: number) => {
      const elapsed = now - lastServerTsRef.current;
      const nextFrac = Math.min(Math.max(elapsed / safeTickMs, 0), 1);
      fracRef.current = nextFrac;

      if (activeFillRef.current) {
        activeFillRef.current.style.width = `${nextFrac * 100}%`;
      }

      if (cursorRef.current) {
        if (!activeInWindow || activeCellIndex < 0) {
          cursorRef.current.style.opacity = "0";
        } else {
          const cursorX = activeCellIndex * STRIDE + nextFrac * STRIDE;
          cursorRef.current.style.opacity = "1";
          cursorRef.current.style.transform = `translate3d(${cursorX}px, 0, 0)`;
        }
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
  }, [running, safeTickMs, activeInWindow, activeCellIndex]);

  useEffect(() => {
    if (activeFillRef.current) {
      activeFillRef.current.style.width = `${fracRef.current * 100}%`;
    }
    if (cursorRef.current) {
      if (!activeInWindow || activeCellIndex < 0) {
        cursorRef.current.style.opacity = "0";
      } else {
        const cursorX = activeCellIndex * STRIDE + fracRef.current * STRIDE;
        cursorRef.current.style.opacity = "1";
        cursorRef.current.style.transform = `translate3d(${cursorX}px, 0, 0)`;
      }
    }
  }, [activeCellIndex, startIndex, activeInWindow]);

  return (
    <div className="neo-panel border-border/50 bg-card/60 rounded-2xl border p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-200">{title}</p>
        {!autoFollow ? <p className="text-[11px] text-amber-300">Auto-follow off</p> : null}
      </div>

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
                    width: `${strideCount * STRIDE - GAP}px`,
                  }}
                >
                  {visibleTicks.map((tick) => {
                    const committed = tick <= maxTick;
                    const token = committed ? items[tick] ?? "IDLE" : "";
                    const isActive = activeInWindow && tick === committedTime;
                    const isNew = tick === highlightTick;
                    const isSelected =
                      normalizedSelectedRange !== null &&
                      tick >= normalizedSelectedRange.l &&
                      tick <= normalizedSelectedRange.r;

                    const memoryMeta = variant === "memory" ? parseMemoryCell(token) : null;

                    let backgroundColor: string | undefined;
                    if (committed) {
                      if (variant === "memory" && memoryMeta) {
                        if (memoryMeta.kind === "FAULT") {
                          backgroundColor = "#7f1d1db3";
                        } else if (memoryMeta.kind === "HIT") {
                          backgroundColor = "#14532db3";
                        } else {
                          backgroundColor = "#11182799";
                        }
                      } else {
                        backgroundColor = `${getPidColor(token || "IDLE")}B3`;
                      }
                    }

                    const label =
                      variant === "memory"
                        ? !committed
                          ? ""
                          : memoryMeta?.kind === "FAULT"
                            ? `FAULT${memoryMeta.pid ? `:${memoryMeta.pid}` : ""}`
                            : memoryMeta?.kind === "HIT"
                              ? memoryMeta.pid ?? "HIT"
                              : "-"
                        : !committed
                          ? ""
                          : token === "IDLE"
                            ? "-"
                            : token;

                    return (
                      <Tooltip key={`${tick}-${label || "PENDING"}`}>
                        <TooltipTrigger asChild>
                          <div
                            className={[
                              "timeline-cell relative h-10 overflow-hidden rounded-xl border border-white/10 shadow-[0_6px_14px_rgba(0,0,0,0.35)]",
                              "flex cursor-crosshair select-none items-center justify-center text-[10px] font-semibold text-zinc-100",
                              committed ? "" : "bg-zinc-900/35",
                              isSelected ? "border-sky-300/60 ring-1 ring-sky-300/45" : "",
                              isNew ? "timeline-cell-pop" : "",
                            ].join(" ")}
                            style={{
                              width: `${CELL_WIDTH}px`,
                              backgroundColor,
                            }}
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              onCellPointerDown(tick);
                            }}
                            onPointerEnter={() => onCellPointerEnter(tick)}
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
                            {variant === "memory" && committed && memoryMeta?.kind === "HIT" ? (
                              <span className="pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-300/95 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                            ) : null}
                            {variant === "memory" && committed && memoryMeta?.kind === "FAULT" ? (
                              <span className="pointer-events-none absolute right-1.5 top-1.5 size-1.5 rounded-full bg-rose-300/95 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                            ) : null}
                            <span className="relative z-10 truncate px-1">{label}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p>
                            t={tick}: {committed ? token || "IDLE" : "PENDING"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

                <div
                  ref={cursorRef}
                  className="pointer-events-none absolute inset-y-0 z-30 w-[2px] rounded-full bg-sky-300/85 shadow-[0_0_12px_rgba(125,211,252,0.8)]"
                  style={{ transform: "translate3d(0px, 0, 0)", opacity: activeInWindow ? 1 : 0 }}
                />
              </div>

              <div className="overflow-hidden">
                <div
                  className="flex text-[10px] text-zinc-500"
                  style={{
                    gap: `${GAP}px`,
                    width: `${strideCount * STRIDE - GAP}px`,
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
