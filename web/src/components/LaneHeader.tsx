import Link from "next/link";
import { lanes } from "../data/session";
import { Mark } from "./Mark";

// The sequence diagram's own header, fixed: who sits on each lifeline. It
// replaces a navbar; the mark sits on Halberd's line and leads home.
export function LaneHeader() {
  return (
    <header className="lanehead lanes">
      <p className="lanehead__lane lanehead__lane--a">
        <span className="lanehead__role">{lanes.assistant.role}</span>
        <span className="lanehead__proc">{lanes.assistant.process}</span>
      </p>
      <div className="lanehead__rail">
        <Link className="lanehead__home" href="/">
          <Mark className="lanehead__mark" />
          <span className="lanehead__lane">
            <span className="lanehead__role">{lanes.halberd.role}</span>
            <span className="lanehead__proc">{lanes.halberd.process}</span>
          </span>
        </Link>
      </div>
      <p className="lanehead__lane lanehead__lane--s">
        <span className="lanehead__role">{lanes.server.role}</span>
        <span className="lanehead__proc">{lanes.server.process}</span>
      </p>
    </header>
  );
}
