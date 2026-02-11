export const segmentTreeQuerySnippet = `type SegNode = {
  len: number;
  pref1: number;
  suf1: number;
  best1: number;
  pref0: number;
  suf0: number;
  best0: number;
};

export class SegmentTree {
  private tree: SegNode[];

  constructor(bits: number[]) {
    this.tree = Array.from({ length: bits.length * 4 + 8 }, () => this.emptyNode());
    this.build(1, 0, bits.length - 1, bits);
  }

  query(left: number, right: number): SegNode {
    return this.queryRec(1, 0, this.size() - 1, left, right);
  }

  private queryRec(idx: number, l: number, r: number, ql: number, qr: number): SegNode {
    if (ql <= l && r <= qr) return this.tree[idx];
    const mid = Math.floor((l + r) / 2);

    if (qr <= mid) return this.queryRec(idx * 2, l, mid, ql, qr);
    if (ql > mid) return this.queryRec(idx * 2 + 1, mid + 1, r, ql, qr);

    const leftNode = this.queryRec(idx * 2, l, mid, ql, qr);
    const rightNode = this.queryRec(idx * 2 + 1, mid + 1, r, ql, qr);
    return this.merge(leftNode, rightNode);
  }

  private merge(a: SegNode, b: SegNode): SegNode {
    return {
      len: a.len + b.len,
      pref1: a.pref1 === a.len ? a.len + b.pref1 : a.pref1,
      suf1: b.suf1 === b.len ? b.len + a.suf1 : b.suf1,
      best1: Math.max(a.best1, b.best1, a.suf1 + b.pref1),
      pref0: a.pref0 === a.len ? a.len + b.pref0 : a.pref0,
      suf0: b.suf0 === b.len ? b.len + a.suf0 : b.suf0,
      best0: Math.max(a.best0, b.best0, a.suf0 + b.pref0),
    };
  }
}`;

export const ganttRleSnippet = `export type Segment = {
  pid: string;
  start: number;
  end: number;
  len: number;
};

export function buildSegments(ticks: string[]): Segment[] {
  if (ticks.length === 0) return [];

  const segments: Segment[] = [];
  let activePid = ticks[0] || "IDLE";
  let start = 0;

  for (let i = 1; i < ticks.length; i += 1) {
    const pid = ticks[i] || "IDLE";
    if (pid === activePid) continue;

    const end = i - 1;
    segments.push({ pid: activePid, start, end, len: end - start + 1 });
    activePid = pid;
    start = i;
  }

  const tail = ticks.length - 1;
  segments.push({ pid: activePid, start, end: tail, len: tail - start + 1 });
  return segments;
}`;

export const fenwickUpdateSnippet = `export class Fenwick {
  private bit: number[];

  constructor(private readonly n: number) {
    this.bit = Array.from({ length: n + 1 }, () => 0);
  }

  add(index: number, delta: number): void {
    for (let i = index + 1; i <= this.n; i += i & -i) {
      this.bit[i] += delta;
    }
  }

  sum(index: number): number {
    let result = 0;
    for (let i = index + 1; i > 0; i -= i & -i) {
      result += this.bit[i];
    }
    return result;
  }

  rangeSum(left: number, right: number): number {
    if (right < left) return 0;
    return this.sum(right) - (left > 0 ? this.sum(left - 1) : 0);
  }
}

export function buildTimelineAnalytics(gantt: string[]) {
  const busy = new Fenwick(gantt.length);
  gantt.forEach((pid, i) => {
    busy.add(i, pid !== "IDLE" ? 1 : 0);
  });
  return busy;
}`;
