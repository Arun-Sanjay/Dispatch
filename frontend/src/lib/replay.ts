import type { SimulatorState } from "@/lib/types";

const EVENT_TIME_REGEX = /t\s*=\s*(\d+)/i;

function parseEventTime(eventText: string): number | null {
  const match = eventText.match(EVENT_TIME_REGEX);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getReplayMax(state: SimulatorState): number {
  return Math.max(state.time, state.gantt.length - 1, state.io_gantt.length - 1, state.mem_gantt.length - 1, 0);
}

function getReplayEventLog(state: SimulatorState, t: number): string[] {
  const parsed = state.event_log
    .map((entry) => ({ entry, t: parseEventTime(entry) }))
    .filter((item) => item.t !== null) as Array<{ entry: string; t: number }>;

  if (parsed.length > 0) {
    return parsed.filter((item) => item.t <= t).map((item) => item.entry).slice(-20);
  }

  return state.event_log.slice(-20);
}

export function getReplayViewState(liveState: SimulatorState, requestedT: number): SimulatorState {
  const replayMax = getReplayMax(liveState);
  const t = Math.max(0, Math.min(Math.floor(requestedT), replayMax));

  const running = liveState.gantt[t] ?? "IDLE";
  const ioActive = liveState.io_gantt[t] ?? "IDLE";

  const queueNote =
    t === liveState.time
      ? []
      : [
          "Replay note: queue snapshots are latest-known; per-tick queue tape is unavailable.",
        ];

  return {
    ...liveState,
    time: t,
    running,
    io_active: ioActive,
    mem_gantt: liveState.mem_gantt,
    memory: {
      ...liveState.memory,
      mem_gantt: liveState.memory.mem_gantt.length > 0 ? liveState.memory.mem_gantt : liveState.mem_gantt,
      recent_steps: liveState.memory.recent_steps.filter((step) => step.t <= t),
    },
    event_log: [...queueNote, ...getReplayEventLog(liveState, t)],
  };
}
