import Link from "next/link";
import { exchanges, hero, site, verdictOf } from "../data/session";

const wire = exchanges.map((x) => {
  const req = x.request as { method: string; params?: { name?: string } };
  return { id: x.id, label: req.params?.name ? `${req.method} ${req.params.name}` : req.method, stops: verdictOf(x) === "refused" };
});

// The first frame: the claim pressed flush against Halberd's line, and a wire
// underneath where the session's requests keep travelling to it (motion/session.ts).
export function Hero() {
  return (
    <section className="hero lanes" aria-labelledby="hero-title">
      <h1 id="hero-title" className="hero__title" data-hero-title>
        {hero.title}
      </h1>
      <div className="rail" aria-hidden="true" />
      <div className="hero__copy">
        <p className="lede" data-hero-copy>
          {hero.intro}
        </p>
        <p data-hero-copy>{hero.session}</p>
        <p className="acts" data-hero-copy>
          <Link className="act" href="/console">
            <span className="act__label">Open the console</span>
          </Link>
          <a className="u" href={site.repo}>
            Read the source on GitHub
          </a>
        </p>
      </div>
      <div className="wire" aria-hidden="true" data-wire>
        {wire.map((m) => (
          <span key={m.id} className={`wire__msg wire__msg--${m.stops ? "stop" : "pass"}`} data-v={m.stops ? "stop" : "pass"}>
            {m.label}
          </span>
        ))}
      </div>
    </section>
  );
}
