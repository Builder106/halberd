export const prefersReducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isTouch = () => matchMedia("(hover: none), (pointer: coarse)").matches;
export const isMobile = () => matchMedia("(max-width: 767px)").matches;

// Shared easing vocabulary. Messages travel at constant speed (`travel`) and
// stop or settle on `out`. Never invent per-component curves.
export const ease = {
  out: "expo.out",
  inOut: "expo.inOut",
  travel: "none",
} as const;

/** Seconds to travel `px` at the site's message speed (about 900 px/s). */
export const travelTime = (px: number) => Math.min(1.1, Math.max(0.35, Math.abs(px) / 900));
