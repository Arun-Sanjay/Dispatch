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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MemoryMode, ProcessInput, QueueType } from "@/lib/types";

type BurstKind = "CPU" | "IO";

type AddProcessModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitProcess: (process: ProcessInput) => Promise<boolean>;
  addedProcesses: ProcessInput[];
  allProcesses?: ProcessInput[];
  systemMode: MemoryMode;
  pageSizeBytes: number;
  onModeChange?: (mode: MemoryMode) => void;
  onRemoveAddedProcess: (pid: string) => Promise<boolean>;
  onClearAddedProcesses: () => Promise<boolean>;
  onResetProcesses: () => Promise<boolean>;
  existingPids?: string[];
  disabled?: boolean;
};

const DEFAULT_BURSTS = [4];

function kindForIndex(index: number): BurstKind {
  return index % 2 === 0 ? "CPU" : "IO";
}

function parseNumberish(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(input: string): number[] {
  return input
    .split(/[,\s]+/)
    .map((part) => parseNumberish(part))
    .filter((value): value is number => value !== null)
    .map((value) => Math.max(0, Math.trunc(value)));
}

function LabelWithTooltip({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="mb-1 flex items-center gap-1">
      <p className="text-xs text-zinc-400">{label}</p>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-[10px] text-zinc-500 hover:text-zinc-300" tabIndex={-1}>
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[240px] text-xs">
            {tip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

export function AddProcessModal({
  open,
  onOpenChange,
  onSubmitProcess,
  addedProcesses,
  allProcesses = [],
  systemMode,
  pageSizeBytes,
  onModeChange,
  onRemoveAddedProcess,
  onClearAddedProcesses,
  onResetProcesses,
  existingPids = [],
  disabled = false,
}: AddProcessModalProps) {
  const [pid, setPid] = useState("");
  const [arrivalTime, setArrivalTime] = useState(0);
  const [priority, setPriority] = useState(1);
  const [queue, setQueue] = useState<QueueType>("USER");
  const [bursts, setBursts] = useState<number[]>(DEFAULT_BURSTS);
  const [workingSetSize, setWorkingSetSize] = useState(8);
  const [workingSetPagesInput, setWorkingSetPagesInput] = useState("");
  const [vmSizeKb, setVmSizeKb] = useState(256);
  const [addressBaseInput, setAddressBaseInput] = useState("0x100000");
  const [addrPattern, setAddrPattern] = useState<"SEQ" | "LOOP" | "RAND" | "CUSTOM">("LOOP");
  const [refsPerCpuTick, setRefsPerCpuTick] = useState(1);
  const [customAddrsInput, setCustomAddrsInput] = useState("");
  const [faultPenaltyTicks, setFaultPenaltyTicks] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const normalizedPid = pid.trim();
  const duplicatePid = useMemo(
    () => existingPids.some((value) => value.trim().toUpperCase() === normalizedPid.toUpperCase()),
    [existingPids, normalizedPid],
  );

  const nextKind: BurstKind = bursts.length % 2 === 1 ? "IO" : "CPU";
  const validBursts = bursts.length > 0 && bursts.length % 2 === 1 && bursts.every((value) => Number.isInteger(value) && value > 0);
  const isFullSystem = systemMode === "FULL";
  const safePageSize = Math.max(1, pageSizeBytes || 4096);
  const vmSizeBytes = Math.max(1, vmSizeKb) * 1024;
  const totalPages = Math.max(1, Math.floor(vmSizeBytes / safePageSize));

  const reset = () => {
    setPid("");
    setArrivalTime(0);
    setPriority(1);
    setQueue("USER");
    setBursts(DEFAULT_BURSTS);
    setWorkingSetSize(8);
    setWorkingSetPagesInput("");
    setVmSizeKb(256);
    setAddressBaseInput("0x100000");
    setAddrPattern("LOOP");
    setRefsPerCpuTick(1);
    setCustomAddrsInput("");
    setFaultPenaltyTicks(2);
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
    (!isFullSystem || (
      Number.isInteger(workingSetSize) &&
      workingSetSize >= 1 &&
      Number.isInteger(refsPerCpuTick) &&
      refsPerCpuTick >= 1 &&
      refsPerCpuTick <= 3 &&
      Number.isInteger(faultPenaltyTicks) &&
      faultPenaltyTicks >= 1 &&
      Number.isInteger(vmSizeKb) &&
      vmSizeKb > 0
    )) &&
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
    let parsedPages: number[] = [];
    let parsedCustomAddrs: number[] = [];
    let parsedAddressBase = 0;
    let computedVmBytes = 0;
    if (isFullSystem) {
      if (!Number.isInteger(workingSetSize) || workingSetSize <= 0) {
        setFormError("Working set size must be a positive integer.");
        return;
      }
      if (!Number.isInteger(refsPerCpuTick) || refsPerCpuTick < 1 || refsPerCpuTick > 3) {
        setFormError("Memory reference rate must be between 1 and 3 per CPU tick.");
        return;
      }
      if (!Number.isInteger(faultPenaltyTicks) || faultPenaltyTicks <= 0) {
        setFormError("Fault penalty ticks must be a positive integer.");
        return;
      }

      computedVmBytes = Math.max(1, vmSizeKb) * 1024;
      if (computedVmBytes <= safePageSize) {
        setFormError(`Virtual memory size must be greater than page size (${safePageSize} bytes).`);
        return;
      }

      const parsedBaseMaybe = parseNumberish(addressBaseInput);
      if (parsedBaseMaybe === null || parsedBaseMaybe < 0) {
        setFormError("Address base must be a valid decimal or hex value.");
        return;
      }
      parsedAddressBase = parsedBaseMaybe;

      const maxPages = Math.max(1, Math.floor(computedVmBytes / safePageSize));
      if (workingSetSize > maxPages) {
        setFormError(`Working set size cannot exceed total pages (${maxPages}).`);
        return;
      }

      parsedPages = parseList(workingSetPagesInput);
      if (parsedPages.some((vpn) => vpn < 0 || vpn >= maxPages)) {
        setFormError(`Working set VPN list must be within 0..${maxPages - 1}.`);
        return;
      }

      if (addrPattern === "CUSTOM") {
        parsedCustomAddrs = parseList(customAddrsInput);
        if (parsedCustomAddrs.length === 0) {
          setFormError("Custom address pattern requires at least one address.");
          return;
        }
        const lower = parsedAddressBase;
        const upper = parsedAddressBase + computedVmBytes;
        if (parsedCustomAddrs.some((addr) => addr < lower || addr >= upper)) {
          setFormError(`Custom addresses must be within [${lower}, ${upper}).`);
          return;
        }
      }
    }

    const payload: ProcessInput = {
      pid: normalizedPid,
      arrival_time: arrivalTime,
      priority,
      queue,
      bursts,
      burst_segments: bursts.map((len, index) => ({ type: kindForIndex(index), len })),
      ...(isFullSystem
        ? {
            vm_size_bytes: computedVmBytes,
            address_base: parsedAddressBase,
            working_set_size: workingSetSize,
            ...(parsedPages.length > 0 ? { working_set_pages: Array.from(new Set(parsedPages)) } : {}),
            refs_per_cpu_tick: refsPerCpuTick,
            fault_penalty_ticks: faultPenaltyTicks,
            addr_pattern: addrPattern,
            ...(addrPattern === "CUSTOM" && parsedCustomAddrs.length > 0
              ? { custom_addrs: parsedCustomAddrs }
              : {}),
          }
        : {}),
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
          <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-200">Mode</p>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/55 p-1">
              <Button
                type="button"
                size="sm"
                variant={!isFullSystem ? "default" : "ghost"}
                className={!isFullSystem ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300"}
                onClick={() => onModeChange?.("CPU_ONLY")}
                disabled={disabled || submitting || !onModeChange}
              >
                CPU_ONLY
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isFullSystem ? "default" : "ghost"}
                className={isFullSystem ? "rounded-full bg-white text-black hover:bg-zinc-200" : "rounded-full text-zinc-300"}
                onClick={() => onModeChange?.("FULL")}
                disabled={disabled || submitting || !onModeChange}
              >
                FULL_SYSTEM
              </Button>
            </div>
          </div>

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

          {isFullSystem ? (
            <div className="rounded-xl border border-zinc-800/70 bg-zinc-900/35 p-3">
              <p className="mb-3 text-sm font-medium text-zinc-200">Memory</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <LabelWithTooltip
                    label="Virtual Memory Size (KB)"
                    tip="Per-process virtual address space size. Must exceed page size."
                  />
                  <Input
                    type="number"
                    min={4}
                    value={vmSizeKb}
                    onChange={(event) => setVmSizeKb(Number.parseInt(event.target.value || "256", 10) || 256)}
                    disabled={disabled || submitting}
                  />
                </div>
                <div>
                  <LabelWithTooltip
                    label="Address Base"
                    tip="Starting virtual address. Decimal or hex (e.g. 0x100000)."
                  />
                  <Input
                    value={addressBaseInput}
                    placeholder="0x100000"
                    onChange={(event) => setAddressBaseInput(event.target.value)}
                    disabled={disabled || submitting}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <LabelWithTooltip
                    label="Working Set Pages (count)"
                    tip="If list is empty, VPNs are generated deterministically with this count."
                  />
                  <Input
                    type="number"
                    min={1}
                    value={workingSetSize}
                    onChange={(event) => setWorkingSetSize(Number.parseInt(event.target.value || "8", 10) || 8)}
                    disabled={disabled || submitting}
                  />
                </div>
                <div>
                  <LabelWithTooltip
                    label="Working Set VPN List (optional)"
                    tip="Explicit VPN list, comma or space separated (e.g. 0,1,7,9)."
                  />
                  <Input
                    value={workingSetPagesInput}
                    placeholder="0, 1, 7, 9"
                    onChange={(event) => setWorkingSetPagesInput(event.target.value)}
                    disabled={disabled || submitting}
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <LabelWithTooltip
                    label="Address Pattern"
                    tip="SEQ/LOOP/RAND choose deterministic reference pattern. CUSTOM uses custom addresses."
                  />
                  <Select
                    value={addrPattern}
                    onValueChange={(value) => setAddrPattern(value as "SEQ" | "LOOP" | "RAND" | "CUSTOM")}
                    disabled={disabled || submitting}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEQ">SEQ</SelectItem>
                      <SelectItem value="LOOP">LOOP</SelectItem>
                      <SelectItem value="RAND">RAND</SelectItem>
                      <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <LabelWithTooltip
                    label="Refs per CPU Tick (1-3)"
                    tip="How many memory accesses each running CPU tick performs."
                  />
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={refsPerCpuTick}
                    onChange={(event) => setRefsPerCpuTick(Number.parseInt(event.target.value || "1", 10) || 1)}
                    disabled={disabled || submitting}
                  />
                </div>
              </div>

              {addrPattern === "CUSTOM" ? (
                <div className="mt-3">
                  <LabelWithTooltip
                    label="Custom Addresses"
                    tip="Comma or space separated virtual addresses within [base, base + vm_size). Hex allowed."
                  />
                  <Input
                    value={customAddrsInput}
                    placeholder="0x100000, 0x100104, 1049600"
                    onChange={(event) => setCustomAddrsInput(event.target.value)}
                    disabled={disabled || submitting}
                  />
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <LabelWithTooltip
                    label="Fault Penalty Ticks"
                    tip="Global WAITING_MEM delay applied after page faults."
                  />
                  <Input
                    type="number"
                    min={1}
                    value={faultPenaltyTicks}
                    onChange={(event) => setFaultPenaltyTicks(Number.parseInt(event.target.value || "5", 10) || 5)}
                    disabled={disabled || submitting}
                  />
                </div>
                <div className="rounded-md border border-zinc-800/70 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
                  <p>Page size: {safePageSize} bytes</p>
                  <p>Total pages: {totalPages}</p>
                </div>
              </div>
            </div>
          ) : null}

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
                const ordinal = Math.floor(index / 2) + 1;
                return (
                  <div key={`${kind}-${index}`} className="grid grid-cols-[130px_1fr_auto] items-center gap-2">
                    <p className="text-xs font-medium text-zinc-300">{kind}{ordinal}</p>
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
            allProcesses={allProcesses}
            onRemoveProcess={onRemoveAddedProcess}
            onClearProcesses={onClearAddedProcesses}
            onResetProcesses={onResetProcesses}
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
