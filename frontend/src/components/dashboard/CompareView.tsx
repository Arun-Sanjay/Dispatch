"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const compareData = [
  { algorithm: "FCFS", wt: 7.2, tat: 14.1, rt: 3.9, util: 81.3 },
  { algorithm: "SJF", wt: 5.1, tat: 12.0, rt: 2.8, util: 86.0 },
  { algorithm: "PRIORITY", wt: 6.0, tat: 12.7, rt: 3.2, util: 84.4 },
  { algorithm: "RR", wt: 6.4, tat: 13.8, rt: 3.2, util: 84.0 },
  { algorithm: "MLQ", wt: 5.7, tat: 12.3, rt: 2.9, util: 88.1 },
];

export function CompareView() {
  return (
    <Card className="neo-panel border-border/50 bg-card/60 border">
      <CardHeader>
        <CardTitle className="text-base">Algorithm Compare (Mock)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[280px] w-full rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="algorithm" stroke="#a1a1aa" />
              <YAxis stroke="#a1a1aa" />
              <RechartsTooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10 }}
              />
              <Bar dataKey="wt" name="Avg WT" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tat" name="Avg TAT" fill="#a78bfa" radius={[4, 4, 0, 0]} />
              <Bar dataKey="rt" name="Avg RT" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="util" name="CPU Util" fill="#34d399" radius={[4, 4, 0, 0]} />
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
              <TableHead>CPU Util</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {compareData.map((row) => (
              <TableRow key={row.algorithm}>
                <TableCell>{row.algorithm}</TableCell>
                <TableCell>{row.wt.toFixed(2)}</TableCell>
                <TableCell>{row.tat.toFixed(2)}</TableCell>
                <TableCell>{row.rt.toFixed(2)}</TableCell>
                <TableCell>{row.util.toFixed(1)}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
