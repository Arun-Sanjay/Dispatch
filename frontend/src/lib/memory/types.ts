export type MemoryAlgorithm = "FIFO" | "LRU" | "LFU" | "OPT";

export type MemStep = {
  t: number;
  ref: number;
  frames: Array<number | null>;
  hit: boolean;
  evicted?: number;
};

export type MemResult = {
  steps: MemStep[];
  faults: number;
  hits: number;
  hitRatio: number;
};
