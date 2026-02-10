"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type TimelineProps = {
  title: string;
  items: string[];
};

const COLORS = [
  "bg-rose-500/70",
  "bg-sky-500/70",
  "bg-amber-500/70",
  "bg-emerald-500/70",
  "bg-violet-500/70",
  "bg-orange-500/70",
];

function pidColor(pid: string) {
  if (pid === "IDLE") return "bg-zinc-700/70";
  const value = pid.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return COLORS[value % COLORS.length];
}

export function Timeline({ title, items }: TimelineProps) {
  return (
    <div className="neo-panel border-border/50 bg-card/60 rounded-2xl border p-4">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      <div className="mt-3 overflow-x-auto">
        <TooltipProvider>
          <div className="min-w-max space-y-2">
            <div className="flex gap-1">
              {items.map((pid, idx) => (
                <Tooltip key={`${pid}-${idx}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={`h-10 w-9 rounded-md border border-black/30 ${pidColor(pid)} flex items-center justify-center text-[10px] font-semibold text-zinc-100`}
                    >
                      {pid === "IDLE" ? "-" : pid}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>
                      t={idx}: {pid}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="flex gap-1 text-[10px] text-zinc-500">
              {items.map((_, idx) => (
                <div key={idx} className="w-9 text-center">
                  {idx}
                </div>
              ))}
            </div>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
