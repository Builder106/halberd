import { docs, policyExcerpt, refusal, verdictOf, type Exchange as ExchangeData } from "../data/session";
import { Crossing, Envelope } from "./Envelope";
import { TryRefusal } from "./TryRefusal";

// One request and what became of it, laid out on the three lanes. The grid
// areas (globals.css, .x--*) put each block where Halberd sent it: a refused
// request never leaves the assistant lane, an allowed one lands in the
// server lane, and an amended reply arrives back on the assistant side.
export function Exchange({ x }: { x: ExchangeData }) {
  const verdict = verdictOf(x);
  return (
    <article id={`id-${x.id}`} className={`x x--${verdict}`} data-exchange={x.id} data-verdict={verdict} tabIndex={-1}>
      <header className="x__head">
        <h2 className="x__title">{x.title}</h2>
        <p className="x__meta">{x.meta}</p>
      </header>

      <div className="x__a">
        {verdict === "refused" ? (
          <>
            <Envelope
              value={x.request}
              mark={x.match ? [x.match] : []}
              caption="Sent by the assistant. Stopped here."
              className="env--stopped"
              data-travel="stop"
            />
            <Envelope value={refusal(x)} caption="Halberd's reply to the assistant" data-travel="back" />
            {x.id === 4 ? <TryRefusal /> : null}
          </>
        ) : verdict === "amended" ? (
          <>
            <Crossing value={x.response} redact={x.redact ?? []} caption="The server's reply, crossing the line" />
            <Envelope value={x.delivered} caption="Delivered to the assistant, byte for byte" className="env--quiet" />
          </>
        ) : (
          <Envelope value={x.response} caption="The server's reply, passed back unchanged" data-travel="back" />
        )}
      </div>

      <div className="x__rail" aria-hidden="true">
        <span className="x__verdict">{verdict}</span>
      </div>

      <div className="x__s">
        {verdict === "refused" ? (
          <p className="x__absent">Nothing reached the server.</p>
        ) : (
          <Envelope value={x.request} caption="Arrived at the server unchanged" data-travel="pass" />
        )}
      </div>

      <div className="x__notes">
        {x.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {x.limit ? <p className="x__limit">{x.limit}</p> : null}
        {x.id === 2 ? (
          <figure className="policy">
            <pre className="env__code">
              <code>{policyExcerpt}</code>
            </pre>
            <figcaption className="env__caption">
              From the PostgreSQL pack.{" "}
              <a className="u" href={docs.postgresPack}>
                Read the whole file
              </a>{" "}
              or{" "}
              <a className="u" href={docs.policies}>
                browse every pack
              </a>
              .
            </figcaption>
          </figure>
        ) : null}
      </div>
    </article>
  );
}
