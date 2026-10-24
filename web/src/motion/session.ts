// Session motion. Every envelope rests where Halberd put it (the static
// layout in globals.css); this module only plays the trip there, as a
// transform from where the message started:
//   pass   a request slides from the assistant lane across the line
//   stop   a request slides up to the line and stops dead, then the
//          highlighter sweeps the text the pattern matched
//   back   a reply slides back toward the assistant
//   crossing (the signature) a server reply is scrubbed across the line by
//          scroll; the part that has crossed shows the delivered layer
// The hero wire is the idle state: method names keep travelling to the line
// while the hero is on screen. Nothing here runs under reduced motion.
import { gsap } from "gsap";
import { ease, prefersReducedMotion, travelTime, type PageFn } from "../engine";

// The lane gap, measured: the server lane starts one gap after the rail.
const gapAfter = (rail: Element) => {
  const next = rail.nextElementSibling;
  return next ? next.getBoundingClientRect().left - rail.getBoundingClientRect().right : 32;
};

const restLeft = (el: Element) => el.getBoundingClientRect().left - (gsap.getProperty(el, "x") as number);
const restTop = (el: Element) => el.getBoundingClientRect().top - (gsap.getProperty(el, "y") as number);

export const sessionMotion: PageFn = ({ intro }) => {
  if (prefersReducedMotion()) return;
  const mm = gsap.matchMedia();

  heroIntro(intro);

  mm.add({ desk: "(min-width: 768px)", phone: "(max-width: 767px)" }, (c) => {
    const desk = Boolean(c.conditions?.desk);
    document.querySelectorAll<HTMLElement>("[data-exchange]").forEach((x) => trip(x, desk));
    document.querySelectorAll<HTMLElement>("[data-crossing]").forEach((el) => crossing(el, desk));
    if (desk) idleWire();
  });

  return () => mm.revert();
};

function heroIntro(intro: gsap.core.Timeline) {
  const title = document.querySelector("[data-hero-title]");
  if (!title) return;
  intro
    .fromTo(".hero .rail", { scaleY: 0 }, { scaleY: 1, transformOrigin: "50% 0%", duration: 1.1, ease: ease.out }, 0)
    .fromTo(title, { x: -72, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: travelTime(72), ease: ease.travel }, 0.15)
    .to(title, { x: -4, duration: 0.07, ease: "power2.out" })
    .to(title, { x: 0, duration: 0.4, ease: ease.out })
    .fromTo("[data-hero-copy]", { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: ease.out, stagger: 0.05 }, 0.45);
}

function trip(x: HTMLElement, desk: boolean) {
  const pass = x.querySelector<HTMLElement>('[data-travel="pass"]');
  const stop = x.querySelector<HTMLElement>('[data-travel="stop"]');
  const back = x.querySelector<HTMLElement>('[data-travel="back"]');
  const rail = x.querySelector<HTMLElement>(".x__rail");
  const tl = gsap.timeline({ scrollTrigger: { trigger: x, start: "top 70%", once: true } });

  if (pass) {
    if (desk) {
      const from = () => x.getBoundingClientRect().left + parseFloat(getComputedStyle(x).paddingLeft) - restLeft(pass);
      tl.fromTo(pass, { x: from }, { x: 0, duration: travelTime(from()), ease: ease.travel });
    } else {
      tl.fromTo(pass, { y: -28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.6, ease: ease.out });
    }
  }

  if (stop) {
    const axis = desk ? "x" : "y";
    const hl = stop.querySelectorAll(".hl");
    const run = desk ? 150 : 28;
    tl.fromTo(stop, { [axis]: -run, autoAlpha: desk ? 0.4 : 0 }, { [axis]: 0, autoAlpha: 1, duration: travelTime(run), ease: ease.travel })
      .to(stop, { [axis]: -5, duration: 0.07, ease: "power2.out" })
      .to(stop, { [axis]: 0, duration: 0.4, ease: ease.out });
    if (hl.length) tl.fromTo(hl, { backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%", duration: 0.45, ease: ease.out }, "<");
  }

  if (back) {
    if (desk && rail && !stop) {
      const from = () => rail.getBoundingClientRect().right + gapAfter(rail) - restLeft(back);
      tl.fromTo(back, { x: from }, { x: 0, duration: travelTime(from()), ease: ease.travel }, "+=0.15");
    } else {
      tl.fromTo(back, desk ? { x: 48, autoAlpha: 0 } : { y: 28, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: 0.55, ease: ease.out }, "+=0.1");
    }
  }
}

// The signature. The reply starts wholly on the server side (only the "sent"
// layer shows) and ends wholly on the assistant side (only "clean" shows).
// On phones the lanes stack, server above the rail, so it crosses downward,
// starting with its middle (where the secret sits) on the line.
// In between, each layer is clipped at the line, so the redaction happens
// exactly where the envelope crosses it.
function crossing(el: HTMLElement, desk: boolean) {
  const sent = el.querySelector<HTMLElement>('[data-layer="sent"]');
  const clean = el.querySelector<HTMLElement>('[data-layer="clean"]');
  const stack = el.querySelector<HTMLElement>(".env__stack");
  const rail = el.closest("[data-exchange]")?.querySelector<HTMLElement>(".x__rail");
  if (!sent || !clean || !stack || !rail) return;

  const line = () => {
    const r = rail.getBoundingClientRect();
    return desk ? r.left + r.width / 2 : r.top + r.height / 2;
  };
  const clip = () => {
    const r = stack.getBoundingClientRect();
    const size = desk ? r.width : r.height;
    const at = gsap.utils.clamp(0, size, line() - (desk ? r.left : r.top));
    // Desktop: the server is right of the line. Phone: the server is above it.
    gsap.set(sent, { clipPath: desk ? `inset(0 0 0 ${at}px)` : `inset(0 0 ${size - at}px 0)` });
    gsap.set(clean, { clipPath: desk ? `inset(0 ${size - at}px 0 0)` : `inset(${at}px 0 0 0)` });
  };

  const from = desk
    ? () => rail.getBoundingClientRect().right + gapAfter(rail) - restLeft(el)
    : () => rail.getBoundingClientRect().top - 0.65 * stack.offsetHeight - restTop(el);

  gsap.fromTo(
    el,
    { [desk ? "x" : "y"]: from },
    {
      [desk ? "x" : "y"]: 0,
      ease: ease.travel,
      onUpdate: clip,
      // Keyed to the envelope's own lane (which never moves), so the whole
      // trip happens while the envelope is on screen.
      scrollTrigger: {
        trigger: el.parentElement,
        start: desk ? "top 85%" : "top 95%",
        end: desk ? "top 35%" : "top 45%",
        scrub: 0.6,
        invalidateOnRefresh: true,
        onRefresh: clip,
      },
    },
  );
  clip();
}

function idleWire() {
  const wire = document.querySelector<HTMLElement>("[data-wire]");
  const rail = document.querySelector<HTMLElement>(".hero .rail");
  if (!wire || !rail) return;
  const msgs = gsap.utils.toArray<HTMLElement>("[data-wire] .wire__msg");
  const tl = gsap.timeline({ repeat: -1, paused: true });

  msgs.forEach((m, i) => {
    const stops = m.dataset.v === "stop";
    const start = () => wire.getBoundingClientRect().left - restLeft(m);
    const end = () => wire.getBoundingClientRect().right - restLeft(m) - m.offsetWidth;
    const at = i * 1.3;
    tl.fromTo(m, { x: start, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, at);
    if (stops) {
      tl.to(m, { x: 0, duration: travelTime(start()), ease: ease.travel }, at)
        .to(m, { x: -4, duration: 0.07, ease: "power2.out" })
        .to(m, { x: 0, duration: 0.4, ease: ease.out })
        .to(m, { autoAlpha: 0, duration: 0.4 }, "+=0.9");
    } else {
      const d = travelTime(end() - start()) * 1.4;
      tl.to(m, { x: end, duration: d, ease: ease.travel }, at).to(m, { autoAlpha: 0, duration: 0.3 }, "-=0.3");
    }
  });

  gsap.timeline({
    scrollTrigger: {
      trigger: wire,
      start: "top bottom",
      end: "bottom top",
      onToggle: (s) => (s.isActive ? tl.play() : tl.pause()),
      invalidateOnRefresh: true,
    },
  });
}
