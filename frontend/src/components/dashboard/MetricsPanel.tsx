import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metrics } from "@/lib/types";

type MetricsPanelProps = {
  metrics: Metrics;
};

const metricDefs: Array<{ key: keyof Metrics; label: string; suffix?: string }> = [
  { key: "avg_wt", label: "Avg WT" },
  { key: "avg_tat", label: "Avg TAT" },
  { key: "avg_rt", label: "Avg RT" },
  { key: "cpu_util", label: "CPU Util", suffix: "%" },
  { key: "makespan", label: "Makespan" },
  { key: "throughput", label: "Throughput" },
];

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <Card className="neo-panel border-border/50 bg-card/60 border">
      <CardHeader>
        <CardTitle className="text-base">Metrics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2">
          {metricDefs.map((item) => {
            const raw = metrics[item.key];
            const value = Number.isInteger(raw) ? raw.toString() : raw.toFixed(2);
            return (
              <div key={item.key} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">
                  {value}
                  {item.suffix ?? ""}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
