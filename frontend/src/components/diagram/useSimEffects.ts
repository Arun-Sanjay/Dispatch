"use client";

import { useEffect, useRef } from "react";

import type { SimulatorState } from "@/lib/types";

type SimEffectsHandlers = {
  onDispatch?: (pid: string) => void;
  onIoIngress?: (pid: string) => void;
  onComplete?: () => void;
  onQueueChanged?: () => void;
};

const READY_TO_RUNNING_REGEX = /READY\s*(?:->|→)\s*RUNNING/i;
const RUNNING_TO_WAITING_IO_REGEX = /RUNNING\s*(?:->|→)\s*WAITING.*I\/?O/i;
const DONE_REGEX = /(?:->|→)\s*DONE/i;

function extractPid(eventText: string): string | null {
  const match = eventText.match(/:\s*([^\s:]+)\s+/);
  return match?.[1] ?? null;
}

function queueSnapshot(state: SimulatorState): string {
  if (state.algorithm === "MLQ") {
    const sys = (state.sys_queue ?? []).join(",");
    const user = (state.user_queue ?? []).join(",");
    return `MLQ|${sys}|${user}`;
  }
  return `SINGLE|${state.ready_queue.join(",")}`;
}

export function useSimEffects(state: SimulatorState, handlers: SimEffectsHandlers) {
  const prevRunningRef = useRef(state.running);
  const prevCompletedLenRef = useRef(state.completed.length);
  const prevEventLenRef = useRef(state.event_log.length);
  const prevQueueSnapshotRef = useRef(queueSnapshot(state));

  useEffect(() => {
    const previousRunning = prevRunningRef.current;
    const newEvents = state.event_log.slice(prevEventLenRef.current);

    const runningChanged = state.running !== previousRunning;
    const dispatchByRunning = runningChanged && state.running !== "IDLE";
    const dispatchByEvent = newEvents.some((eventText) => READY_TO_RUNNING_REGEX.test(eventText));

    if (dispatchByRunning || dispatchByEvent) {
      const dispatchEvent = newEvents.find((eventText) => READY_TO_RUNNING_REGEX.test(eventText));
      const pid = state.running !== "IDLE" ? state.running : extractPid(dispatchEvent ?? "") ?? "IDLE";
      if (pid !== "IDLE") {
        handlers.onDispatch?.(pid);
      }
    }

    const ioEvent = newEvents.find((eventText) => RUNNING_TO_WAITING_IO_REGEX.test(eventText));
    if (ioEvent) {
      const pid = state.io_active !== "IDLE" ? state.io_active : extractPid(ioEvent) ?? previousRunning;
      if (pid && pid !== "IDLE") {
        handlers.onIoIngress?.(pid);
      }
    }

    const completedIncreased = state.completed.length > prevCompletedLenRef.current;
    const doneByEvent = newEvents.some((eventText) => DONE_REGEX.test(eventText));
    if (completedIncreased || doneByEvent) {
      handlers.onComplete?.();
    }

    const nextQueueSnapshot = queueSnapshot(state);
    if (nextQueueSnapshot !== prevQueueSnapshotRef.current) {
      handlers.onQueueChanged?.();
      prevQueueSnapshotRef.current = nextQueueSnapshot;
    }

    prevRunningRef.current = state.running;
    prevCompletedLenRef.current = state.completed.length;
    prevEventLenRef.current = state.event_log.length;
  }, [handlers, state]);
}
