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
            stateHandler?.(parsed.data);
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
