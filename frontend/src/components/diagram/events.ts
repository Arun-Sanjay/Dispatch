"use client";

export type SimNodeState = "NEW" | "READY" | "RUNNING" | "WAITING" | "DONE";

export type SimEvent = {
  t: number;
  pid: string;
  from: SimNodeState;
  to: SimNodeState;
  reason?: string;
};

const TRANSITION_RE =
  /t\s*=\s*(\d+)\s*:\s*([A-Za-z0-9_]+)\s+(NEW|READY|RUNNING|WAITING|DONE)\s*(?:->|→)\s*(NEW|READY|RUNNING|WAITING|DONE)(?:\s*\(([^)]+)\))?/i;

function normalizeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const text = reason.trim();
  if (!text) return undefined;
  if (/time\s*slice/i.test(text)) return "TIMESLICE";
  if (/i\/?o/i.test(text)) return "IO";
  if (/done/i.test(text)) return "DONE";
  if (/arrival|arrived/i.test(text)) return "ARRIVAL";
  return text.toUpperCase();
}

function asState(value: string): SimNodeState {
  const normalized = value.toUpperCase();
  if (
    normalized === "NEW" ||
    normalized === "READY" ||
    normalized === "RUNNING" ||
    normalized === "WAITING" ||
    normalized === "DONE"
  ) {
    return normalized;
  }
  return "READY";
}

export function parseSimTransition(line: string): SimEvent | null {
  if (!line || typeof line !== "string") return null;
  const match = line.match(TRANSITION_RE);
  if (!match) return null;

  const parsedTime = Number(match[1]);
  if (!Number.isFinite(parsedTime)) return null;

  return {
    t: parsedTime,
    pid: String(match[2]),
    from: asState(match[3]),
    to: asState(match[4]),
    reason: normalizeReason(match[5]),
  };
}

export function parseSimEvents(log: string[], fromIndex = 0): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = Math.max(0, fromIndex); i < log.length; i += 1) {
    const parsed = parseSimTransition(log[i]);
    if (parsed) out.push(parsed);
  }
  return out;
}
