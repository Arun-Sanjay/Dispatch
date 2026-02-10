import type { OptimizeFor } from "@/lib/types";

import { generateExplanation, type ConfidenceLevel } from "@/lib/recommend/explain";
import { paretoFront, type ObjectiveSpec } from "@/lib/recommend/pareto";
import {
  buildAdjustedWeights,
  enrichWithFairness,
  scoreAlgorithms,
  type CompareAlgorithmResult,
  type EnrichedAlgorithmResult,
  type MetricWeights,
  type RankedScore,
} from "@/lib/recommend/score";
import { extractWorkloadProfile, type WorkloadProcess, type WorkloadProfile } from "@/lib/recommend/workload";

export type {
  CompareAlgorithmResult,
  ComparePerProcessRow,
  EnrichedAlgorithmResult,
  FairnessMetrics,
  MetricWeights,
  RankedScore,
  ScoreMetric,
} from "@/lib/recommend/score";
export type { WorkloadProcess, WorkloadProfile } from "@/lib/recommend/workload";

const EPS = 1e-6;

function buildObjectives(): Array<ObjectiveSpec<EnrichedAlgorithmResult>> {
  return [
    { key: "avg_wt", direction: "min", getValue: (row) => row.avg_wt },
    { key: "avg_tat", direction: "min", getValue: (row) => row.avg_tat },
    { key: "avg_rt", direction: "min", getValue: (row) => row.avg_rt },
    { key: "makespan", direction: "min", getValue: (row) => row.makespan },
    { key: "p95_wt", direction: "min", getValue: (row) => row.p95_wt },
    { key: "max_wt", direction: "min", getValue: (row) => row.max_wt },
    { key: "wt_std", direction: "min", getValue: (row) => row.wt_std },
    { key: "cpu_util", direction: "max", getValue: (row) => row.cpu_util },
    { key: "throughput", direction: "max", getValue: (row) => row.throughput },
  ];
}

function confidenceFromGap(gap: number): ConfidenceLevel {
  if (gap >= 0.08) return "HIGH";
  if (gap >= 0.04) return "MEDIUM";
  return "LOW";
}

function computeGap(best: RankedScore | null, second: RankedScore | null): number {
  if (!best || !second) return 1;
  return (second.score - best.score) / Math.max(Math.abs(best.score), EPS);
}

function normalizeWorkload(
  workload: Partial<WorkloadProfile> | null | undefined,
): WorkloadProfile | null {
  if (!workload) return null;
  const nProcs = Number(workload.n_procs);
  if (!Number.isFinite(nProcs)) return null;
  return {
    total_cpu: Number(workload.total_cpu ?? 0),
    total_io: Number(workload.total_io ?? 0),
    io_ratio: Number(workload.io_ratio ?? 0),
    avg_cpu_burst: Number(workload.avg_cpu_burst ?? 0),
    std_cpu_burst: Number(workload.std_cpu_burst ?? 0),
    burst_variance: Number(workload.burst_variance ?? 0),
    n_procs: Number(workload.n_procs ?? 0),
    arrival_spread: Number(workload.arrival_spread ?? 0),
    burst_count_total: Number(workload.burst_count_total ?? 0),
  };
}

export type RecommendationResult = {
  optimizeFor: OptimizeFor;
  workload: WorkloadProfile;
  allRows: EnrichedAlgorithmResult[];
  paretoRows: EnrichedAlgorithmResult[];
  dominatedAlgorithms: string[];
  weights: MetricWeights;
  ranked: RankedScore[];
  best: RankedScore | null;
  second: RankedScore | null;
  confidence: ConfidenceLevel;
  gap: number;
  closeCall: boolean;
  explanation: string[];
};

export function recommendAlgorithm(input: {
  results: CompareAlgorithmResult[];
  optimizeFor: OptimizeFor;
  workload?: Partial<WorkloadProfile> | null;
  workloadProcesses?: WorkloadProcess[];
}): RecommendationResult {
  const enriched = enrichWithFairness(input.results);
  const fallbackWorkload = extractWorkloadProfile(input.workloadProcesses ?? []);
  const normalizedWorkload = normalizeWorkload(input.workload);
  const workload = normalizedWorkload ?? fallbackWorkload;

  const objectives = buildObjectives();
  const pareto = paretoFront(enriched, objectives);
  const paretoRows = pareto.length > 0 ? pareto : enriched;
  const paretoIds = new Set(paretoRows.map((row) => row.algorithm));
  const dominatedAlgorithms = enriched
    .filter((row) => !paretoIds.has(row.algorithm))
    .map((row) => row.algorithm);

  const weights = buildAdjustedWeights(input.optimizeFor, workload, paretoRows);
  const ranked = scoreAlgorithms(paretoRows, input.optimizeFor, weights);
  const best = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  const gap = computeGap(best, second);
  const confidence = confidenceFromGap(gap);
  const closeCall = confidence === "LOW";

  const explanation = generateExplanation({
    optimizeFor: input.optimizeFor,
    workload,
    best,
    second,
    confidence,
    closeCall,
  });

  return {
    optimizeFor: input.optimizeFor,
    workload,
    allRows: enriched,
    paretoRows,
    dominatedAlgorithms,
    weights,
    ranked,
    best,
    second,
    confidence,
    gap,
    closeCall,
    explanation,
  };
}
