// Tiny heraldic crests for each rule pack. Each is a single-color SVG
// silhouette designed to read at ~16-20px alongside a chip label. No
// stock imagery; each motif suggests the pack's domain without leaning
// on the upstream project's actual logo.

type CrestKind =
  | "postgres"
  | "filesystem"
  | "git"
  | "github"
  | "honeypot"
  | "unknown";

export function Crest({
  pack,
  size = 18,
  className,
}: {
  pack: string;
  size?: number;
  className?: string;
}) {
  const kind = mapPack(pack);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className={className}
      style={{ color: "var(--color-brass)" }}
    >
      {crestPath(kind)}
    </svg>
  );
}

function mapPack(name: string): CrestKind {
  if (name.includes("postgres")) return "postgres";
  if (name.includes("filesystem")) return "filesystem";
  if (name.includes("git") && !name.includes("github")) return "git";
  if (name.includes("github")) return "github";
  if (name.includes("honeypot")) return "honeypot";
  return "unknown";
}

function crestPath(kind: CrestKind) {
  switch (kind) {
    case "postgres":
      // Stylized boar — a heraldic charge that suggests the postgres
      // mascot without copying it.
      return (
        <g fill="currentColor">
          <path d="M3 14c0-3.5 3-6 7-6 1.6 0 3.1.4 4.3 1.1L17 7l1 2.5L20 9l-.8 2.5L21 13l-2 .8c0 .8-.3 1.6-.8 2.3l1.3 1.7-2.2.4-1 1.8-1.8-1.3c-1 .3-2 .5-3 .5-4 0-7-2.5-7-6z" />
          <circle cx="14.5" cy="13" r="0.9" fill="var(--color-bg)" />
          <path d="M5 16c-.6 1-1.5 1.5-2.5 1.5l1.5-3" />
        </g>
      );
    case "filesystem":
      // A folder rendered as a sealed scroll — pack name suggests both.
      return (
        <g fill="currentColor">
          <path d="M3 7h6l2 2h10v10H3z" />
          <circle cx="11" cy="14" r="1.5" fill="var(--color-wax)" />
          <path
            d="M9.5 14 L 10.5 16 L 11.5 14"
            stroke="var(--color-wax)"
            strokeWidth="0.6"
            fill="none"
          />
        </g>
      );
    case "git":
      // Three branches meeting at a node — git's commit-graph shape as
      // a heraldic chevron.
      return (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <circle cx="6" cy="6" r="2" fill="currentColor" />
          <circle cx="18" cy="6" r="2" fill="currentColor" />
          <circle cx="12" cy="18" r="2" fill="currentColor" />
          <line x1="6" y1="8" x2="12" y2="16" />
          <line x1="18" y1="8" x2="12" y2="16" />
        </g>
      );
    case "github":
      // Octofoil — eight-pointed star, the heraldic charge that nods to
      // the octocat without redrawing it.
      return (
        <g fill="currentColor">
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const x = 12 + Math.cos(angle) * 7;
            const y = 12 + Math.sin(angle) * 7;
            return <circle key={i} cx={x} cy={y} r="2.5" />;
          })}
          <circle cx="12" cy="12" r="3" fill="var(--color-bg)" />
          <circle cx="12" cy="12" r="1.5" />
        </g>
      );
    case "honeypot":
      // A bee — and a trapping cage. Honeypot is the bait.
      return (
        <g>
          <ellipse cx="12" cy="13" rx="6" ry="4.5" fill="currentColor" />
          <path
            d="M8 11h8 M8 14h8"
            stroke="var(--color-bg)"
            strokeWidth="1.4"
          />
          <path
            d="M6 9 L 8 11 M18 9 L 16 11"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="6" cy="9" r="1.6" fill="currentColor" />
          <circle cx="18" cy="9" r="1.6" fill="currentColor" />
        </g>
      );
    case "unknown":
    default:
      // A questioning quatrefoil for un-mapped pack names.
      return (
        <g fill="currentColor">
          <circle cx="12" cy="6" r="3" />
          <circle cx="18" cy="12" r="3" />
          <circle cx="12" cy="18" r="3" />
          <circle cx="6" cy="12" r="3" />
        </g>
      );
  }
}
