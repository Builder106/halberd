import type { Metadata } from "next";
import { Console } from "../../components/Console";

export const metadata: Metadata = {
  title: "Console",
  description:
    "Send your own JSON-RPC request or server reply through Halberd's policy engine, compiled to WebAssembly and running in your browser.",
};

export default function ConsolePage() {
  return (
    <>
      <section className="pagehead lanes" aria-labelledby="console-title">
        <h1 id="console-title" className="pagehead__title">
          Console
        </h1>
        <div className="rail" aria-hidden="true" />
        <p className="pagehead__copy lede">
          Send your own message through the policy engine. It runs in this tab, so nothing you type leaves your browser.
          Pick a rule pack, write a request or a server reply, and see where Halberd puts it.
        </p>
      </section>
      <Console />
    </>
  );
}
