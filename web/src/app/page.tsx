import { Close } from "../components/Close";
import { Exchange } from "../components/Exchange";
import { Hero } from "../components/Hero";
import { SessionMotion } from "../components/SessionMotion";
import { exchanges } from "../data/session";

export default function Session() {
  return (
    <>
      <Hero />
      <ol className="session" aria-label="The session, one request at a time">
        {exchanges.map((x) => (
          <li key={x.id}>
            <Exchange x={x} />
          </li>
        ))}
      </ol>
      <Close />
      <SessionMotion />
    </>
  );
}
