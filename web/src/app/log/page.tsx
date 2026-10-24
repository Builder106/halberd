import Link from "next/link";
import type { Metadata } from "next";
import { audit, exchanges, verdictOf } from "../../data/session";

export const metadata: Metadata = {
  title: "Audit log",
  description:
    "The Halberd session as its audit bus records it: one JSON line per decision, each linked to the request it describes.",
};

// The escape hatch: every exchange on the session page as the audit records
// Halberd writes, with a plain link to each.
export default function LogPage() {
  return (
    <>
      <section className="pagehead lanes" aria-labelledby="log-title">
        <h1 id="log-title" className="pagehead__title">
          Audit log
        </h1>
        <div className="rail" aria-hidden="true" />
        <p className="pagehead__copy lede">
          The session as Halberd records it, one JSON line per decision. A request always gets a line. A reply gets one
          only when a filter changed it. The timestamps are illustrative; everything else is what the engine decided.
        </p>
      </section>
      <ol className="log" aria-label="Audit records">
        {audit.map((r, i) => {
          const x = exchanges.find((e) => e.id === r.exchange)!;
          const response = r.line.direction === "response";
          return (
            <li key={i} className="log__row lanes">
              <p className="log__link">
                <Link href={`/#id-${x.id}`}>
                  {response ? `Reply ${x.id}, amended` : `Request ${x.id}, ${verdictOf(x) === "refused" ? "refused" : "allowed"}`}
                </Link>
              </p>
              <div className="rail" aria-hidden="true" />
              <pre className="log__line">
                <code>{JSON.stringify(r.line)}</code>
              </pre>
            </li>
          );
        })}
      </ol>
    </>
  );
}
