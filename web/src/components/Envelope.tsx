import { pretty, segments } from "../lib/envelope";

type Props = {
  value?: unknown;
  /** Pre-formatted text, used instead of `value`. */
  text?: string;
  caption: string;
  /** Text to mark with the highlighter. */
  mark?: readonly string[];
  className?: string;
  "data-travel"?: string;
};

// One JSON-RPC message as it crossed the wire. The caption sits under the
// code and says who sent it.
export function Envelope({ value, text, caption, mark, className, ...data }: Props) {
  const source = text ?? pretty(value);
  return (
    <figure className={`env ${className ?? ""}`} {...data}>
      <pre className="env__code">
        <code>
          {segments(source, mark).map((s, i) =>
            s.hit ? (
              <mark key={i} className="hl">
                {s.text}
              </mark>
            ) : (
              s.text
            ),
          )}
        </code>
      </pre>
      <figcaption className="env__caption">{caption}</figcaption>
    </figure>
  );
}

// The server's reply drawn twice, stacked: as sent (secrets visible) and as
// delivered (secrets under bars of the same width). The session motion
// slides it across Halberd's line and clips each layer at the line, so the
// reply is redacted exactly where it crosses. At rest it shows the delivered
// layer only.
export function Crossing({ value, redact, caption }: { value: unknown; redact: readonly string[]; caption: string }) {
  const parts = segments(pretty(value), redact);
  return (
    <figure className="env env--crossing" data-crossing>
      <div className="env__stack">
        <pre className="env__code env__layer env__layer--sent" aria-hidden="true" data-layer="sent">
          <code>
            {parts.map((s, i) =>
              s.hit ? (
                <mark key={i} className="hl">
                  {s.text}
                </mark>
              ) : (
                s.text
              ),
            )}
          </code>
        </pre>
        <pre className="env__code env__layer env__layer--clean" data-layer="clean">
          <code>
            {parts.map((s, i) =>
              s.hit ? (
                <span key={i} className="bar">
                  <span className="sr-only">redacted</span>
                  <span aria-hidden="true">{s.text}</span>
                </span>
              ) : (
                s.text
              ),
            )}
          </code>
        </pre>
      </div>
      <figcaption className="env__caption">{caption}</figcaption>
    </figure>
  );
}
