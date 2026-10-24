// Engine core: a page lifecycle that reverts every effect on navigation. No
// DOM access at import time (SSR-safe). The Next adapter calls:
//   boot(setup)            once, on first load: setup, page init, intro
//   leave() then cleanup() before the route swaps
//   enter()                after the new page is in the DOM
// Page code hooks in with onPage(fn). fn runs inside a gsap.context, so the
// tweens and ScrollTriggers it creates are reverted automatically; return a
// cleanup for anything else. Scroll is native; ScrollTrigger reads it.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "./env";
import { playEnter, playLeave } from "./transition";

gsap.registerPlugin(ScrollTrigger);

export { setTransition } from "./transition";
export { ease, isMobile, isTouch, prefersReducedMotion, travelTime } from "./env";

export type PageFn = (page: { intro: gsap.core.Timeline; path: string }) => void | (() => void);
const pageFns = new Set<PageFn>();
const cleanups: (() => void)[] = [];
let ctx: gsap.Context | null = null;
let intro: gsap.core.Timeline | null = null;
let ready = false;
let booted = false;

/** Run fn on every page load (and now, if a page is ready). Returns an unsubscribe. */
export function onPage(fn: PageFn) {
  pageFns.add(fn);
  if (ready) runPageFn(fn);
  return () => {
    pageFns.delete(fn);
  };
}

function runPageFn(fn: PageFn) {
  ctx?.add(() => {
    const c = fn({ intro: intro!, path: location.pathname });
    if (typeof c === "function") cleanups.push(c);
  });
}

function syncFlags() {
  const h = document.documentElement.classList;
  h.add("js", "is-booted");
  h.toggle("motion", !prefersReducedMotion());
}

function initPage() {
  syncFlags();
  ctx = gsap.context(() => {
    intro = gsap.timeline({ paused: true });
  });
  ready = true;
  pageFns.forEach(runPageFn);
  requestAnimationFrame(() => ScrollTrigger.refresh());
}

export async function boot(setup?: () => void) {
  if (booted) return;
  booted = true;
  syncFlags();
  setup?.();
  initPage();
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  intro?.play();
}

export async function leave() {
  await playLeave();
}

export function cleanup() {
  if (!ready) return;
  ready = false;
  cleanups.splice(0).forEach((c) => c());
  ctx?.revert();
  ctx = null;
}

export async function enter({ transition = true, scrollTop = true } = {}) {
  if (!booted) return;
  cleanup();
  if (scrollTop) scrollTo(0, 0);
  initPage();
  if (transition) await playEnter();
  intro?.play();
}
