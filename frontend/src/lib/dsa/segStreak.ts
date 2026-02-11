export interface SegStreakNode {
  len: number;
  pref1: number;
  suf1: number;
  best1: number;
  pref0: number;
  suf0: number;
  best0: number;
}

const EMPTY_NODE: SegStreakNode = {
  len: 0,
  pref1: 0,
  suf1: 0,
  best1: 0,
  pref0: 0,
  suf0: 0,
  best0: 0,
};

function cloneEmptyNode(): SegStreakNode {
  return { ...EMPTY_NODE };
}

function makeLeaf(value: number, len = 1): SegStreakNode {
  if (len <= 0) {
    return cloneEmptyNode();
  }
  const bit = value > 0 ? 1 : 0;
  return {
    len: 1,
    pref1: bit,
    suf1: bit,
    best1: bit,
    pref0: bit === 0 ? 1 : 0,
    suf0: bit === 0 ? 1 : 0,
    best0: bit === 0 ? 1 : 0,
  };
}

export function mergeSegNodes(left: SegStreakNode, right: SegStreakNode): SegStreakNode {
  if (left.len === 0) return { ...right };
  if (right.len === 0) return { ...left };

  const len = left.len + right.len;
  const pref1 = left.pref1 === left.len ? left.len + right.pref1 : left.pref1;
  const suf1 = right.suf1 === right.len ? right.len + left.suf1 : right.suf1;
  const best1 = Math.max(left.best1, right.best1, left.suf1 + right.pref1);

  const pref0 = left.pref0 === left.len ? left.len + right.pref0 : left.pref0;
  const suf0 = right.suf0 === right.len ? right.len + left.suf0 : right.suf0;
  const best0 = Math.max(left.best0, right.best0, left.suf0 + right.pref0);

  return {
    len,
    pref1,
    suf1,
    best1,
    pref0,
    suf0,
    best0,
  };
}

function nextPowerOfTwo(value: number): number {
  let next = 1;
  while (next < value) next <<= 1;
  return next;
}

export class SegStreak {
  private n: number;

  private size: number;

  private tree: SegStreakNode[];

  private data: number[];

  constructor(values: number[]) {
    this.data = values.map((value) => (value > 0 ? 1 : 0));
    this.n = this.data.length;
    this.size = nextPowerOfTwo(Math.max(1, this.n));
    this.tree = Array.from({ length: this.size * 2 }, () => cloneEmptyNode());
    this.build();
  }

  get length(): number {
    return this.n;
  }

  private build(): void {
    this.tree = Array.from({ length: this.size * 2 }, () => cloneEmptyNode());
    for (let index = 0; index < this.n; index += 1) {
      this.tree[this.size + index] = makeLeaf(this.data[index], 1);
    }
    for (let index = this.size - 1; index >= 1; index -= 1) {
      this.tree[index] = mergeSegNodes(this.tree[index * 2], this.tree[index * 2 + 1]);
    }
  }

  private ensureCapacity(minSize: number): void {
    if (minSize <= this.size) return;
    this.size = nextPowerOfTwo(minSize);
    this.build();
  }

  update(pos: number, value: number): void {
    const index = Math.floor(pos);
    if (index < 0 || index >= this.n) return;

    const bit = value > 0 ? 1 : 0;
    if (this.data[index] === bit) return;

    this.data[index] = bit;
    let treeIndex = this.size + index;
    this.tree[treeIndex] = makeLeaf(bit, 1);
    treeIndex >>= 1;

    while (treeIndex >= 1) {
      this.tree[treeIndex] = mergeSegNodes(this.tree[treeIndex * 2], this.tree[treeIndex * 2 + 1]);
      treeIndex >>= 1;
    }
  }

  append(value: number): void {
    this.ensureCapacity(this.n + 1);
    const bit = value > 0 ? 1 : 0;
    this.data[this.n] = -1;
    this.n += 1;
    this.update(this.n - 1, bit);
  }

  query(l: number, r: number): SegStreakNode {
    if (this.n === 0) {
      return cloneEmptyNode();
    }

    const left = Math.max(0, Math.min(Math.floor(l), this.n - 1));
    const right = Math.max(0, Math.min(Math.floor(r), this.n - 1));
    if (left > right) {
      return cloneEmptyNode();
    }

    let queryLeft = left + this.size;
    let queryRight = right + this.size;

    let leftResult = cloneEmptyNode();
    let rightResult = cloneEmptyNode();

    while (queryLeft <= queryRight) {
      if (queryLeft & 1) {
        leftResult = mergeSegNodes(leftResult, this.tree[queryLeft]);
        queryLeft += 1;
      }
      if (!(queryRight & 1)) {
        rightResult = mergeSegNodes(this.tree[queryRight], rightResult);
        queryRight -= 1;
      }
      queryLeft >>= 1;
      queryRight >>= 1;
    }

    return mergeSegNodes(leftResult, rightResult);
  }
}
