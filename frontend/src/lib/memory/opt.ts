import type { MemResult, MemStep } from "@/lib/memory/types";

export function runOPT(framesCount: number, refs: number[]): MemResult {
  const frameCount = Math.max(1, Math.floor(framesCount));
  const frames: Array<number | null> = Array.from({ length: frameCount }, () => null);

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
        let victimSlot = 0;
        let farthest = -1;

        frames.forEach((page, idx) => {
          if (page === null) return;
          const nextUse = refs.slice(t + 1).findIndex((candidate) => candidate === page);
          const distance = nextUse < 0 ? Number.POSITIVE_INFINITY : nextUse;
          if (distance > farthest) {
            farthest = distance;
            victimSlot = idx;
          }
        });

        const victim = frames[victimSlot];
        if (typeof victim === "number") {
          evicted = victim;
        }
        frames[victimSlot] = ref;
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
