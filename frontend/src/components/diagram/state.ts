"use client";

import * as THREE from "three";

import { getPidColor } from "@/components/diagram/pidColors";
import type { SimEvent } from "@/components/diagram/events";
import type { SimulatorState } from "@/lib/types";

export type DiagramView = "OVERVIEW" | "CPU_FOCUS";

export type TokenLocation = "QUEUE_SLOT" | "IN_TRANSIT" | "CPU_PORT" | "IO_BLOCK" | "DONE_BAY";
export type TokenPathName = "readyToCpu" | "cpuToIo" | "ioToQueueReturn" | "cpuToQueueReturn" | "cpuToDone";

export type TokenState = {
  pid: string;
  color: string;
  logicalLocation: TokenLocation;
  queueSlotIndex: number;
  pathName?: TokenPathName;
  pathProgress: number;
  lastUpdateT: number;
};

export type TokenRegistry = Map<string, TokenState>;

export type SceneAnchors = {
  queueSlots: THREE.Vector3[];
  queueExit: THREE.Vector3;
  queueReturn: THREE.Vector3;
  cpuPort: THREE.Vector3;
  ioPort: THREE.Vector3;
  ioReturn: THREE.Vector3;
  doneSlots: THREE.Vector3[];
};

export const MAX_QUEUE_SLOTS = 8;

function queueSnapshot(state: SimulatorState): string[] {
  if (state.algorithm === "MLQ") {
    return [...(state.sys_queue ?? []), ...(state.user_queue ?? [])];
  }
  return [...state.ready_queue];
}

function inDone(pid: string, state: SimulatorState): boolean {
  return state.completed.includes(pid);
}

export function ensureTokensForState(registry: TokenRegistry, state: SimulatorState): void {
  const pids = new Set<string>();
  for (const row of state.per_process) {
    if (row.pid) pids.add(row.pid);
  }
  for (const pid of state.ready_queue) pids.add(pid);
  for (const pid of state.completed) pids.add(pid);
  if (state.running !== "IDLE") pids.add(state.running);
  if (state.io_active !== "IDLE") pids.add(state.io_active);
  for (const pid of state.io_queue) pids.add(pid);
  for (const pid of state.sys_queue ?? []) pids.add(pid);
  for (const pid of state.user_queue ?? []) pids.add(pid);

  for (const pid of pids) {
    if (registry.has(pid)) continue;
    registry.set(pid, {
      pid,
      color: getPidColor(pid),
      logicalLocation: "QUEUE_SLOT",
      queueSlotIndex: 0,
      pathProgress: 0,
      lastUpdateT: state.time,
    });
  }
}

export function syncQueueSlots(registry: TokenRegistry, state: SimulatorState): void {
  const queue = queueSnapshot(state);
  const slotByPid = new Map<string, number>();
  for (let i = 0; i < Math.min(MAX_QUEUE_SLOTS, queue.length); i += 1) {
    slotByPid.set(queue[i], i);
  }

  for (const token of registry.values()) {
    if (token.logicalLocation === "IN_TRANSIT") continue;

    const slot = slotByPid.get(token.pid);
    if (typeof slot === "number") {
      token.logicalLocation = "QUEUE_SLOT";
      token.queueSlotIndex = slot;
      token.pathName = undefined;
      token.pathProgress = 0;
      token.lastUpdateT = state.time;
      continue;
    }

    if (inDone(token.pid, state)) {
      token.logicalLocation = "DONE_BAY";
      token.pathName = undefined;
      token.pathProgress = 0;
      token.lastUpdateT = state.time;
      continue;
    }

    if (state.running === token.pid) {
      token.logicalLocation = "CPU_PORT";
      token.pathName = undefined;
      token.pathProgress = 0;
      token.lastUpdateT = state.time;
      continue;
    }

    if (state.io_active === token.pid) {
      token.logicalLocation = "IO_BLOCK";
      token.pathName = undefined;
      token.pathProgress = 0;
      token.lastUpdateT = state.time;
    }
  }
}

export function beginTokenTransition(
  registry: TokenRegistry,
  pid: string,
  pathName: TokenPathName,
  t: number,
): void {
  const token = registry.get(pid);
  if (!token) return;
  token.logicalLocation = "IN_TRANSIT";
  token.pathName = pathName;
  token.pathProgress = 0;
  token.lastUpdateT = t;
}

export function applyEventTransition(registry: TokenRegistry, event: SimEvent): void {
  const token = registry.get(event.pid);
  if (!token) return;

  if (event.from === "READY" && event.to === "RUNNING") {
    beginTokenTransition(registry, event.pid, "readyToCpu", event.t);
    return;
  }
  if (event.from === "RUNNING" && event.to === "WAITING") {
    beginTokenTransition(registry, event.pid, "cpuToIo", event.t);
    return;
  }
  if (event.from === "WAITING" && event.to === "READY") {
    beginTokenTransition(registry, event.pid, "ioToQueueReturn", event.t);
    return;
  }
  if (event.from === "RUNNING" && event.to === "READY") {
    beginTokenTransition(registry, event.pid, "cpuToQueueReturn", event.t);
    return;
  }
  if (event.from === "RUNNING" && event.to === "DONE") {
    beginTokenTransition(registry, event.pid, "cpuToDone", event.t);
  }
}

export function locationAnchor(token: TokenState, state: SimulatorState, anchors: SceneAnchors): THREE.Vector3 {
  if (token.logicalLocation === "QUEUE_SLOT") {
    const index = Math.max(0, Math.min(token.queueSlotIndex, anchors.queueSlots.length - 1));
    return anchors.queueSlots[index];
  }
  if (token.logicalLocation === "CPU_PORT") return anchors.cpuPort;
  if (token.logicalLocation === "IO_BLOCK") return anchors.ioPort;
  if (token.logicalLocation === "DONE_BAY") {
    const doneIndex = Math.max(0, state.completed.indexOf(token.pid));
    return anchors.doneSlots[Math.min(doneIndex, anchors.doneSlots.length - 1)] ?? anchors.doneSlots[0];
  }
  return anchors.queueReturn;
}

export function queueListFromState(state: SimulatorState): string[] {
  return queueSnapshot(state);
}
