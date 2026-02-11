"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mockState } from "@/lib/mock";
import type { PageTableEntry, SimulatorState } from "@/lib/types";
import { useSimSocket } from "@/lib/ws";

const WS_URL = "ws://127.0.0.1:8000/ws/state";
const PAGE_SIZE = 24;

function memoryMode(state: SimulatorState): "CPU_ONLY" | "FULL" {
  return (state.memory.enabled ?? state.memory.mode ?? "CPU_ONLY") as "CPU_ONLY" | "FULL";
}

function frameCount(state: SimulatorState): number {
  if (typeof state.memory.num_frames === "number" && state.memory.num_frames > 0) return state.memory.num_frames;
  if (typeof state.memory.frames_count === "number" && state.memory.frames_count > 0) return state.memory.frames_count;
  if (Array.isArray(state.memory.frames)) return state.memory.frames.length;
  return 0;
}

function parseLatestTranslation(line: string | undefined): {
  pid: string | null;
  vpn: number | null;
  pfn: number | null;
  isFault: boolean;
} {
  if (!line) return { pid: null, vpn: null, pfn: null, isFault: false };
  const pidMatch = line.match(/:\s*([A-Za-z0-9_]+)\s+VA=/);
  const vpnMatch = line.match(/VPN=(\d+)/);
  const pfnMatch = line.match(/PFN=(\d+)/);
  return {
    pid: pidMatch?.[1] ?? null,
    vpn: vpnMatch?.[1] ? Number.parseInt(vpnMatch[1], 10) : null,
    pfn: pfnMatch?.[1] ? Number.parseInt(pfnMatch[1], 10) : null,
    isFault: /FAULT/i.test(line),
  };
}

export default function MemoryPage() {
  const { state, status, connect, disconnect } = useSimSocket(WS_URL);
  const viewState = state ?? mockState;
  const mode = memoryMode(viewState);
  const frames = viewState.memory.frames ?? [];
  const totalFrames = frameCount(viewState);
  const translationLog = viewState.memory.last_translation_log ?? [];
  const latestLine = translationLog.length > 0 ? translationLog[translationLog.length - 1] : undefined;
  const latest = parseLatestTranslation(latestLine);

  const processIds = useMemo(() => {
    const fromTables = Object.keys(viewState.memory.page_tables ?? {});
    const fromProcesses = viewState.processes.map((process) => process.pid);
    return Array.from(new Set([...fromTables, ...fromProcesses])).sort();
  }, [viewState.memory.page_tables, viewState.processes]);

  const [selectedPid, setSelectedPid] = useState<string>("");
  const [vpnQuery, setVpnQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (processIds.length === 0) {
      setSelectedPid("");
      return;
    }
    if (!selectedPid || !processIds.includes(selectedPid)) {
      setSelectedPid(processIds[0]);
    }
  }, [processIds, selectedPid]);

  useEffect(() => {
    setPage(1);
  }, [selectedPid, vpnQuery]);

  const rowsForPid = useMemo<PageTableEntry[]>(
    () => (selectedPid ? viewState.memory.page_tables?.[selectedPid] ?? [] : []),
    [selectedPid, viewState.memory.page_tables],
  );

  const filteredRows = useMemo(() => {
    const query = vpnQuery.trim();
    if (!query) return rowsForPid;
    return rowsForPid.filter((row) => String(row.vpn).includes(query));
  }, [rowsForPid, vpnQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Memory</h1>
        <p className="text-sm text-zinc-400">Live RAM, page table, and translation observability from backend state.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-zinc-800/70 bg-zinc-950/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mode</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-zinc-200">
              {mode === "FULL" ? "FULL SYSTEM" : "CPU ONLY"}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-zinc-800/70 bg-zinc-950/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Algorithm</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-zinc-100">{viewState.memory.algo}</CardContent>
        </Card>
        <Card className="border-zinc-800/70 bg-zinc-950/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Faults / Hits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-rose-300">Faults: {viewState.memory.faults}</p>
            <p className="text-emerald-300">Hits: {viewState.memory.hits}</p>
          </CardContent>
        </Card>
        <Card className="border-zinc-800/70 bg-zinc-950/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hit Ratio</CardTitle>
          </CardHeader>
          <CardContent className="font-semibold text-zinc-100">
            {(viewState.memory.hit_ratio * 100).toFixed(1)}%
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800/70 bg-zinc-950/60">
        <CardHeader>
          <CardTitle>RAM View</CardTitle>
          <CardDescription>Global frames and latest translation footprint.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalFrames === 0 ? (
            <p className="text-sm text-zinc-400">No frame data available.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: totalFrames }, (_, index) => frames[index] ?? { pfn: index, pid: null, vpn: null }).map((frame) => {
                const isTouched = latest.pfn !== null && frame.pfn === latest.pfn;
                const faultGlow = isTouched && latest.isFault;
                const hitGlow = isTouched && !latest.isFault;
                return (
                  <div
                    key={`frame-${frame.pfn}`}
                    className={[
                      "rounded-xl border p-3 transition-all",
                      "border-white/10 bg-zinc-900/60",
                      hitGlow ? "border-emerald-400/50 shadow-[0_0_24px_rgba(16,185,129,0.25)]" : "",
                      faultGlow ? "border-rose-400/60 shadow-[0_0_24px_rgba(244,63,94,0.28)]" : "",
                    ].join(" ")}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs text-zinc-400">PFN {frame.pfn}</p>
                      {isTouched ? (
                        <Badge variant="outline" className={faultGlow ? "border-rose-400/50 text-rose-300" : "border-emerald-400/50 text-emerald-300"}>
                          {faultGlow ? "FAULT" : "HIT"}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-sm text-zinc-200">
                      {frame.pid ? `${frame.pid} / VPN ${frame.vpn ?? "-"}` : "FREE"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] text-zinc-300">
                        last_used {frame.last_used ?? 0}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] text-zinc-300">
                        freq {frame.freq ?? 0}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-zinc-800/70 bg-zinc-950/60">
        <CardHeader>
          <CardTitle>Page Table View</CardTitle>
          <CardDescription>Per-process VPN to PFN mappings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
            <Select value={selectedPid} onValueChange={setSelectedPid} disabled={processIds.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Select PID" />
              </SelectTrigger>
              <SelectContent>
                {processIds.map((pid) => (
                  <SelectItem key={pid} value={pid}>
                    {pid}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={vpnQuery}
              placeholder="Search VPN (e.g. 12)"
              onChange={(event) => setVpnQuery(event.target.value)}
            />
            <div className="text-xs text-zinc-400">Rows: {filteredRows.length}</div>
          </div>

          <ScrollArea className="max-h-[340px] rounded-lg border border-zinc-800/70">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VPN</TableHead>
                  <TableHead>Present</TableHead>
                  <TableHead>PFN</TableHead>
                  <TableHead>LastUsed</TableHead>
                  <TableHead>Freq</TableHead>
                  <TableHead>Dirty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500">
                      No rows for selected PID.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedRows.map((row) => {
                    const isActive = selectedPid === latest.pid && latest.vpn !== null && row.vpn === latest.vpn;
                    return (
                      <TableRow key={`${selectedPid}-${row.vpn}`} className={isActive ? "bg-sky-500/10" : ""}>
                        <TableCell className="font-mono">{row.vpn}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={row.present ? "border-emerald-400/40 text-emerald-300" : "border-zinc-700 text-zinc-400"}>
                            {row.present ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell>{row.pfn ?? "-"}</TableCell>
                        <TableCell>{row.last_used ?? 0}</TableCell>
                        <TableCell>{row.freq ?? 0}</TableCell>
                        <TableCell>{row.dirty ? "1" : "0"}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
              Prev
            </Button>
            <span className="text-xs text-zinc-400">
              Page {safePage} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-zinc-800/70 bg-zinc-950/60">
        <CardHeader>
          <CardTitle>Translation Log</CardTitle>
          <CardDescription>Last 30 VA to VPN to PFN translations from backend.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[280px] rounded-lg border border-zinc-800/70 p-3">
            {translationLog.length === 0 ? (
              <p className="text-sm text-zinc-500">No translation entries yet.</p>
            ) : (
              <div className="space-y-2">
                {translationLog.map((line, index) => {
                  const isFault = /FAULT/i.test(line);
                  const hasEvict = /evict=/i.test(line);
                  return (
                    <div
                      key={`${index}-${line}`}
                      className={[
                        "rounded-md border px-3 py-2 text-xs font-mono",
                        isFault ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={isFault ? "border-rose-400/50 text-rose-200" : "border-emerald-400/50 text-emerald-200"}>
                          {isFault ? "FAULT" : "HIT"}
                        </Badge>
                        {hasEvict ? <Badge variant="outline" className="border-amber-400/50 text-amber-200">EVICT</Badge> : null}
                      </div>
                      <p>{line}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-500">
        Connection: {status}
      </p>
    </div>
  );
}
