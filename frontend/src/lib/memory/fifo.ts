import type { MemResult, MemStep } from "@/lib/memory/types";

export function runFIFO(framesCount: number, refs: number[]): MemResult {
  const frameCount = Math.max(1, Math.floor(framesCount));
  const frames: Array<number | null> = Array.from({ length: frameCount }, () => null);
  let pointer = 0;
  let hits = 0;
  let faults = 0;
  const steps: MemStep[] = [];

  refs.forEach((rawRef, t) => {
    const ref = Math.max(0, Math.floor(rawRef));
    const hit = frames.includes(ref);
    let evicted: number | undefined;

    if (hit) {
      hits += 1;
    } else {
      faults += 1;
      if (frames.includes(null)) {
        const slot = frames.indexOf(null);
        frames[slot] = ref;
      } else {
        const victim = frames[pointer];
        if (typeof victim === "number") {
          evicted = victim;
        }
        frames[pointer] = ref;
        pointer = (pointer + 1) % frameCount;
      }
    }

    steps.push({
      t,
      ref,
      frames: [...frames],
      hit,
      ...(typeof evicted === "number" ? { evicted } : {}),
    });
  });

  const total = hits + faults;
  return {
    steps,
    faults,
    hits,
    hitRatio: total > 0 ? hits / total : 0,
  };
}
