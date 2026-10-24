import Link from "next/link";
import type { Metadata } from "next";
import { Envelope } from "../components/Envelope";

export const metadata: Metadata = {
  title: "Method not found",
  description: "There is no page at this address. Halberd let the request through; the server had nothing to send back.",
};

const request = { jsonrpc: "2.0", id: 404, method: "resources/read", params: { uri: "halberd://this-page" } };
const reply = { jsonrpc: "2.0", id: 404, error: { code: -32601, message: "Method not found" } };

// Unknown methods are logged and passed, so a missing page is not a refusal:
// the request crosses the line, and the server answers that it has nothing.
export default function NotFound() {
  return (
    <section className="x x--allowed missing" aria-labelledby="missing-title">
      <header className="x__head">
        <h1 id="missing-title" className="x__title">
          Nothing at this address.
        </h1>
        <p className="x__meta">Request 404, resources/read. Allowed and logged.</p>
      </header>
      <div className="x__a">
        <Envelope value={reply} caption="The server's reply" />
      </div>
      <div className="x__rail" aria-hidden="true">
        <span className="x__verdict">allowed</span>
      </div>
      <div className="x__s">
        <Envelope value={request} caption="Arrived at the server unchanged" />
      </div>
      <div className="x__notes">
        <p>
          Halberd only judges tool calls, so it let this one through. The server had nothing to give back. The{" "}
          <Link className="u" href="/">
            session
          </Link>{" "}
          is where everything else lives.
        </p>
      </div>
    </section>
  );
}
