"use client";

import { useEffect, useMemo, useState } from "react";

import { RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  recommendAlgorithm,
  type CompareAlgorithmResult,
  type WorkloadProcess,
  type WorkloadProfile,
} from "@/lib/recommend";
import { extractWorkloadProfile } from "@/lib/recommend/workload";
import type { OptimizeFor } from "@/lib/types";

type CompareViewProps = {
  refreshKey?: string;
  workloadProcesses?: WorkloadProcess[];
};

type CompareApiResponse = {
  results?: unknown;
  workload?: Partial<WorkloadProfile>;
};

const API_BASE = "http://127.0.0.1:8000";
const EMPTY_WORKLOAD_PROCESSES: WorkloadProcess[] = [];

const fallbackWorkloadProcesses: WorkloadProcess[] = [
  { arrival_time: 0, bursts: [5, 2, 2] },
  { arrival_time: 1, bursts: [3] },
  { arrival_time: 2, bursts: [2, 3, 1] },
  { arrival_time: 4, bursts: [4, 2, 3] },
];

const fallbackResults: CompareAlgorithmResult[] = [
  {
    algorithm: "FCFS",
    avg_wt: 7.2,
    avg_tat: 14.1,
    avg_rt: 3.9,
    cpu_util: 81.3,
    makespan: 32,
    throughput: 0.156,
    per_process: [
      { pid: "P1", wt: 5 },
      { pid: "P2", wt: 9 },
      { pid: "P3", wt: 6 },
      { pid: "P4", wt: 9 },
    ],
  },
  {
    algorithm: "SJF",
    avg_wt: 5.1,
    avg_tat: 12.0,
    avg_rt: 2.8,
    cpu_util: 86.0,
    makespan: 29,
    throughput: 0.172,
    per_process: [
      { pid: "P1", wt: 4 },
      { pid: "P2", wt: 5 },
      { pid: "P3", wt: 6 },
      { pid: "P4", wt: 5 },
    ],
  },
  {
    algorithm: "PRIORITY",
    avg_wt: 6.0,
    avg_tat: 12.7,
    avg_rt: 3.2,
    cpu_util: 84.4,
    makespan: 30,
    throughput: 0.166,
    per_process: [
      { pid: "P1", wt: 6 },
      { pid: "P2", wt: 6 },
      { pid: "P3", wt: 5 },
      { pid: "P4", wt: 7 },
    ],
  },
  {
    algorithm: "RR",
    avg_wt: 6.4,
    avg_tat: 13.8,
    avg_rt: 3.2,
    cpu_util: 84.0,
    makespan: 31,
    throughput: 0.161,
    per_process: [
      { pid: "P1", wt: 6 },
      { pid: "P2", wt: 7 },
      { pid: "P3", wt: 6 },
      { pid: "P4", wt: 7 },
    ],
  },
  {
    algorithm: "MLQ",
    avg_wt: 5.7,
    avg_tat: 12.3,
    avg_rt: 2.9,
    cpu_util: 88.1,
    makespan: 27,
    throughput: 0.185,
    per_process: [
      { pid: "P1", wt: 5 },
      { pid: "P2", wt: 4 },
      { pid: "P3", wt: 6 },
      { pid: "P4", wt: 4 },
    ],
  },
];

function normalizeResult(raw: unknown): CompareAlgorithmResult | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const algorithm = row.algorithm;
  if (
    algorithm !== "FCFS" &&
    algorithm !== "SJF" &&
    algorithm !== "PRIORITY" &&
    algorithm !== "RR" &&
    algorithm !== "MLQ"
  ) {
    return null;
  }

  const perProcess: CompareAlgorithmResult["per_process"] = Array.isArray(row.per_process)
    ? row.per_process
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => ({
          pid: String(item.pid ?? ""),
          wt: typeof item.wt === "number" ? item.wt : null,
          tat: typeof item.tat === "number" ? item.tat : null,
          rt: typeof item.rt === "number" ? item.rt : null,
          at: typeof item.at === "number" ? item.at : null,
          pr: typeof item.pr === "number" ? item.pr : null,
          queue: typeof item.queue === "string" ? item.queue : undefined,
        }))
    : [];

  return {
    algorithm,
    avg_wt: Number(row.avg_wt ?? 0),
    avg_tat: Number(row.avg_tat ?? 0),
    avg_rt: Number(row.avg_rt ?? 0),
    cpu_util: Number(row.cpu_util ?? 0),
    makespan: Number(row.makespan ?? 0),
    throughput: Number(row.throughput ?? 0),
    per_process: perProcess,
  };
}

function confidenceClass(level: "LOW" | "MEDIUM" | "HIGH"): string {
  if (level === "HIGH") return "border-emerald-500/40 text-emerald-300";
  if (level === "MEDIUM") return "border-amber-500/40 text-amber-300";
  return "border-rose-500/40 text-rose-300";
}

function modeLabel(mode: OptimizeFor): string {
  if (mode === "throughput") return "Throughput";
  if (mode === "responsiveness") return "Responsiveness";
  return "Fairness";
}

export function CompareView({ refreshKey = "", workloadProcesses = EMPTY_WORKLOAD_PROCESSES }: CompareViewProps) {
  const [optimizeFor, setOptimizeFor] = useState<OptimizeFor>("fairness");
  const [results, setResults] = useState<CompareAlgorithmResult[]>(fallbackResults);
  const [workload, setWorkload] = useState<WorkloadProfile>(
    extractWorkloadProfile(workloadProcesses.length ? workloadProcesses : fallbackWorkloadProcesses),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!workloadProcesses.length) return;
    setWorkload(extractWorkloadProfile(workloadProcesses));
  }, [workloadProcesses]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/sim/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error(`compare failed (${response.status})`);

        const payload = (await response.json()) as CompareApiResponse;
        const normalized = Array.isArray(payload.results)
          ? payload.results.map(normalizeResult).filter((row): row is CompareAlgorithmResult => row !== null)
          : [];

        if (!cancelled && normalized.length > 0) {
          setResults(normalized);
        }

        if (!cancelled && payload.workload) {
          const mergedWorkload = {
            total_cpu: Number(payload.workload.total_cpu ?? 0),
            total_io: Number(payload.workload.total_io ?? 0),
            io_ratio: Number(payload.workload.io_ratio ?? 0),
            avg_cpu_burst: Number(payload.workload.avg_cpu_burst ?? 0),
            std_cpu_burst: Number(payload.workload.std_cpu_burst ?? 0),
            burst_variance: Number(payload.workload.burst_variance ?? 0),
            n_procs: Number(payload.workload.n_procs ?? 0),
            arrival_spread: Number(payload.workload.arrival_spread ?? 0),
            burst_count_total: Number(payload.workload.burst_count_total ?? 0),
          } satisfies WorkloadProfile;
          setWorkload(mergedWorkload);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Unable to load compare results";
          setError(message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshKey, reloadTick]);

  const recommendation = useMemo(
    () =>
      recommendAlgorithm({
        results,
        optimizeFor,
        workload,
        workloadProcesses,
      }),
    [results, optimizeFor, workload, workloadProcesses],
  );

  const chartData = recommendation.allRows.map((row) => ({
    algorithm: row.algorithm,
    avg_wt: row.avg_wt,
    avg_tat: row.avg_tat,
    avg_rt: row.avg_rt,
    cpu_util: row.cpu_util,
  }));

  return (
    <Card className="neo-panel border-border/50 bg-card/60 border">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Algorithm Compare</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setReloadTick((value) => value + 1)}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        <Tabs value={optimizeFor} onValueChange={(value) => setOptimizeFor(value as OptimizeFor)}>
          <TabsList className="grid w-full grid-cols-3 border border-zinc-800/70 bg-zinc-900/60">
            <TabsTrigger value="throughput">Throughput</TabsTrigger>
            <TabsTrigger value="responsiveness">Responsiveness</TabsTrigger>
            <TabsTrigger value="fairness">Fairness</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3 rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-sky-500/40 bg-sky-500/20 text-sky-200">
              Best: {recommendation.best?.row.algorithm ?? "N/A"}
            </Badge>
            <Badge variant="outline" className="text-zinc-300">
              Optimized for: {modeLabel(optimizeFor)}
            </Badge>
            <Badge variant="outline" className={confidenceClass(recommendation.confidence)}>
              Confidence: {recommendation.confidence}
            </Badge>
            {recommendation.closeCall ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-300">
                Close call
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="text-zinc-300">
              io_ratio {recommendation.workload.io_ratio.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-zinc-300">
              variance {recommendation.workload.burst_variance.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-zinc-300">
              n_procs {recommendation.workload.n_procs}
            </Badge>
            <Badge variant="outline" className="text-zinc-300">
              arrival_spread {recommendation.workload.arrival_spread.toFixed(1)}
            </Badge>
          </div>

          <p className="text-xs text-zinc-500">
            Based on Pareto + robust scoring; confidence: {recommendation.confidence}.
          </p>
          <div className="space-y-1 text-sm text-zinc-300">
            {recommendation.explanation.map((line, index) => (
              <p key={`${optimizeFor}-${index}`}>{line}</p>
            ))}
          </div>
        </div>

        {error ? (
          <p className="text-sm text-amber-300">
            {error}. Showing cached or fallback comparison data.
          </p>
        ) : null}

        <div className="h-[280px] w-full rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="algorithm" stroke="#a1a1aa" />
              <YAxis stroke="#a1a1aa" />
              <RechartsTooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10 }}
              />
              <Bar dataKey="avg_wt" name="Avg WT" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg_tat" name="Avg TAT" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg_rt" name="Avg RT" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cpu_util" name="CPU Util" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Algorithm</TableHead>
              <TableHead>Avg WT</TableHead>
              <TableHead>Avg TAT</TableHead>
              <TableHead>Avg RT</TableHead>
              <TableHead>Makespan</TableHead>
              <TableHead>Throughput</TableHead>
              <TableHead>CPU Util</TableHead>
              <TableHead>P95 WT</TableHead>
              <TableHead>Max WT</TableHead>
              <TableHead>WT Std</TableHead>
              <TableHead>Starvation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recommendation.allRows.map((row) => {
              const dominated = recommendation.dominatedAlgorithms.includes(row.algorithm);
              return (
                <TableRow key={row.algorithm}>
                  <TableCell className="font-medium text-zinc-100">
                    <div className="flex items-center gap-2">
                      <span>{row.algorithm}</span>
                      {dominated ? (
                        <Badge variant="outline" className="border-zinc-700/60 text-zinc-400">
                          Dominated
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-600/40 text-emerald-300">
                          Pareto
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{row.avg_wt.toFixed(2)}</TableCell>
                  <TableCell>{row.avg_tat.toFixed(2)}</TableCell>
                  <TableCell>{row.avg_rt.toFixed(2)}</TableCell>
                  <TableCell>{row.makespan.toFixed(0)}</TableCell>
                  <TableCell>{row.throughput.toFixed(3)}</TableCell>
                  <TableCell>{row.cpu_util.toFixed(1)}%</TableCell>
                  <TableCell>{row.p95_wt.toFixed(2)}</TableCell>
                  <TableCell>{row.max_wt.toFixed(2)}</TableCell>
                  <TableCell>{row.wt_std.toFixed(2)}</TableCell>
                  <TableCell>
                    {row.starvation_flag ? (
                      <Badge variant="outline" className="border-rose-500/40 text-rose-300">
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-700/60 text-zinc-400">
                        No
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
