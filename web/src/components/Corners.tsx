"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { exchanges, verdictOf } from "../data/session";
import { usePage } from "../engine/next";

gsap.registerPlugin(ScrollTrigger);

// The bottom corners: where you are in the session, and the two other views.
// On the session page the left corner follows the exchange in the middle of
// the viewport, in the protocol's own terms.
export function Corners() {
  const path = usePathname();
  const [at, setAt] = useState<number | null>(null);

  usePage(({ path }) => {
    if (path !== "/") return;
    document.querySelectorAll<HTMLElement>("[data-exchange]").forEach((el) => {
      const id = Number(el.dataset.exchange);
      ScrollTrigger.create({
        trigger: el,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (s) => setAt((cur) => (s.isActive ? id : cur === id ? null : cur)),
      });
    });
    return () => setAt(null);
  });

  // Step aside while the reader scrolls down, so the corners never sit on
  // content they are reading; come back on any scroll up.
  useEffect(() => {
    const st = ScrollTrigger.create({
      start: 0,
      end: "max",
      onUpdate: (self) =>
        document.documentElement.classList.toggle("frame-away", self.direction === 1 && self.scroll() > 160),
    });
    return () => st.kill();
  }, []);

  const x = at ? exchanges.find((e) => e.id === at) : undefined;
  const left =
    path === "/log" ? { href: "/console", label: "Open the console" } : { href: "/log", label: "Audit log" };
  const right = path === "/" ? { href: "/console", label: "Open the console" } : { href: "/", label: "Back to the session" };

  return (
    <nav className="corners" aria-label="Views">
      <p className="corners__left">
        {path === "/" ? (
          <span className="corners__pos">
            {x ? `Request ${x.id} of ${exchanges.length}, ${verdictOf(x)}` : `${exchanges.length} requests`}
          </span>
        ) : null}
        <Link className="corners__link" href={left.href}>
          {left.label}
        </Link>
      </p>
      <p className="corners__right">
        <Link className="act act--small" href={right.href}>
          <span className="act__label">{right.label}</span>
        </Link>
      </p>
    </nav>
  );
}
