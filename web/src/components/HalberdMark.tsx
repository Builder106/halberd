export function HalberdMark({
  className,
  size = 96,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 200 560"
      width={size * 0.36}
      height={size * 1}
      className={className}
      aria-label="Halberd mark"
    >
      <defs>
        <linearGradient id="hm-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dde6f0" />
          <stop offset="50%" stopColor="#9aabbe" />
          <stop offset="100%" stopColor="#5e6e80" />
        </linearGradient>
        <linearGradient id="hm-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g transform="translate(100 280)">
        {/* pole */}
        <rect x="-6" y="-260" width="12" height="520" fill="#3a4a5e" rx="2" />
        <rect x="-6" y="-260" width="6" height="520" fill="#202b3a" rx="2" />
        {/* spike */}
        <polygon
          points="0,-300 -10,-260 10,-260"
          fill="url(#hm-steel)"
          stroke="#0a0e14"
          strokeWidth="1"
        />
        {/* axe blade */}
        <path
          d="M -10 -230 Q -80 -200 -100 -130 Q -85 -110 -55 -103 L -10 -110 Z"
          fill="url(#hm-steel)"
          stroke="#0a0e14"
          strokeWidth="1.5"
        />
        <path
          d="M -100 -130 Q -85 -110 -55 -103"
          fill="none"
          stroke="url(#hm-edge)"
          strokeWidth="2"
        />
        {/* beak */}
        <path
          d="M 10 -230 Q 55 -200 70 -160 Q 58 -140 35 -140 L 10 -150 Z"
          fill="url(#hm-steel)"
          stroke="#0a0e14"
          strokeWidth="1.5"
        />
        {/* cross-guard */}
        <rect
          x="-24"
          y="-103"
          width="48"
          height="16"
          rx="3"
          fill="#5e6e80"
          stroke="#0a0e14"
          strokeWidth="1"
        />
        <rect x="-24" y="-103" width="48" height="3" fill="#dde6f0" opacity="0.7" />
        {/* pommel */}
        <circle
          cx="0"
          cy="255"
          r="12"
          fill="#5e6e80"
          stroke="#0a0e14"
          strokeWidth="1"
        />
      </g>
    </svg>
  );
}
