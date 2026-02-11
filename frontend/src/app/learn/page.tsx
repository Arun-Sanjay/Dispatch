"use client";

import { useMemo, useState } from "react";

import {
  fenwickUpdateSnippet,
  ganttRleSnippet,
  segmentTreeQuerySnippet,
} from "../../../content/snippets/analytics_ts";
import {
  heapSelectionSnippet,
  pagingLruSnippet,
  rrRotationSnippet,
  schedulerTickSnippet,
} from "../../../content/snippets/scheduler_py";
import { wsStatePushSnippet } from "../../../content/snippets/ws_py";
import { FadeIn } from "@/components/motion/FadeIn";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type SnippetLanguage = "python" | "typescript";

type SnippetDoc = {
  id: string;
  label: string;
  language: SnippetLanguage;
  filePath: string;
  dsFocus: string;
  code: string;
};

type DSCard = {
  id: string;
  title: string;
  tags: string[];
  stores: string;
  why: string;
  operations: Array<{ op: string; complexity: string }>;
  paths: string[];
  snippetId: string;
};

const SECTION_LINKS = [
  { id: "overview", label: "Overview" },
  { id: "data-structures", label: "Data Structures" },
  { id: "mapping", label: "DS -> Algorithms mapping" },
  { id: "walkthrough", label: "Code Walkthrough (Snippets)" },
  { id: "complexity", label: "Complexity Table" },
] as const;

const SNIPPETS: SnippetDoc[] = [
  {
    id: "scheduler_tick",
    label: "Scheduler tick (deterministic loop)",
    language: "python",
    filePath: "backend/app/engine/scheduler.py",
    dsFocus: "Array/List + Queue + State transitions",
    code: schedulerTickSnippet,
  },
  {
    id: "rr_rotation",
    label: "RR rotation (deque discipline)",
    language: "python",
    filePath: "backend/app/engine/scheduler.py",
    dsFocus: "Deque",
    code: rrRotationSnippet,
  },
  {
    id: "heap_selection",
    label: "Priority pick (heap)",
    language: "python",
    filePath: "backend/app/engine/scheduler.py",
    dsFocus: "Priority Queue / Heap",
    code: heapSelectionSnippet,
  },
  {
    id: "ws_push",
    label: "WebSocket state push",
    language: "python",
    filePath: "backend/app/api/ws.py",
    dsFocus: "HashMap payload + event stream",
    code: wsStatePushSnippet,
  },
  {
    id: "segment_query",
    label: "Segment tree range query",
    language: "typescript",
    filePath: "frontend/src/lib/dsa/segStreak.ts",
    dsFocus: "Segment Tree",
    code: segmentTreeQuerySnippet,
  },
  {
    id: "fenwick_update",
    label: "Fenwick update and prefix sums",
    language: "typescript",
    filePath: "frontend/src/lib/dsa/fenwick.ts",
    dsFocus: "Fenwick / BIT",
    code: fenwickUpdateSnippet,
  },
  {
    id: "paging_lru",
    label: "Paging + LRU frame replacement",
    language: "python",
    filePath: "backend/app/memory_sim.py",
    dsFocus: "HashMap + DLL (LRU)",
    code: pagingLruSnippet,
  },
  {
    id: "gantt_rle",
    label: "Gantt run-length compression",
    language: "typescript",
    filePath: "frontend/src/lib/timeline/buildSegments.ts",
    dsFocus: "Run-length encoded segments",
    code: ganttRleSnippet,
  },
];

const DS_CARDS: DSCard[] = [
  {
    id: "array-list",
    title: "Array/List",
    tags: ["core", "timeline", "storage"],
    stores: "Tick-wise gantt/io_gantt/mem_gantt tokens, per-process rows, and event logs.",
    why: "Arrays give deterministic order, fast append, and direct index access for replay and range windows.",
    operations: [
      { op: "append tick", complexity: "O(1) amortized" },
      { op: "index read by t", complexity: "O(1)" },
      { op: "slice window [l..r]", complexity: "O(k)" },
    ],
    paths: ["backend/app/session.py", "frontend/src/lib/replay.ts", "frontend/src/lib/types.ts"],
    snippetId: "scheduler_tick",
  },
  {
    id: "queue-fifo",
    title: "Queue (FIFO)",
    tags: ["ready", "fcfs", "fair order"],
    stores: "READY processes in arrival order for FCFS and fallback queue behavior.",
    why: "FIFO makes dispatch predictable and mirrors first-come scheduling semantics.",
    operations: [
      { op: "enqueue READY", complexity: "O(1)" },
      { op: "dequeue next", complexity: "O(1)" },
      { op: "peek head", complexity: "O(1)" },
    ],
    paths: ["backend/app/engine/scheduler.py", "backend/app/session.py"],
    snippetId: "scheduler_tick",
  },
  {
    id: "deque-rr",
    title: "Deque (RR)",
    tags: ["round robin", "rotation", "quantum"],
    stores: "RR ready queue where front process runs and timeslice-expired process rotates to the back.",
    why: "Deque supports O(1) pop-left + append-right for smooth RR rotation.",
    operations: [
      { op: "pop front", complexity: "O(1)" },
      { op: "append back", complexity: "O(1)" },
      { op: "rotate by quantum", complexity: "O(1)" },
    ],
    paths: ["backend/app/engine/scheduler.py"],
    snippetId: "rr_rotation",
  },
  {
    id: "priority-queue-heap",
    title: "Priority Queue / Heap",
    tags: ["priority", "sjf", "selection"],
    stores: "Candidate READY set keyed by priority (or burst heuristics) with deterministic tie-breakers.",
    why: "Heap yields the best next process quickly without full sort on every tick.",
    operations: [
      { op: "push READY", complexity: "O(log n)" },
      { op: "pop best", complexity: "O(log n)" },
      { op: "peek best", complexity: "O(1)" },
    ],
    paths: ["backend/app/engine/scheduler.py"],
    snippetId: "heap_selection",
  },
  {
    id: "hashmap-dict",
    title: "HashMap / Dict",
    tags: ["lookup", "state", "index"],
    stores: "Fast lookup tables for process metadata, page tables, and websocket payload assembly.",
    why: "Constant-time key access keeps per-tick state serialization and memory lookups stable.",
    operations: [
      { op: "get by pid/vpn", complexity: "O(1) avg" },
      { op: "set/update", complexity: "O(1) avg" },
      { op: "membership check", complexity: "O(1) avg" },
    ],
    paths: ["backend/app/session.py", "backend/app/memory_sim.py", "backend/app/serializers.py"],
    snippetId: "ws_push",
  },
  {
    id: "set",
    title: "Set",
    tags: ["uniqueness", "pid", "safety"],
    stores: "Unique PID guards, deduplicated working-set pages, and processed-event tracking.",
    why: "Set semantics prevent duplicate inserts and keep deterministic process identities.",
    operations: [
      { op: "add", complexity: "O(1) avg" },
      { op: "contains", complexity: "O(1) avg" },
      { op: "remove", complexity: "O(1) avg" },
    ],
    paths: ["backend/app/session.py", "frontend/src/app/simulate/page.tsx"],
    snippetId: "paging_lru",
  },
  {
    id: "gantt-segments",
    title: "Gantt Segments (Run-length encoding)",
    tags: ["visualization", "compression", "frontend"],
    stores: "Compressed timeline segments: each segment tracks pid, start, end, len.",
    why: "RLE avoids rendering every tick cell and makes long timelines scalable and readable.",
    operations: [
      { op: "build from ticks", complexity: "O(n)" },
      { op: "append/extend tail", complexity: "O(1)" },
      { op: "window extraction", complexity: "O(k)" },
    ],
    paths: ["frontend/src/lib/timeline/buildSegments.ts", "frontend/src/components/dashboard/Timeline.tsx"],
    snippetId: "gantt_rle",
  },
  {
    id: "segment-tree",
    title: "Segment Tree (range analytics)",
    tags: ["range query", "streak", "analytics"],
    stores: "Merged nodes for best busy/idle streaks over any [l, r] timeline range.",
    why: "Segment tree answers streak queries in O(log n), even for very long runs.",
    operations: [
      { op: "build", complexity: "O(n)" },
      { op: "point update", complexity: "O(log n)" },
      { op: "range query", complexity: "O(log n)" },
    ],
    paths: ["frontend/src/lib/dsa/segStreak.ts", "frontend/src/lib/analytics/timelineAnalytics.ts"],
    snippetId: "segment_query",
  },
  {
    id: "fenwick-tree",
    title: "Fenwick Tree (busy/idle prefix sums)",
    tags: ["prefix sums", "utilization", "analytics"],
    stores: "Compact BIT arrays for busy and idle counts by tick prefix.",
    why: "Fenwick enables instant utilization stats for arbitrary selected ranges.",
    operations: [
      { op: "add(i, delta)", complexity: "O(log n)" },
      { op: "sum(i)", complexity: "O(log n)" },
      { op: "rangeSum(l, r)", complexity: "O(log n)" },
    ],
    paths: ["frontend/src/lib/dsa/fenwick.ts", "frontend/src/lib/analytics/timelineAnalytics.ts"],
    snippetId: "fenwick_update",
  },
  {
    id: "lru-page-frame",
    title: "LRU (paging support) + Page Table / Frame Table",
    tags: ["memory", "translation", "replacement"],
    stores: "Per-process page table entries (VPN->PFN) and global RAM frame metadata for replacement policies.",
    why: "This model turns memory access into deterministic hits/faults that affect CPU state transitions.",
    operations: [
      { op: "translate VA -> VPN/PFN", complexity: "O(1) avg" },
      { op: "LRU access update", complexity: "O(1)" },
      { op: "victim choice", complexity: "O(1)" },
    ],
    paths: ["backend/app/memory_sim.py", "backend/app/session.py", "frontend/src/app/memory/page.tsx"],
    snippetId: "paging_lru",
  },
];

const COMPLEXITY_ROWS = [
  ["Array/List", "append / index / slice", "O(1) amortized / O(1) / O(k)"],
  ["Queue (FIFO)", "enqueue / dequeue", "O(1) / O(1)"],
  ["Deque (RR)", "popleft / append", "O(1) / O(1)"],
  ["Priority Queue / Heap", "push / pop best", "O(log n) / O(log n)"],
  ["HashMap / Dict", "get / set / contains", "O(1) average"],
  ["Set", "add / remove / contains", "O(1) average"],
  ["RLE Segments", "compress timeline", "O(n)"],
  ["Segment Tree", "update / query", "O(log n) / O(log n)"],
  ["Fenwick Tree", "add / prefix / range", "O(log n) / O(log n) / O(log n)"],
  ["LRU + Page/Frame tables", "access / replace", "O(1) average"],
] as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function highlightToken(token: string, language: SnippetLanguage): string {
  const pyKeywords = new Set([
    "def",
    "class",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "return",
    "None",
    "True",
    "False",
    "in",
    "import",
    "from",
    "with",
    "and",
    "or",
    "not",
    "await",
    "async",
  ]);
  const tsKeywords = new Set([
    "type",
    "class",
    "const",
    "let",
    "if",
    "else",
    "return",
    "for",
    "while",
    "new",
    "private",
    "public",
    "export",
    "function",
    "extends",
    "import",
    "from",
    "void",
  ]);

  if (token.startsWith("#") || token.startsWith("//")) {
    return `<span class=\"text-emerald-300/85\">${escapeHtml(token)}</span>`;
  }
  if (/^(["'`]).*\1$/.test(token)) {
    return `<span class=\"text-amber-300\">${escapeHtml(token)}</span>`;
  }
  if (/^\d+(\.\d+)?$/.test(token)) {
    return `<span class=\"text-fuchsia-300\">${token}</span>`;
  }

  const keywordSet = language === "python" ? pyKeywords : tsKeywords;
  if (keywordSet.has(token)) {
    return `<span class=\"text-sky-300\">${token}</span>`;
  }

  if (/^[A-Z][A-Za-z0-9_]*$/.test(token)) {
    return `<span class=\"text-cyan-300\">${token}</span>`;
  }

  return escapeHtml(token);
}

function highlightCode(code: string, language: SnippetLanguage): string {
  const tokenRegex = /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`|#[^\n]*|\/\/[^\n]*|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b)/g;

  return code
    .split("\n")
    .map((line) => {
      let html = "";
      let last = 0;
      const matches = line.matchAll(tokenRegex);
      for (const match of matches) {
        const token = match[0];
        const start = match.index ?? 0;
        html += escapeHtml(line.slice(last, start));
        html += highlightToken(token, language);
        last = start + token.length;
      }
      html += escapeHtml(line.slice(last));
      return html;
    })
    .join("\n");
}

function snippetPreview(source: string): string {
  return source.split("\n").slice(0, 8).join("\n");
}

export default function LearnPage() {
  const [query, setQuery] = useState("");
  const [selectedSnippetId, setSelectedSnippetId] = useState(SNIPPETS[0]?.id ?? "");
  const [copied, setCopied] = useState(false);

  const filteredCards = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return DS_CARDS;
    return DS_CARDS.filter((card) => {
      const haystack = [
        card.title,
        card.stores,
        card.why,
        card.tags.join(" "),
        card.operations.map((op) => `${op.op} ${op.complexity}`).join(" "),
        card.paths.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [query]);

  const selectedSnippet = useMemo(
    () => SNIPPETS.find((snippet) => snippet.id === selectedSnippetId) ?? SNIPPETS[0],
    [selectedSnippetId],
  );

  const highlightedSnippet = useMemo(
    () => highlightCode(selectedSnippet?.code ?? "", selectedSnippet?.language ?? "typescript"),
    [selectedSnippet],
  );

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 md:py-10">
      <FadeIn>
        <section className="rounded-3xl border border-white/10 bg-zinc-950/55 p-7 md:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-sky-300/40 bg-sky-300/10 text-sky-200">
              Learn
            </Badge>
            <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-300">
              Data Structures Only
            </Badge>
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-100 md:text-5xl">Dispatch Data Structures</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-400 md:text-base">
            This section documents only the data structures that power Dispatch: what each structure stores, why it exists,
            where it is used, and how its complexity impacts scheduler and visualization performance.
          </p>
        </section>
      </FadeIn>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-7rem)]">
          <Card className="h-full border-white/10 bg-zinc-950/55">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-zinc-100">Learn Navigation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ScrollArea className="h-[68vh] pr-1">
                <div className="space-y-3">
                  {SECTION_LINKS.map((link) => (
                    <a
                      key={link.id}
                      href={`#${link.id}`}
                      className="block rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-sm text-zinc-300 transition hover:border-sky-300/35 hover:text-zinc-100"
                    >
                      {link.label}
                    </a>
                  ))}
                  <Separator className="my-2 bg-white/10" />
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">DS Anchors</p>
                  {DS_CARDS.map((card) => (
                    <a
                      key={card.id}
                      href={`#${card.id}`}
                      className="block rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
                    >
                      {card.title}
                    </a>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-8">
          <section id="overview" className="scroll-mt-28">
            <Card className="border-white/10 bg-zinc-950/55">
              <CardHeader>
                <CardTitle className="text-2xl text-zinc-100">Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-300">
                <p>
                  Dispatch combines classic scheduling structures (FIFO queue, deque, heap) with analytics structures
                  (Segment Tree, Fenwick Tree) and memory translation structures (page/frame tables with LRU-like policy).
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                    Deterministic tick loop
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                    O(log n) range analytics
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                    O(1) avg memory lookup
                  </Badge>
                  <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                    Segment-based timeline render
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator className="bg-white/10" />

          <section id="data-structures" className="scroll-mt-28 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-100">Data Structures</h2>
                <p className="mt-1 text-sm text-zinc-400">Search by structure, operation, complexity, or file path.</p>
              </div>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search DS cards..."
                className="w-full max-w-xs border-white/15 bg-zinc-900/50 text-zinc-100"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {filteredCards.map((card) => {
                const snippet = SNIPPETS.find((item) => item.id === card.snippetId);
                return (
                  <Card key={card.id} id={card.id} className="scroll-mt-28 border-white/10 bg-zinc-950/55">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="text-lg text-zinc-100">{card.title}</CardTitle>
                        <div className="flex flex-wrap gap-1">
                          {card.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="border-white/15 bg-white/5 text-zinc-300">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="space-y-1 text-sm">
                        <p className="text-zinc-300">
                          <span className="text-zinc-100">What it stores:</span> {card.stores}
                        </p>
                        <p className="text-zinc-300">
                          <span className="text-zinc-100">Why used:</span> {card.why}
                        </p>
                      </div>

                      <Accordion type="single" collapsible>
                        <AccordionItem value="ops">
                          <AccordionTrigger>Key operations + complexity</AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-1 text-sm text-zinc-300">
                              {card.operations.map((entry) => (
                                <li key={entry.op} className="flex items-center justify-between gap-2">
                                  <span>{entry.op}</span>
                                  <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                                    {entry.complexity}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="where">
                          <AccordionTrigger>Where in code</AccordionTrigger>
                          <AccordionContent>
                            <ul className="space-y-1 text-xs text-zinc-400">
                              {card.paths.map((path) => (
                                <li key={path} className="rounded-md border border-white/10 bg-zinc-900/45 px-2 py-1 font-mono">
                                  {path}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="snippet">
                          <AccordionTrigger>Snippet preview</AccordionTrigger>
                          <AccordionContent className="space-y-2">
                            <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/35 p-3 text-xs text-zinc-300">
                              <code>{snippetPreview(snippet?.code ?? "")}</code>
                            </pre>
                            {snippet ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10"
                                onClick={() => {
                                  setSelectedSnippetId(snippet.id);
                                  const node = document.getElementById("walkthrough");
                                  node?.scrollIntoView({ behavior: "smooth", block: "start" });
                                }}
                              >
                                Open in walkthrough
                              </Button>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <Separator className="bg-white/10" />

          <section id="mapping" className="scroll-mt-28 space-y-4">
            <h2 className="text-2xl font-semibold text-zinc-100">DS {`->`} Algorithms mapping</h2>
            <Tabs defaultValue="schedulers" className="space-y-3">
              <TabsList className="border border-white/10 bg-zinc-900/60">
                <TabsTrigger value="schedulers">Schedulers</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="memory">Paging</TabsTrigger>
              </TabsList>

              <TabsContent value="schedulers">
                <Card className="border-white/10 bg-zinc-950/55">
                  <CardContent className="space-y-3 pt-6 text-sm text-zinc-300">
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">FCFS</Badge> Queue (FIFO) + array timelines.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">RR</Badge> Deque for rotation + queue snapshots.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">PRIORITY/SJF</Badge> Heap for best-candidate extraction.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">MLQ</Badge> Two queues (SYS/USER) + deterministic picks.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="analytics">
                <Card className="border-white/10 bg-zinc-950/55">
                  <CardContent className="space-y-3 pt-6 text-sm text-zinc-300">
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">Segment Tree</Badge> Longest busy/idle streak in selected range.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">Fenwick Tree</Badge> Prefix busy counts and O(log n) utilization queries.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">RLE Segments</Badge> Compressed Gantt rendering for long timelines.</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="memory">
                <Card className="border-white/10 bg-zinc-950/55">
                  <CardContent className="space-y-3 pt-6 text-sm text-zinc-300">
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">HashMap</Badge> Page table entries keyed by VPN.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">Frame Table</Badge> Array indexed by PFN.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">LRU</Badge> HashMap + linked ordering for O(1) recency updates.</p>
                    <p><Badge className="mr-2 bg-zinc-800 text-zinc-200">Set</Badge> Unique working-set page generation.</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>

          <Separator className="bg-white/10" />

          <section id="walkthrough" className="scroll-mt-28 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-zinc-100">Code Walkthrough (Snippets)</h2>
                <p className="mt-1 text-sm text-zinc-400">Pick a focused snippet and inspect the DS mechanics in context.</p>
              </div>
              <Select value={selectedSnippet?.id} onValueChange={setSelectedSnippetId}>
                <SelectTrigger className="w-[360px] border-white/15 bg-zinc-900/65 text-zinc-100">
                  <SelectValue placeholder="Select snippet" />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-zinc-950 text-zinc-100">
                  {SNIPPETS.map((snippet) => (
                    <SelectItem key={snippet.id} value={snippet.id}>
                      {snippet.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="border-white/10 bg-zinc-950/55">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg text-zinc-100">{selectedSnippet?.label}</CardTitle>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-zinc-200">
                        {selectedSnippet?.language}
                      </Badge>
                      <Badge variant="outline" className="border-white/15 bg-white/5 font-mono text-zinc-300">
                        {selectedSnippet?.filePath}
                      </Badge>
                      <Badge variant="outline" className="border-white/15 bg-white/5 text-sky-200">
                        {selectedSnippet?.dsFocus}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10"
                    onClick={async () => {
                      if (!selectedSnippet) return;
                      await navigator.clipboard.writeText(selectedSnippet.code);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1200);
                    }}
                  >
                    {copied ? "Copied" : "Copy snippet"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="max-h-[560px] rounded-xl border border-white/10 bg-black/45 p-4">
                  <pre className="font-mono text-xs leading-6 text-zinc-200">
                    <code dangerouslySetInnerHTML={{ __html: highlightedSnippet }} />
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          </section>

          <Separator className="bg-white/10" />

          <section id="complexity" className="scroll-mt-28 space-y-4">
            <h2 className="text-2xl font-semibold text-zinc-100">Complexity Table</h2>
            <Card className="border-white/10 bg-zinc-950/55">
              <CardContent className="overflow-x-auto pt-6">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-zinc-400">
                      <th className="px-2 py-2 font-medium">Data Structure</th>
                      <th className="px-2 py-2 font-medium">Primary operations</th>
                      <th className="px-2 py-2 font-medium">Complexity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPLEXITY_ROWS.map((row) => (
                      <tr key={row[0]} className="border-b border-white/5 text-zinc-200">
                        <td className="px-2 py-2">{row[0]}</td>
                        <td className="px-2 py-2 text-zinc-300">{row[1]}</td>
                        <td className="px-2 py-2 font-mono text-zinc-300">{row[2]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
