// Halberd's mark, drawn in Glaxnimate (design/marks/halberd-head.svg). The
// shaft is 3 units wide so, at its native 48 by 72 size, it lines up with the
// 3 px lifeline that runs down the session page.
export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 72"
      width="48"
      height="72"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <g fill="currentColor">
        <path d="M24 0 L26.2 23 L21.8 23 Z" />
        <path d="M25.5 17 C31 17 36 15 40.5 10.5 C46.5 19.5 46.5 34 41.5 42.5 C36.5 37.5 31 35.5 25.5 35.5 Z" />
        <path d="M22.5 20.5 C17 21.5 11.5 24 5.5 29.5 C11.5 27.5 17 27 22.5 27.5 Z" />
        <rect x="22.5" y="14" width="3" height="58" />
      </g>
    </svg>
  );
}
