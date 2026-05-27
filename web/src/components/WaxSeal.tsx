// WaxSeal renders an SVG seal in one of three states: refused (red wax,
// blocked requests), granted (brass, allowed requests), or amended (blue
// ink, sanitized responses). Each carries a short inscription and a
// motif in the center.
//
// Designed to be ~96px square, recognizable at a glance, no stock
// imagery. The "pressed wax" look comes from a radial gradient + a
// jagged round edge; the motif inside identifies the verdict without
// needing text.

type Variant = "refused" | "granted" | "amended";

const palette: Record<
  Variant,
  { wax: string; waxDark: string; waxLight: string; rim: string; ink: string }
> = {
  refused: {
    wax: "#a3252e",
    waxDark: "#5a141a",
    waxLight: "#d23a44",
    rim: "#7a1d23",
    ink: "#f0e6d2",
  },
  granted: {
    wax: "#b08948",
    waxDark: "#5d4621",
    waxLight: "#d4a754",
    rim: "#8a6a37",
    ink: "#1a1208",
  },
  amended: {
    wax: "#2d4a7c",
    waxDark: "#172846",
    waxLight: "#4a6fa8",
    rim: "#1f3559",
    ink: "#f0e6d2",
  },
};

const inscription: Record<Variant, string> = {
  refused: "REFUSED · BY ORDER OF THE POLICY",
  granted: "PASS GRANTED · ADMITTANCE",
  amended: "AMENDED · BY THE AUDITOR'S HAND",
};

// A slightly irregular round edge — wax doesn't press perfectly circular.
// Generated once and inlined so SVG-as-string doesn't bloat at runtime.
function jaggedRing(cx: number, cy: number, r: number, jitter: number) {
  const points: string[] = [];
  const segments = 64;
  // Deterministic pseudo-random so the seal looks the same every render.
  let seed = 1;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const radius = r + (rand() - 0.5) * jitter;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  points.push("Z");
  return points.join(" ");
}

export function WaxSeal({
  variant,
  size = 120,
  showInscription = true,
}: {
  variant: Variant;
  size?: number;
  showInscription?: boolean;
}) {
  const p = palette[variant];
  const r = 46;
  const ring = jaggedRing(60, 60, r, 3.5);

  return (
    <div
      className="inline-flex flex-col items-center select-none"
      style={{ width: size }}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        aria-label={`Halberd verdict: ${variant}`}
      >
        <defs>
          <radialGradient id={`wax-${variant}`} cx="0.4" cy="0.35" r="0.7">
            <stop offset="0%" stopColor={p.waxLight} />
            <stop offset="55%" stopColor={p.wax} />
            <stop offset="100%" stopColor={p.waxDark} />
          </radialGradient>
          <filter id={`shadow-${variant}`}>
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>

        {/* drop shadow */}
        <path
          d={ring}
          transform="translate(2 3)"
          fill="rgba(0,0,0,0.6)"
          filter={`url(#shadow-${variant})`}
        />

        {/* wax body */}
        <path d={ring} fill={`url(#wax-${variant})`} stroke={p.rim} strokeWidth="1" />

        {/* inner ring — a pressed-die border */}
        <circle
          cx="60"
          cy="60"
          r={r - 8}
          fill="none"
          stroke={p.rim}
          strokeWidth="0.8"
          opacity="0.7"
        />
        <circle
          cx="60"
          cy="60"
          r={r - 12}
          fill="none"
          stroke={p.rim}
          strokeWidth="0.4"
          opacity="0.5"
        />

        {/* motif */}
        <g transform="translate(60 60)">
          {variant === "refused" && (
            // Crossed halberds — refusal
            <g stroke={p.ink} strokeWidth="3" strokeLinecap="round" fill="none">
              <line x1="-18" y1="-18" x2="18" y2="18" />
              <line x1="18" y1="-18" x2="-18" y2="18" />
              <circle cx="0" cy="0" r="3" fill={p.ink} stroke="none" />
            </g>
          )}
          {variant === "granted" && (
            // Halberd silhouette — admittance under the guard's authority
            <g fill={p.ink} stroke="none">
              <rect x="-1.5" y="-20" width="3" height="40" />
              <polygon points="0,-24 -3,-20 3,-20" />
              <path d="M -3 -16 Q -16 -12 -19 -2 Q -14 1 -7 1 L -3 -1 Z" />
              <path d="M 3 -16 Q 12 -12 14 -5 Q 10 -2 5 -2 L 3 -4 Z" />
              <rect x="-6" y="-1" width="12" height="3.5" />
              <circle cx="0" cy="22" r="2.8" />
            </g>
          )}
          {variant === "amended" && (
            // Quill nib — the auditor's hand
            <g fill={p.ink} stroke="none">
              <path d="M -16 14 L 14 -16 L 18 -12 L -12 18 Z" />
              <polygon points="14,-16 18,-12 22,-20 16,-22" />
              <circle cx="-14" cy="16" r="2.5" />
            </g>
          )}
        </g>
      </svg>

      {showInscription && (
        <span
          className="mt-2 font-mono text-[10px] tracking-[0.18em] text-center uppercase"
          style={{ color: variant === "granted" ? "var(--color-brass)" : variant === "refused" ? "var(--color-wax)" : "var(--color-ink)" }}
        >
          {inscription[variant]}
        </span>
      )}
    </div>
  );
}
