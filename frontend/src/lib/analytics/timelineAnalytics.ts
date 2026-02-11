import { Fenwick } from "@/lib/dsa/fenwick";
import { SegStreak } from "@/lib/dsa/segStreak";

export interface TickRange {
  l: number;
  r: number;
}

export interface RangeStats {
  busyTicks: number;
  idleTicks: number;
  utilPct: number;
  longestBusyStreak: number;
  longestIdleStreak: number;
  totalTicks: number;
}

const EMPTY_STATS: RangeStats = {
  busyTicks: 0,
  idleTicks: 0,
  utilPct: 0,
  longestBusyStreak: 0,
  longestIdleStreak: 0,
  totalTicks: 0,
};

function toBusyBit(pid: string | undefined): number {
  return pid && pid !== "IDLE" ? 1 : 0;
}

function clampTick(value: number, maxTick: number): number {
  return Math.max(0, Math.min(Math.floor(value), Math.max(0, maxTick)));
}

export function clampTickRange(range: TickRange, maxTick: number): TickRange {
  const left = clampTick(Math.min(range.l, range.r), maxTick);
  const right = clampTick(Math.max(range.l, range.r), maxTick);
  return { l: left, r: right };
}

export class TimelineAnalytics {
  private gantt: string[];

  fenwickBusy: Fenwick;

  fenwickIdle: Fenwick;

  segStreakBusyIdle: SegStreak;

  constructor(gantt: string[]) {
    this.gantt = [];
    this.fenwickBusy = new Fenwick(0);
    this.fenwickIdle = new Fenwick(0);
    this.segStreakBusyIdle = new SegStreak([]);
    this.rebuild(gantt);
  }

  get length(): number {
    return this.gantt.length;
  }

  private rebuild(gantt: string[]): void {
    this.gantt = [...gantt];
    const bits = this.gantt.map((pid) => toBusyBit(pid));

    this.fenwickBusy = new Fenwick(bits.length);
    this.fenwickIdle = new Fenwick(bits.length);
    this.segStreakBusyIdle = new SegStreak(bits);

    for (let index = 0; index < bits.length; index += 1) {
      const bit = bits[index];
      this.fenwickBusy.add(index, bit);
      this.fenwickIdle.add(index, 1 - bit);
    }
  }

  private updateTick(index: number, nextPid: string): void {
    const previousBit = toBusyBit(this.gantt[index]);
    const nextBit = toBusyBit(nextPid);
    if (previousBit === nextBit) return;

    this.fenwickBusy.add(index, nextBit - previousBit);
    this.fenwickIdle.add(index, previousBit - nextBit);
    this.segStreakBusyIdle.update(index, nextBit);
  }

  private appendTick(pid: string): void {
    const bit = toBusyBit(pid);
    this.fenwickBusy.append(bit);
    this.fenwickIdle.append(1 - bit);
    this.segStreakBusyIdle.append(bit);
  }

  sync(nextGantt: string[]): void {
    if (nextGantt.length < this.gantt.length) {
      this.rebuild(nextGantt);
      return;
    }

    if (nextGantt.length === this.gantt.length) {
      for (let index = 0; index < nextGantt.length; index += 1) {
        if (nextGantt[index] === this.gantt[index]) continue;
        this.updateTick(index, nextGantt[index]);
      }
      this.gantt = [...nextGantt];
      return;
    }

    for (let index = 0; index < this.gantt.length; index += 1) {
      if (nextGantt[index] === this.gantt[index]) continue;
      this.rebuild(nextGantt);
      return;
    }

    for (let index = this.gantt.length; index < nextGantt.length; index += 1) {
      this.appendTick(nextGantt[index]);
    }
    this.gantt = [...nextGantt];
  }

  getRangeStats(l: number, r: number): RangeStats {
    if (this.gantt.length === 0) return { ...EMPTY_STATS };

    const left = clampTick(Math.min(l, r), this.gantt.length - 1);
    const right = clampTick(Math.max(l, r), this.gantt.length - 1);
    if (left > right) return { ...EMPTY_STATS };

    const totalTicks = right - left + 1;
    const busyTicks = this.fenwickBusy.rangeSum(left, right);
    const idleTicks = totalTicks - busyTicks;
    const streakNode = this.segStreakBusyIdle.query(left, right);
    const utilPct = totalTicks > 0 ? (busyTicks / totalTicks) * 100 : 0;

    return {
      busyTicks,
      idleTicks,
      utilPct,
      longestBusyStreak: streakNode.best1,
      longestIdleStreak: streakNode.best0,
      totalTicks,
    };
  }
}

export function buildTimelineAnalytics(gantt: string[]): TimelineAnalytics {
  return new TimelineAnalytics(gantt);
}

export function getEmptyRangeStats(): RangeStats {
  return { ...EMPTY_STATS };
}
