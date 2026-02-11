import type { SimulatorState } from "@/lib/types";

export type HeadlineEvent = {
  title: string;
  detail: string;
  severity: "info" | "warn" | "success";
};

type ParsedEvent = {
  t: number | null;
  pid: string | null;
  from: string | null;
  to: string | null;
  line: string;
};

const EVENT_RE = /t\s*=\s*(\d+):\s*([A-Za-z0-9_]+)\s+([A-Z_]+)\s*(?:->|→)\s*([A-Z_]+)/i;

function parseEvent(line: string): ParsedEvent {
  const match = line.match(EVENT_RE);
  if (!match) {
    return { t: null, pid: null, from: null, to: null, line };
  }
  return {
    t: Number.parseInt(match[1], 10),
    pid: match[2],
    from: match[3],
    to: match[4],
    line,
  };
}

function memToken(state: SimulatorState): string {
  const token = state.mem_gantt.at(-1) ?? state.memory.mem_gantt.at(-1) ?? "IDLE";
  return token || "IDLE";
}

function classify(event: ParsedEvent): { rank: number; headline: HeadlineEvent } {
  const line = event.line;
  const upper = line.toUpperCase();
  if (event.to === "DONE") {
    return {
      rank: 1,
      headline: {
        title: "PROCESS COMPLETED",
        detail: line,
        severity: "success",
      },
    };
  }
  if (event.to === "WAITING_MEM" || upper.includes("PAGE FAULT") || upper.includes("FAULT")) {
    return {
      rank: 2,
      headline: {
        title: "PAGE FAULT",
        detail: line,
        severity: "warn",
      },
    };
  }
  if (event.to === "WAITING_IO" || (event.from === "WAITING_IO" && event.to === "READY") || upper.includes("I/O")) {
    return {
      rank: 3,
      headline: {
        title: "I/O TRANSITION",
        detail: line,
        severity: "info",
      },
    };
  }
  if (
    (event.from === "RUNNING" && event.to === "READY") ||
    upper.includes("TIME SLICE") ||
    upper.includes("PREEMPT")
  ) {
    return {
      rank: 4,
      headline: {
        title: "PREEMPT / TIME SLICE",
        detail: line,
        severity: "warn",
      },
    };
  }
  if (event.from === "READY" && event.to === "RUNNING") {
    return {
      rank: 5,
      headline: {
        title: "DISPATCH",
        detail: line,
        severity: "info",
      },
    };
  }
  return {
    rank: 9,
    headline: {
      title: "STATE UPDATE",
      detail: line,
      severity: "info",
    },
  };
}

export function deriveHeadlineEvent(state: SimulatorState): HeadlineEvent {
  const candidates = (state.event_log ?? [])
    .slice(-8)
    .map(parseEvent)
    .filter((event) => event.t === state.time || event.t === state.time - 1 || event.t === null);

  if (candidates.length > 0) {
    let best: { rank: number; headline: HeadlineEvent; idx: number } | undefined;
    for (const [idx, event] of candidates.entries()) {
      const classified = classify(event);
      if (!best || classified.rank < best.rank || (classified.rank === best.rank && idx > best.idx)) {
        best = { ...classified, idx };
      }
    }
    if (best !== undefined) {
      return best.headline;
    }
  }

  const cpu = state.running === "IDLE" ? "IDLE" : state.running;
  const io = state.io_active === "IDLE" ? "IDLE" : state.io_active;
  const mem = memToken(state);
  return {
    title: "NORMAL EXECUTION",
    detail: `t=${state.time} — CPU: ${cpu} — MEM: ${mem} — IO: ${io}`,
    severity: "info",
  };
}
