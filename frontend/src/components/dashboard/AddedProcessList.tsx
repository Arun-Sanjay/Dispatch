"use client";

import { useMemo, useState } from "react";

import { Trash2 } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ProcessInput } from "@/lib/types";

type AddedProcessListProps = {
  processes: ProcessInput[];
  disabled?: boolean;
  onRemoveProcess: (pid: string) => Promise<boolean>;
  onClearProcesses: () => Promise<boolean>;
};

function getBursts(process: ProcessInput): number[] {
  if (process.bursts && process.bursts.length > 0) return process.bursts;
  if (typeof process.burst_time === "number" && process.burst_time > 0) return [process.burst_time];
  return [1];
}

function formatBurstsHuman(bursts: number[]): string {
  return bursts
    .map((value, index) => `${index % 2 === 0 ? "CPU" : "IO"} ${value}`)
    .join(" -> ");
}

function cpuTickTotal(processes: ProcessInput[]): number {
  return processes.reduce((sum, process) => {
    const bursts = getBursts(process);
    const cpuTicks = bursts.reduce((acc, value, index) => (index % 2 === 0 ? acc + value : acc), 0);
    return sum + cpuTicks;
  }, 0);
}

export function AddedProcessList({
  processes,
  disabled = false,
  onRemoveProcess,
  onClearProcesses,
}: AddedProcessListProps) {
  const [confirmPid, setConfirmPid] = useState<string | null>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const totalCpuTicks = useMemo(() => cpuTickTotal(processes), [processes]);

  const runRemove = async () => {
    if (!confirmPid) return;
    setBusy(true);
    try {
      const ok = await onRemoveProcess(confirmPid);
      if (ok) setConfirmPid(null);
    } finally {
      setBusy(false);
    }
  };

  const runClear = async () => {
    setBusy(true);
    try {
      const ok = await onClearProcesses();
      if (ok) setConfirmClearOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium text-zinc-200">Added Processes</p>
          <p className="text-xs text-zinc-400">
            Count: {processes.length} | Total CPU ticks: {totalCpuTicks}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={() => setConfirmClearOpen(true)}
          disabled={disabled || busy || processes.length === 0}
        >
          Clear Added
        </Button>
      </div>

      {processes.length === 0 ? (
        <p className="text-sm text-zinc-400">No user-added processes in this session.</p>
      ) : (
        <ScrollArea className="max-h-56 rounded-md border border-zinc-800/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PID</TableHead>
                <TableHead>AT</TableHead>
                <TableHead>PR</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead>Bursts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processes.map((process) => {
                const bursts = getBursts(process);
                return (
                  <TableRow key={process.pid}>
                    <TableCell className="font-medium text-zinc-100">{process.pid}</TableCell>
                    <TableCell>{process.arrival_time}</TableCell>
                    <TableCell>{process.priority ?? 1}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-zinc-300">
                        {process.queue ?? "USER"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[360px] whitespace-normal text-xs text-zinc-300">
                      <p>{formatBurstsHuman(bursts)}</p>
                      <p className="mt-1 text-zinc-500">[{bursts.join(", ")}]</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-red-300 hover:text-red-200"
                        onClick={() => setConfirmPid(process.pid)}
                        disabled={disabled || busy}
                      >
                        <Trash2 className="size-4" />
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      <AlertDialog open={Boolean(confirmPid)} onOpenChange={(open) => (!open ? setConfirmPid(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove added process?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmPid ?? "the process"} from the current session and resets simulation time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={runRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all added processes?</AlertDialogTitle>
            <AlertDialogDescription>
              This keeps default/demo processes and removes all user-added ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={runClear}>
              Clear Added
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
