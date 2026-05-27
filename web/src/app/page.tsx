import { Hero } from "../components/Hero";
import { Playground } from "../components/Playground";
import { Threats, Armory } from "../components/ThreatModel";
import { Install } from "../components/Install";
import { Footer } from "../components/Footer";
import { KeepNav } from "../components/KeepNav";

export default function Home() {
  return (
    <>
      <KeepNav />
      <main className="flex-1 md:pl-56">
        <Hero />
        <Playground />
        <Threats />
        <Armory />
        <Install />
        <Footer />
      </main>
    </>
  );
}
