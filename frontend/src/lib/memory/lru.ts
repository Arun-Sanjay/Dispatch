import type { MemResult, MemStep } from "@/lib/memory/types";

type Node = {
  key: number;
  prev: Node | null;
  next: Node | null;
};

class DoublyLinkedList {
  head: Node | null = null;

  tail: Node | null = null;

  append(node: Node) {
    node.prev = this.tail;
    node.next = null;
    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
  }

  remove(node: Node) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (this.head === node) this.head = node.next;
    if (this.tail === node) this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  popFront(): Node | null {
    if (!this.head) return null;
    const first = this.head;
    this.remove(first);
    return first;
  }
}

export function runLRU(framesCount: number, refs: number[]): MemResult {
  const frameCount = Math.max(1, Math.floor(framesCount));
  const frames: Array<number | null> = Array.from({ length: frameCount }, () => null);
  const nodeMap = new Map<number, Node>();
  const list = new DoublyLinkedList();

  let hits = 0;
  let faults = 0;
  const steps: MemStep[] = [];

  const touch = (page: number) => {
    const existing = nodeMap.get(page);
    if (existing) {
      list.remove(existing);
      list.append(existing);
      return;
    }
    const node: Node = { key: page, prev: null, next: null };
    nodeMap.set(page, node);
    list.append(node);
  };

  refs.forEach((rawRef, t) => {
    const ref = Math.max(0, Math.floor(rawRef));
    const hit = frames.includes(ref);
    let evicted: number | undefined;

    if (hit) {
      hits += 1;
      touch(ref);
    } else {
      faults += 1;

      if (frames.includes(null)) {
        const slot = frames.indexOf(null);
        frames[slot] = ref;
        touch(ref);
      } else {
        const victimNode = list.popFront();
        const victim = victimNode?.key;
        if (typeof victim !== "number") {
          throw new Error("LRU invariant broken: missing victim");
        }

        const slot = frames.indexOf(victim);
        frames[slot] = ref;
        nodeMap.delete(victim);
        evicted = victim;
        touch(ref);
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
