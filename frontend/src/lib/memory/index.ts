import { runFIFO } from "@/lib/memory/fifo";
import { runLFU } from "@/lib/memory/lfu";
import { runLRU } from "@/lib/memory/lru";
import { runOPT } from "@/lib/memory/opt";
import type { MemResult, MemoryAlgorithm } from "@/lib/memory/types";

export * from "@/lib/memory/types";

export function runMemoryAlgorithm(algo: MemoryAlgorithm, frames: number, refs: number[]): MemResult {
  if (algo === "FIFO") return runFIFO(frames, refs);
  if (algo === "LFU") return runLFU(frames, refs);
  if (algo === "OPT") return runOPT(frames, refs);
  return runLRU(frames, refs);
}

export function parseReferenceString(input: string): number[] {
  return input
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.max(0, value));
}
