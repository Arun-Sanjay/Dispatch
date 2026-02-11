export class Fenwick {
  private n: number;

  private capacity: number;

  private tree: number[];

  private data: number[];

  constructor(n: number) {
    this.n = Math.max(0, Math.floor(n));
    this.capacity = Math.max(1, this.n);
    this.tree = new Array(this.capacity + 1).fill(0);
    this.data = new Array(this.capacity).fill(0);
  }

  get size() {
    return this.n;
  }

  private rebuild(newCapacity: number) {
    const nextCapacity = Math.max(1, Math.floor(newCapacity));
    const nextTree = new Array(nextCapacity + 1).fill(0);
    const nextData = new Array(nextCapacity).fill(0);
    for (let i = 0; i < this.n; i += 1) {
      const value = this.data[i] ?? 0;
      nextData[i] = value;
      let idx = i + 1;
      while (idx <= nextCapacity) {
        nextTree[idx] += value;
        idx += idx & -idx;
      }
    }
    this.capacity = nextCapacity;
    this.tree = nextTree;
    this.data = nextData;
  }

  private ensureCapacity(targetSize: number) {
    if (targetSize <= this.capacity) return;
    let next = this.capacity;
    while (next < targetSize) next *= 2;
    this.rebuild(next);
  }

  add(i: number, delta: number) {
    const idx = Math.floor(i);
    if (idx < 0 || idx >= this.n) return;
    const change = Number(delta) || 0;
    if (change === 0) return;
    this.data[idx] += change;

    let bitIndex = idx + 1;
    while (bitIndex <= this.capacity) {
      this.tree[bitIndex] += change;
      bitIndex += bitIndex & -bitIndex;
    }
  }

  set(i: number, value: number) {
    const idx = Math.floor(i);
    if (idx < 0 || idx >= this.n) return;
    const next = Number(value) || 0;
    const delta = next - this.data[idx];
    this.add(idx, delta);
  }

  append(value: number) {
    this.ensureCapacity(this.n + 1);
    this.n += 1;
    this.data[this.n - 1] = 0;
    this.add(this.n - 1, Number(value) || 0);
  }

  sum(i: number): number {
    if (this.n === 0) return 0;
    const idx = Math.min(Math.floor(i), this.n - 1);
    if (idx < 0) return 0;

    let total = 0;
    let bitIndex = idx + 1;
    while (bitIndex > 0) {
      total += this.tree[bitIndex];
      bitIndex -= bitIndex & -bitIndex;
    }
    return total;
  }

  rangeSum(l: number, r: number): number {
    if (this.n === 0) return 0;
    const left = Math.max(0, Math.min(Math.floor(l), this.n - 1));
    const right = Math.max(0, Math.min(Math.floor(r), this.n - 1));
    if (left > right) return 0;
    return this.sum(right) - this.sum(left - 1);
  }
}
