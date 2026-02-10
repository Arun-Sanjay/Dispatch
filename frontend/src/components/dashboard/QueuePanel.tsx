import type { Algorithm } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type QueuePanelProps = {
  algorithm: Algorithm;
  readyQueue: string[];
  sysQueue?: string[];
  userQueue?: string[];
};

function QueueChips({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className="text-xs text-zinc-500">(empty)</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((pid, idx) => (
        <Badge key={`${pid}-${idx}`} variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-200">
          {pid}
        </Badge>
      ))}
    </div>
  );
}

export function QueuePanel({ algorithm, readyQueue, sysQueue, userQueue }: QueuePanelProps) {
  const isMlq = algorithm === "MLQ";

  return (
    <Card className="neo-panel border-border/50 bg-card/60 border">
      <CardHeader>
        <CardTitle className="text-base">Queues</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isMlq ? (
          <>
            <div className="space-y-2">
              <p className="text-xs tracking-wide text-zinc-400">SYS Queue</p>
              <QueueChips items={sysQueue ?? []} />
            </div>
            <div className="space-y-2">
              <p className="text-xs tracking-wide text-zinc-400">USER Queue</p>
              <QueueChips items={userQueue ?? []} />
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs tracking-wide text-zinc-400">Ready Queue</p>
            <QueueChips items={readyQueue} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
