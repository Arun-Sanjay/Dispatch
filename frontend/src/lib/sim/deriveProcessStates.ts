import type { ProcessRuntimeState, SimulatorState } from "@/lib/types";

const VALID_STATES: ProcessRuntimeState[] = [
  "NEW",
  "READY",
  "RUNNING",
  "WAITING_IO",
  "WAITING_MEM",
  "DONE",
];

function isValidState(value: string | undefined): value is ProcessRuntimeState {
  if (!value) return false;
  return VALID_STATES.includes(value as ProcessRuntimeState);
}

function pidList(values: Array<string | undefined> = []): string[] {
  return values
    .map((value) => (value ?? "").trim())
    .filter((value) => value.length > 0 && value !== "IDLE");
}

export function deriveProcessStates(state: SimulatorState): Record<string, ProcessRuntimeState> {
  const out: Record<string, ProcessRuntimeState> = {};
  const allPids = new Set<string>();

  for (const process of state.processes ?? []) {
    const pid = process.pid?.trim();
    if (!pid) continue;
    allPids.add(pid);
    if (isValidState(process.state)) {
      out[pid] = process.state;
    }
  }

  for (const row of state.per_process ?? []) {
    const pid = row.pid?.trim();
    if (!pid) continue;
    allPids.add(pid);
  }

  for (const pid of pidList([state.running, state.io_active])) allPids.add(pid);
  for (const pid of pidList(state.ready_queue)) allPids.add(pid);
  for (const pid of pidList(state.sys_queue ?? [])) allPids.add(pid);
  for (const pid of pidList(state.user_queue ?? [])) allPids.add(pid);
  for (const pid of pidList(state.io_queue)) allPids.add(pid);
  for (const pid of pidList(state.completed)) allPids.add(pid);

  for (const pid of allPids) {
    if (!out[pid]) out[pid] = "NEW";
  }

  for (const pid of state.completed ?? []) {
    if (pid && pid !== "IDLE") out[pid] = "DONE";
  }

  const running = state.running?.trim();
  if (running && running !== "IDLE") out[running] = "RUNNING";

  const ioWaitSet = new Set<string>();
  const ioActive = state.io_active?.trim();
  if (ioActive && ioActive !== "IDLE") ioWaitSet.add(ioActive);
  for (const pid of state.io_queue ?? []) {
    if (pid && pid !== "IDLE") ioWaitSet.add(pid);
  }
  for (const pid of ioWaitSet) {
    if (out[pid] !== "RUNNING" && out[pid] !== "DONE") out[pid] = "WAITING_IO";
  }

  const readyOrdered = [
    ...(state.ready_queue ?? []),
    ...(state.sys_queue ?? []),
    ...(state.user_queue ?? []),
  ];
  for (const pid of readyOrdered) {
    if (!pid || pid === "IDLE") continue;
    if (out[pid] !== "RUNNING" && out[pid] !== "DONE" && out[pid] !== "WAITING_IO") {
      out[pid] = "READY";
    }
  }

  for (const process of state.processes ?? []) {
    const pid = process.pid?.trim();
    if (!pid) continue;
    if (process.state === "WAITING_MEM" && out[pid] !== "DONE") out[pid] = "WAITING_MEM";
  }

  if ((state.mem_gantt.at(-1) ?? "").toUpperCase().startsWith("FAULT:")) {
    const token = state.mem_gantt.at(-1) ?? "";
    const parts = token.split(":");
    const pid = parts[1];
    if (pid && out[pid] && out[pid] !== "DONE") {
      out[pid] = "WAITING_MEM";
    }
  }

  return out;
}

