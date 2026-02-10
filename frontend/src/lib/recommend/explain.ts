import type { OptimizeFor } from "@/lib/types";

import type { RankedScore } from "@/lib/recommend/score";
import type { WorkloadProfile } from "@/lib/recommend/workload";

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

type ExplainInput = {
  optimizeFor: OptimizeFor;
  workload: WorkloadProfile;
  best: RankedScore | null;
  second: RankedScore | null;
  confidence: ConfidenceLevel;
  closeCall: boolean;
};

function f1(value: number): string {
  return value.toFixed(1);
}

function f2(value: number): string {
  return value.toFixed(2);
}

function modeLine(mode: OptimizeFor, winner: string): string {
  if (mode === "throughput") {
    return `${winner} is tuned for fastest overall completion in batch-style execution.`;
  }
  if (mode === "responsiveness") {
    return `${winner} leads on interactive snappiness with stronger response/wait behavior.`;
  }
  return `${winner} offers the most balanced waiting and completion fairness for this run.`;
}

function workloadLine(workload: WorkloadProfile): string {
  const parts: string[] = [];
  if (workload.io_ratio >= 0.6) parts.push(`high I/O ratio (${f2(workload.io_ratio)})`);
  if (workload.burst_variance >= 0.8) parts.push(`bursty CPU variance (${f2(workload.burst_variance)})`);
  if (workload.arrival_spread >= 10) parts.push(`wide arrivals (${f1(workload.arrival_spread)})`);
  if (workload.n_procs >= 12) parts.push(`larger queue set (${workload.n_procs})`);

  if (parts.length === 0) {
    return `Workload is moderate (io_ratio ${f2(workload.io_ratio)}, variance ${f2(workload.burst_variance)}), so balanced metrics dominate.`;
  }
  return `Workload signal: ${parts.join(", ")}; weighting shifts accordingly.`;
}

function throughputDeltaLine(best: RankedScore, second: RankedScore): string {
  return `Vs ${second.row.algorithm}: makespan ${f1(best.row.makespan)} vs ${f1(second.row.makespan)}, throughput ${f2(best.row.throughput)} vs ${f2(second.row.throughput)}, util ${f1(best.row.cpu_util)}% vs ${f1(second.row.cpu_util)}%.`;
}

function responsivenessDeltaLine(best: RankedScore, second: RankedScore): string {
  return `Vs ${second.row.algorithm}: avg RT ${f2(best.row.avg_rt)} vs ${f2(second.row.avg_rt)}, avg WT ${f2(best.row.avg_wt)} vs ${f2(second.row.avg_wt)}, p95 WT ${f2(best.row.p95_wt)} vs ${f2(second.row.p95_wt)}.`;
}

function fairnessDeltaLine(best: RankedScore, second: RankedScore): string {
  return `Vs ${second.row.algorithm}: avg TAT ${f2(best.row.avg_tat)} vs ${f2(second.row.avg_tat)}, avg WT ${f2(best.row.avg_wt)} vs ${f2(second.row.avg_wt)}, tail wait p95 ${f2(best.row.p95_wt)} vs ${f2(second.row.p95_wt)}.`;
}

export function generateExplanation(input: ExplainInput): string[] {
  const { optimizeFor, workload, best, second, confidence, closeCall } = input;
  if (!best) return ["No algorithm results available for recommendation."];

  const lines: string[] = [modeLine(optimizeFor, best.row.algorithm), workloadLine(workload)];

  if (second) {
    if (optimizeFor === "throughput") lines.push(throughputDeltaLine(best, second));
    else if (optimizeFor === "responsiveness") lines.push(responsivenessDeltaLine(best, second));
    else lines.push(fairnessDeltaLine(best, second));
  }

  if (closeCall && second) {
    lines.push(
      `Close call: ${best.row.algorithm} and ${second.row.algorithm} score similarly (${confidence}). Pick ${best.row.algorithm} for primary mode goals, ${second.row.algorithm} for alternative trade-offs.`,
    );
  }

  return lines.slice(0, 4);
}
