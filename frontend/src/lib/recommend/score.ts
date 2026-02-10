import type { Algorithm, OptimizeFor } from "@/lib/types";

import { robustNormalizeMetric } from "@/lib/recommend/normalize";
import type { WorkloadProfile } from "@/lib/recommend/workload";

export type ScoreMetric =
  | "avg_wt"
  | "avg_tat"
  | "avg_rt"
  | "makespan"
  | "cpu_util"
  | "throughput"
  | "p95_wt"
  | "max_wt"
  | "wt_std";

export type ComparePerProcessRow = {
  pid: string;
  wt?: number | null;
  tat?: number | null;
  rt?: number | null;
  at?: number | null;
  pr?: number | null;
  queue?: string;
};

export type CompareAlgorithmResult = {
  algorithm: Algorithm;
  avg_wt: number;
  avg_tat: number;
  avg_rt: number;
  cpu_util: number;
  makespan: number;
  throughput: number;
  per_process?: ComparePerProcessRow[];
};

export type FairnessMetrics = {
  max_wt: number;
  p95_wt: number;
  wt_std: number;
  starvation_flag: boolean;
  starvation_threshold: number;
};

export type EnrichedAlgorithmResult = CompareAlgorithmResult & FairnessMetrics;

export type MetricWeights = Record<ScoreMetric, number>;

export type RankedScore = {
  row: EnrichedAlgorithmResult;
  score: number;
  normalized: Record<ScoreMetric, number>;
};

const METRICS: ScoreMetric[] = [
  "avg_wt",
  "avg_tat",
  "avg_rt",
  "makespan",
  "cpu_util",
  "throughput",
  "p95_wt",
  "max_wt",
  "wt_std",
];

const LOW_BETTER: Set<ScoreMetric> = new Set([
  "avg_wt",
  "avg_tat",
  "avg_rt",
  "makespan",
  "p95_wt",
  "max_wt",
  "wt_std",
]);

const FAIRNESS_BASE: MetricWeights = {
  avg_tat: 0.25,
  avg_wt: 0.2,
  avg_rt: 0.15,
  makespan: 0.1,
  cpu_util: 0.05,
  throughput: 0,
  p95_wt: 0.15,
  wt_std: 0.1,
  max_wt: 0,
};

const RESPONSIVENESS_BASE: MetricWeights = {
  avg_tat: 0.1,
  avg_wt: 0.2,
  avg_rt: 0.35,
  makespan: 0.05,
  cpu_util: 0.1,
  throughput: 0,
  p95_wt: 0.15,
  wt_std: 0.05,
  max_wt: 0,
};

const THROUGHPUT_BASE: MetricWeights = {
  avg_tat: 0.15,
  avg_wt: 0.1,
  avg_rt: 0.05,
  makespan: 0.3,
  cpu_util: 0.15,
  throughput: 0.2,
  p95_wt: 0.05,
  wt_std: 0,
  max_wt: 0,
};

function std(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function percentile95NearestRank(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rankIndex = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[rankIndex];
}

function toFiniteNumber(value: number | null | undefined, fallback = 0): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function getMetric(row: EnrichedAlgorithmResult, metric: ScoreMetric): number {
  const value = row[metric];
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function emptyWeights(): MetricWeights {
  return {
    avg_tat: 0,
    avg_wt: 0,
    avg_rt: 0,
    makespan: 0,
    cpu_util: 0,
    throughput: 0,
    p95_wt: 0,
    wt_std: 0,
    max_wt: 0,
  };
}

function baseWeights(mode: OptimizeFor): MetricWeights {
  if (mode === "throughput") return { ...THROUGHPUT_BASE };
  if (mode === "responsiveness") return { ...RESPONSIVENESS_BASE };
  return { ...FAIRNESS_BASE };
}

function applyWorkloadAdjustments(weights: MetricWeights, workload: WorkloadProfile): MetricWeights {
  const next = { ...weights };

  if (workload.io_ratio >= 0.6) {
    next.avg_rt += 0.08;
    next.avg_wt += 0.05;
    next.makespan -= 0.05;
    next.avg_tat -= 0.08;
  }

  if (workload.burst_variance >= 0.8) {
    next.avg_tat += 0.07;
    next.avg_wt += 0.05;
    next.cpu_util -= 0.06;
    next.makespan -= 0.06;
  }

  if (workload.arrival_spread >= 10) {
    next.avg_rt += 0.06;
    next.p95_wt += 0.04;
  }

  if (workload.n_procs >= 12) {
    next.p95_wt += 0.05;
    next.wt_std += 0.05;
  }

  return next;
}

function tieBreaker(mode: OptimizeFor, left: EnrichedAlgorithmResult, right: EnrichedAlgorithmResult): number {
  if (mode === "throughput") {
    if (left.makespan !== right.makespan) return left.makespan - right.makespan;
    if (left.throughput !== right.throughput) return right.throughput - left.throughput;
    return right.cpu_util - left.cpu_util;
  }

  if (mode === "responsiveness") {
    if (left.avg_rt !== right.avg_rt) return left.avg_rt - right.avg_rt;
    if (left.avg_wt !== right.avg_wt) return left.avg_wt - right.avg_wt;
    return left.avg_tat - right.avg_tat;
  }

  if (left.avg_tat !== right.avg_tat) return left.avg_tat - right.avg_tat;
  if (left.avg_wt !== right.avg_wt) return left.avg_wt - right.avg_wt;
  return left.avg_rt - right.avg_rt;
}

function hasThroughput(rows: EnrichedAlgorithmResult[]): boolean {
  return rows.every((row) => Number.isFinite(row.throughput));
}

export function computeFairnessMetrics(row: CompareAlgorithmResult): FairnessMetrics {
  const waits = (row.per_process ?? [])
    .map((processRow) => toFiniteNumber(processRow.wt, Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (waits.length === 0) {
    const threshold = Math.max(2 * toFiniteNumber(row.avg_wt, 0), 10);
    return {
      max_wt: toFiniteNumber(row.avg_wt, 0),
      p95_wt: toFiniteNumber(row.avg_wt, 0),
      wt_std: 0,
      starvation_flag: toFiniteNumber(row.avg_wt, 0) >= threshold,
      starvation_threshold: threshold,
    };
  }

  const maxWt = Math.max(...waits);
  const p95Wt = percentile95NearestRank(waits);
  const stdWt = std(waits);
  const threshold = Math.max(2 * toFiniteNumber(row.avg_wt, 0), 10);

  return {
    max_wt: maxWt,
    p95_wt: p95Wt,
    wt_std: stdWt,
    starvation_flag: maxWt >= threshold,
    starvation_threshold: threshold,
  };
}

export function enrichWithFairness(rows: CompareAlgorithmResult[]): EnrichedAlgorithmResult[] {
  return rows.map((row) => ({
    ...row,
    ...computeFairnessMetrics(row),
  }));
}

export function buildAdjustedWeights(
  mode: OptimizeFor,
  workload: WorkloadProfile,
  rows: EnrichedAlgorithmResult[],
): MetricWeights {
  const throughputAvailable = hasThroughput(rows);
  const base = baseWeights(mode);
  const adjusted = applyWorkloadAdjustments(base, workload);

  if (!throughputAvailable && adjusted.throughput > 0) {
    const moved = adjusted.throughput;
    adjusted.throughput = 0;
    adjusted.makespan += moved * 0.6;
    adjusted.cpu_util += moved * 0.4;
  }

  const included = METRICS.filter((metric) => base[metric] > 0 || adjusted[metric] > 0);
  const clamped = emptyWeights();
  for (const metric of METRICS) {
    if (!included.includes(metric)) {
      clamped[metric] = 0;
      continue;
    }
    clamped[metric] = Math.max(0.02, adjusted[metric]);
  }

  const sum = included.reduce((acc, metric) => acc + clamped[metric], 0);
  if (sum <= 0) {
    const uniform = included.length > 0 ? 1 / included.length : 0;
    for (const metric of METRICS) {
      clamped[metric] = included.includes(metric) ? uniform : 0;
    }
    return clamped;
  }

  for (const metric of included) {
    clamped[metric] = clamped[metric] / sum;
  }

  return clamped;
}

export function scoreAlgorithms(
  rows: EnrichedAlgorithmResult[],
  mode: OptimizeFor,
  weights: MetricWeights,
): RankedScore[] {
  if (!rows.length) return [];

  const normalizedByMetric: Record<ScoreMetric, number[]> = {
    avg_wt: [],
    avg_tat: [],
    avg_rt: [],
    makespan: [],
    cpu_util: [],
    throughput: [],
    p95_wt: [],
    max_wt: [],
    wt_std: [],
  };

  for (const metric of METRICS) {
    const values = rows.map((row) => getMetric(row, metric));
    normalizedByMetric[metric] = robustNormalizeMetric(values, LOW_BETTER.has(metric) ? "low" : "high");
  }

  const scored: RankedScore[] = rows.map((row, rowIndex) => {
    const normalized: Record<ScoreMetric, number> = {
      avg_wt: normalizedByMetric.avg_wt[rowIndex],
      avg_tat: normalizedByMetric.avg_tat[rowIndex],
      avg_rt: normalizedByMetric.avg_rt[rowIndex],
      makespan: normalizedByMetric.makespan[rowIndex],
      cpu_util: normalizedByMetric.cpu_util[rowIndex],
      throughput: normalizedByMetric.throughput[rowIndex],
      p95_wt: normalizedByMetric.p95_wt[rowIndex],
      max_wt: normalizedByMetric.max_wt[rowIndex],
      wt_std: normalizedByMetric.wt_std[rowIndex],
    };

    const score = METRICS.reduce((acc, metric) => acc + weights[metric] * normalized[metric], 0);
    return { row, score, normalized };
  });

  scored.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    return tieBreaker(mode, left.row, right.row);
  });

  return scored;
}
