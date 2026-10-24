// Page transitions. The adapter runs leave() while the next page loads, so a
// transition adds little or no latency. setTransition() replaces the look.
import { gsap } from "gsap";
import { ease, prefersReducedMotion } from "./env";

export type Transition = {
  leave: (curtain: HTMLElement) => Promise<unknown> | gsap.core.Animation;
  enter: (curtain: HTMLElement) => Promise<unknown> | gsap.core.Animation;
};

let current: Transition = {
  leave: (c) =>
    gsap.timeline().set(c, { autoAlpha: 1 }).fromTo(c.firstElementChild, { xPercent: -100 }, { xPercent: 0, duration: 0.7, ease: ease.inOut }),
  enter: (c) =>
    gsap.timeline().to(c.firstElementChild, { xPercent: 100, duration: 0.7, ease: ease.inOut }).set(c, { autoAlpha: 0 }),
};

const reduced: Transition = {
  leave: (c) => gsap.timeline().set(c.firstElementChild, { xPercent: 0 }).fromTo(c, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }),
  enter: (c) => gsap.to(c, { autoAlpha: 0, duration: 0.2 }),
};

export const setTransition = (t: Transition) => {
  current = t;
};
const pick = () => (prefersReducedMotion() ? reduced : current);
const curtain = () => document.getElementById("curtain") as HTMLElement;

export const playLeave = () => Promise.resolve(pick().leave(curtain()));
export const playEnter = () => Promise.resolve(pick().enter(curtain()));
