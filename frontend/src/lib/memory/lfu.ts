import type { MemResult, MemStep } from "@/lib/memory/types";

type FreqNode = {
  page: number;
  freq: number;
  prev: FreqNode | null;
  next: FreqNode | null;
};

class FreqList {
  head: FreqNode | null = null;

  tail: FreqNode | null = null;

  size = 0;

  append(node: FreqNode) {
    node.prev = this.tail;
    node.next = null;
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.size += 1;
  }

  remove(node: FreqNode) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (this.head === node) this.head = node.next;
    if (this.tail === node) this.tail = node.prev;
    node.prev = null;
    node.next = null;
    this.size = Math.max(0, this.size - 1);
  }

  popFront(): FreqNode | null {
    if (!this.head) return null;
    const first = this.head;
    this.remove(first);
    return first;
  }
}

export function runLFU(framesCount: number, refs: number[]): MemResult {
  const frameCount = Math.max(1, Math.floor(framesCount));
  const frames: Array<number | null> = Array.from({ length: frameCount }, () => null);
  const pageToNode = new Map<number, FreqNode>();
  const buckets = new Map<number, FreqList>();
  let minFreq = 0;

  const getBucket = (freq: number) => {
    const existing = buckets.get(freq);
    if (existing) return existing;
    const next = new FreqList();
    buckets.set(freq, next);
    return next;
  };

  const touch = (node: FreqNode) => {
    const currentBucket = buckets.get(node.freq);
    currentBucket?.remove(node);
    if (currentBucket && currentBucket.size === 0) {
      buckets.delete(node.freq);
      if (minFreq === node.freq) minFreq += 1;
    }

    node.freq += 1;
    getBucket(node.freq).append(node);
  };

  let hits = 0;
  let faults = 0;
  const steps: MemStep[] = [];

  refs.forEach((rawRef, t) => {
    const ref = Math.max(0, Math.floor(rawRef));
    const existing = pageToNode.get(ref);
    const hit = Boolean(existing);
    let evicted: number | undefined;

    if (existing) {
      hits += 1;
      touch(existing);
    } else {
      faults += 1;

      if (pageToNode.size >= frameCount) {
        const bucket = buckets.get(minFreq);
        const victim = bucket?.popFront() ?? null;
        if (!victim) {
          throw new Error("LFU invariant broken: missing victim");
        }

        const slot = frames.indexOf(victim.page);
        frames[slot] = null;
        pageToNode.delete(victim.page);
        evicted = victim.page;
        if (bucket && bucket.size === 0) {
          buckets.delete(minFreq);
        }
      }

      const targetSlot = frames.includes(null) ? frames.indexOf(null) : 0;
      frames[targetSlot] = ref;

      const node: FreqNode = {
        page: ref,
        freq: 1,
        prev: null,
        next: null,
      };
      pageToNode.set(ref, node);
      getBucket(1).append(node);
      minFreq = 1;
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
