import { FeatureCards } from "@/components/landing/FeatureCards";
import { Hero } from "@/components/landing/Hero";

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
      <Hero />
      <FeatureCards />
    </main>
  );
}
