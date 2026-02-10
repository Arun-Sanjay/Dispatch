import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    title: "Live Timeline",
    description: "Track CPU and I/O activity tick-by-tick with crisp Gantt timelines and queue snapshots.",
  },
  {
    title: "Algorithm Comparison",
    description: "Review scheduling metrics side-by-side with charts for turnaround, wait, response, and utilization.",
  },
  {
    title: "DSA + OS Learning Mode",
    description: "Connect queue behavior, priorities, and burst patterns to core operating systems concepts.",
  },
];

export function FeatureCards() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {features.map((feature) => (
        <Card
          key={feature.title}
          className="rounded-2xl border border-white/10 bg-zinc-950/50 shadow-[0_0_0_1px_rgba(255,255,255,0.02)_inset,0_16px_40px_rgba(0,0,0,0.45)]"
        >
          <CardHeader>
            <CardTitle className="text-xl text-zinc-100">{feature.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-zinc-400">{feature.description}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
