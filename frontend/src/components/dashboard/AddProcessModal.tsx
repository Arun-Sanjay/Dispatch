"use client";

import { useEffect, useMemo, useState } from "react";

import { AddedProcessList } from "@/components/dashboard/AddedProcessList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProcessInput, QueueType } from "@/lib/types";

type BurstKind = "CPU" | "IO";

type AddProcessModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitProcess: (process: ProcessInput) => Promise<boolean>;
  addedProcesses: ProcessInput[];
  onRemoveAddedProcess: (pid: string) => Promise<boolean>;
  onClearAddedProcesses: () => Promise<boolean>;
  existingPids?: string[];
  disabled?: boolean;
};

const DEFAULT_BURSTS = [4];

function kindForIndex(index: number): BurstKind {
  return index % 2 === 0 ? "CPU" : "IO";
}

export function AddProcessModal({
  open,
  onOpenChange,
  onSubmitProcess,
  addedProcesses,
  onRemoveAddedProcess,
  onClearAddedProcesses,
  existingPids = [],
  disabled = false,
}: AddProcessModalProps) {
  const [pid, setPid] = useState("");
  const [arrivalTime, setArrivalTime] = useState(0);
  const [priority, setPriority] = useState(1);
  const [queue, setQueue] = useState<QueueType>("USER");
  const [bursts, setBursts] = useState<number[]>(DEFAULT_BURSTS);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const normalizedPid = pid.trim();
  const duplicatePid = useMemo(
    () => existingPids.some((value) => value.trim().toUpperCase() === normalizedPid.toUpperCase()),
    [existingPids, normalizedPid],
  );

  const nextKind: BurstKind = bursts.length % 2 === 1 ? "IO" : "CPU";
  const validBursts = bursts.length > 0 && bursts.length % 2 === 1 && bursts.every((value) => Number.isInteger(value) && value > 0);

  const reset = () => {
    setPid("");
    setArrivalTime(0);
    setPriority(1);
    setQueue("USER");
    setBursts(DEFAULT_BURSTS);
    setFormError(null);
  };

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      reset();
    }
  };

  const updateBurst = (index: number, value: number) => {
    setBursts((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const removeBurst = (index: number) => {
    setBursts((prev) => {
      if (prev.length <= 1) return prev;
      const copy = prev.filter((_, i) => i !== index);
      return copy.length ? copy : DEFAULT_BURSTS;
    });
  };

  const addBurst = (kind: BurstKind) => {
    if (kind !== nextKind) return;
    setBursts((prev) => [...prev, kind === "CPU" ? 2 : 1]);
  };

  const canSubmit =
    !disabled &&
    !submitting &&
    normalizedPid.length > 0 &&
    !duplicatePid &&
    Number.isInteger(arrivalTime) &&
    arrivalTime >= 0 &&
    Number.isInteger(priority) &&
    priority >= 0 &&
    validBursts;

  useEffect(() => {
    if (!open) {
      document.body.style.pointerEvents = "";
    }
  }, [open]);

  const submit = async () => {
    setFormError(null);

    if (!normalizedPid) {
      setFormError("PID is required.");
      return;
    }
    if (duplicatePid) {
      setFormError("PID already exists in current simulation.");
      return;
    }
    if (!Number.isInteger(arrivalTime) || arrivalTime < 0) {
      setFormError("Arrival time must be a non-negative integer.");
      return;
    }
    if (!Number.isInteger(priority) || priority < 0) {
      setFormError("Priority must be a non-negative integer.");
      return;
    }
    if (!validBursts) {
      setFormError("Bursts must be positive integers and end with CPU burst.");
      return;
    }

    const payload: ProcessInput = {
      pid: normalizedPid,
      arrival_time: arrivalTime,
      priority,
      queue,
      bursts,
    };

    setSubmitting(true);
    try {
      const ok = await onSubmitProcess(payload);
      if (ok) {
        close(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add Process</DialogTitle>
          <DialogDescription>
            Build CPU/I/O bursts explicitly. Sequence must alternate and end with CPU.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-zinc-400">PID</p>
              <Input
                value={pid}
                placeholder="e.g. P6"
                onChange={(event) => setPid(event.target.value)}
                disabled={disabled || submitting}
              />
              {duplicatePid ? <p className="mt-1 text-xs text-amber-300">PID already exists.</p> : null}
            </div>
            <div>
              <p className="mb-1 text-xs text-zinc-400">Arrival Time (AT)</p>
              <Input
                type="number"
                value={arrivalTime}
                min={0}
                onChange={(event) => setArrivalTime(Number.parseInt(event.target.value || "0", 10) || 0)}
                disabled={disabled || submitting}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs text-zinc-400">Priority (PR)</p>
              <Input
                type="number"
                value={priority}
                min={0}
                onChange={(event) => setPriority(Number.parseInt(event.target.value || "1", 10) || 1)}
                disabled={disabled || submitting}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-zinc-400">Queue Type</p>
              <Select
                value={queue}
                onValueChange={(value) => setQueue(value as QueueType)}
                disabled={disabled || submitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="SYS">SYS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-200">Burst Builder</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addBurst("IO")}
                  disabled={disabled || submitting || nextKind !== "IO"}
                >
                  + Add I/O
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => addBurst("CPU")}
                  disabled={disabled || submitting || nextKind !== "CPU"}
                >
                  + Add CPU
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {bursts.map((value, index) => {
                const kind = kindForIndex(index);
                return (
                  <div key={`${kind}-${index}`} className="grid grid-cols-[130px_1fr_auto] items-center gap-2">
                    <p className="text-xs font-medium text-zinc-300">{kind} Burst</p>
                    <Input
                      type="number"
                      min={1}
                      value={value}
                      onChange={(event) => updateBurst(index, Number.parseInt(event.target.value || "1", 10) || 1)}
                      disabled={disabled || submitting}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => removeBurst(index)}
                      disabled={disabled || submitting || bursts.length <= 1}
                    >
                      Remove
                    </Button>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-xs text-zinc-400">Bursts: [{bursts.join(", ")}]</p>
            {bursts.length % 2 === 0 ? (
              <p className="mt-1 text-xs text-amber-300">Last burst must be CPU before submit.</p>
            ) : null}
          </div>

          {formError ? <p className="text-sm text-red-400">{formError}</p> : null}

          <AddedProcessList
            processes={addedProcesses}
            onRemoveProcess={onRemoveAddedProcess}
            onClearProcesses={onClearAddedProcesses}
            disabled={disabled || submitting}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {submitting ? "Adding..." : "Add Process"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
