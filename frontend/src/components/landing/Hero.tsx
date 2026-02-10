"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/motion/FadeIn";

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-zinc-950/80 via-black/80 to-zinc-900/70 px-8 py-20 text-center md:px-16 md:py-28">
      <div className="pointer-events-none absolute inset-0 opacity-50">
        <motion.div
          className="absolute -left-20 top-8 h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl"
          animate={{ x: [0, 24, 0], y: [0, 8, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl"
          animate={{ x: [0, -28, 0], y: [0, -12, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto max-w-4xl space-y-8">
        <FadeIn>
          <motion.h1
            className="hero-wordmark text-6xl font-semibold tracking-tight text-zinc-100 md:text-8xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            Dispatch
          </motion.h1>
        </FadeIn>

        <FadeIn delay={0.15}>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
            See the Scheduler Think. Visualize Scheduling. Compare Algorithms.
          </p>
        </FadeIn>

        <FadeIn delay={0.28} className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="h-11 rounded-full bg-white text-black hover:bg-zinc-200">
            <Link href="/simulate">Start Simulation</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-11 rounded-full border-white/20 bg-white/5 text-zinc-100 hover:bg-white/10">
            <Link href="/learn">Learn</Link>
          </Button>
        </FadeIn>
      </div>
    </section>
  );
}
