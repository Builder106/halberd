import { Hero } from "../components/Hero";
import { Playground } from "../components/Playground";
import { ThreatModel } from "../components/ThreatModel";
import { Install } from "../components/Install";
import { Footer } from "../components/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Playground />
      <ThreatModel />
      <Install />
      <Footer />
    </main>
  );
}
