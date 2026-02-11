import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "/learn", label: "Learn" },
  { href: "/simulate", label: "Simulate" },
  { href: "/memory", label: "Memory" },
];

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="text-sm font-semibold tracking-[0.18em] text-zinc-100 uppercase">
          Dispatch
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-300 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-white/20 bg-white/5 text-zinc-300">
            Live Visualizer
          </Badge>
          <Button asChild size="sm" className="bg-white/90 text-black hover:bg-white">
            <Link href="/simulate">Open</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
