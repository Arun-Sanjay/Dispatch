"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SimulatorState } from "@/lib/types";

export type SocketStatus = "connecting" | "connected" | "disconnected" | "error";

type StateMessage = { type: "state"; data: SimulatorState };
type StateHandler = (state: SimulatorState) => void;
type StatusHandler = (status: SocketStatus) => void;
type ErrorHandler = (error: string | null) => void;

const DEFAULT_WS_URL = "ws://127.0.0.1:8000/ws/state";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "WebSocket error";
}

function normalizeStateShape(raw: SimulatorState): SimulatorState {
  const memory = raw.memory ?? {
    mode: "CPU_ONLY",
    algo: "LRU",
    frames: [],
    fault_penalty: 2,
    faults: 0,
    hits: 0,
    hit_ratio: 0,
    recent_steps: [],
    mem_gantt: [],
  };
  const normalizedFrames = Array.isArray(memory.frames)
    ? memory.frames
    : Array.from({ length: Number(memory.frames_count ?? memory.num_frames ?? 0) }, (_, idx) => ({
        pfn: idx,
        pid: null,
        vpn: null,
        last_used: 0,
        freq: 0,
        ref_bit: 0,
      }));
  const normalizedNumFrames = Number(memory.num_frames ?? memory.frames_count ?? normalizedFrames.length ?? 0) || 0;
  const memTimeline = raw.mem_gantt ?? memory.mem_gantt ?? [];
  return {
    ...raw,
    mem_gantt: Array.isArray(memTimeline) ? memTimeline : [],
    processes: Array.isArray(raw.processes) ? raw.processes : [],
    memory: {
      ...memory,
      enabled: memory.enabled ?? memory.mode ?? "CPU_ONLY",
      mode: memory.mode ?? memory.enabled ?? "CPU_ONLY",
      num_frames: normalizedNumFrames || normalizedFrames.length,
      frames_count: normalizedNumFrames || normalizedFrames.length,
      frames: normalizedFrames,
      mem_gantt: Array.isArray(memory.mem_gantt) && memory.mem_gantt.length > 0 ? memory.mem_gantt : memTimeline,
      page_tables: memory.page_tables ?? {},
      last_translation_log: Array.isArray(memory.last_translation_log) ? memory.last_translation_log : [],
      recent_steps: Array.isArray(memory.recent_steps) ? memory.recent_steps : [],
    },
  };
}

export function createSimSocket(url: string) {
  let ws: WebSocket | null = null;
  let stateHandler: StateHandler | null = null;
  let statusHandler: StatusHandler | null = null;
  let errorHandler: ErrorHandler | null = null;

  const setStatus = (status: SocketStatus) => statusHandler?.(status);
  const setError = (error: string | null) => errorHandler?.(error);

  const connect = () => {
    if (typeof window === "undefined") return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    try {
      setStatus("connecting");
      setError(null);
      ws = new WebSocket(url);

      ws.onopen = () => {
        setStatus("connected");
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as StateMessage;
          if (parsed?.type === "state" && parsed.data) {
            stateHandler?.(normalizeStateShape(parsed.data));
          }
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror = () => {
        setStatus("error");
        setError("Unable to reach simulator backend");
      };

      ws.onclose = () => {
        ws = null;
        setStatus("disconnected");
      };
    } catch (error) {
      ws = null;
      setStatus("error");
      setError(getErrorMessage(error));
    }
  };

  const close = () => {
    if (!ws) {
      setStatus("disconnected");
      return;
    }
    ws.close();
    ws = null;
    setStatus("disconnected");
  };

  const send = (payload: unknown) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch (error) {
      setStatus("error");
      setError(getErrorMessage(error));
    }
  };

  const onState = (handler: StateHandler) => {
    stateHandler = handler;
  };

  const onStatus = (handler: StatusHandler) => {
    statusHandler = handler;
  };

  const onError = (handler: ErrorHandler) => {
    errorHandler = handler;
  };

  return { connect, close, send, onState, onStatus, onError };
}

export function useSimSocket(url: string = DEFAULT_WS_URL) {
  const [state, setState] = useState<SimulatorState | null>(null);
  const [status, setStatus] = useState<SocketStatus>("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createSimSocket> | null>(null);

  useEffect(() => {
    const socket = createSimSocket(url);
    socketRef.current = socket;

    socket.onState((nextState) => {
      setState(nextState);
      setStatus("connected");
    });

    socket.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus !== "connected") {
        setState(null);
      }
    });

    socket.onError((message) => {
      setLastError(message);
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [url]);

  const connect = useCallback(() => {
    socketRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    socketRef.current?.close();
  }, []);

  const send = useCallback((payload: unknown) => {
    socketRef.current?.send(payload);
  }, []);

  return useMemo(
    () => ({ state, status, connect, disconnect, send, lastError }),
    [state, status, connect, disconnect, send, lastError],
  );
}
