import { FadeIn } from "@/components/motion/FadeIn";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sections = [
  {
    title: "Data Structures",
    items: ["Queue dynamics across FCFS/RR", "Priority Queue scheduling behavior", "MLQ split and transition logs"],
  },
  {
    title: "OS Concepts",
    items: ["Process states and transitions", "CPU/I/O burst alternation", "WT/TAT/RT and utilization metrics"],
  },
];

export default function LearnPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <FadeIn>
        <section className="rounded-3xl border border-white/10 bg-zinc-950/50 p-8 md:p-10">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">Learn</h1>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Build intuition for scheduling with focused modules spanning DSA structures and operating systems behavior.
          </p>
        </section>
      </FadeIn>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section, index) => (
          <FadeIn key={section.title} delay={index * 0.12}>
            <Card className="h-full rounded-2xl border border-white/10 bg-zinc-950/50">
              <CardHeader>
                <CardTitle className="text-2xl text-zinc-100">{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-400">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Button variant="outline" className="border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10">
                  Open Simulation Preset
                </Button>
              </CardContent>
            </Card>
          </FadeIn>
        ))}
      </div>
    </main>
  );
}
