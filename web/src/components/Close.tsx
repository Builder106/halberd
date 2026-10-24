import { docs, install, site } from "../data/session";
import { Copy } from "./Copy";

function Code({ text, caption }: { text: string; caption: string }) {
  return (
    <figure className="env env--code">
      <pre className="env__code">
        <code>{text}</code>
      </pre>
      <figcaption className="env__caption">
        {caption} <Copy text={text} />
      </figcaption>
    </figure>
  );
}

// The session's last message: how to put Halberd in your own pipe, with each
// command on the lane where it runs.
export function Close() {
  return (
    <section className="close lanes" id="install" aria-labelledby="install-title">
      <h2 id="install-title" className="close__title">
        {install.title}
      </h2>
      <div className="rail" aria-hidden="true" />
      <div className="close__s">
        <p className="lede">{install.note}</p>
        <Code text={install.build} caption="Build from source" />
        <p>{install.httpNote}</p>
        <Code text={install.http} caption="halberd-http, for a remote server" />
      </div>
      <div className="close__a">
        <p>{install.clientNote}</p>
        <Code text={install.client} caption="claude_desktop_config.json" />
      </div>
      <nav className="close__links" aria-label="Project">
        <ul>
          <li>
            <a className="u" href={site.repo}>Source on GitHub</a>
          </li>
          <li>
            <a className="u" href={docs.threatModel}>Threat model</a>
          </li>
          <li>
            <a className="u" href={docs.policyDsl}>Policy language</a>
          </li>
          <li>
            <a className="u" href={docs.architecture}>Architecture</a>
          </li>
          <li>
            <a className="u" href={docs.journal}>Journal</a>
          </li>
          <li>
            <a className="u" href={docs.license}>MIT license</a>
          </li>
        </ul>
      </nav>
      <div className="close__end" aria-hidden="true" />
    </section>
  );
}
