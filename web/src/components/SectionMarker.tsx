// Section header for the "keep tour" layout: a Roman-numeral chapter
// marker on the left, a ceremonial display-serif title up top, and a
// smaller sans subtitle stating the section's functional purpose.
// Body copy stays in the existing sans for legibility.

type Props = {
  numeral: "I" | "II" | "III" | "IV" | "V";
  ceremonial: string;
  functional: string;
  id?: string;
};

export function SectionMarker({ numeral, ceremonial, functional, id }: Props) {
  return (
    <header id={id} className="mb-12">
      <div className="flex items-baseline gap-6">
        <span
          className="font-serif text-(--color-brass) text-3xl md:text-4xl tracking-widest leading-none select-none"
          aria-hidden
        >
          {numeral}
        </span>
        <div>
          <h2
            className="font-serif font-semibold text-3xl md:text-5xl leading-tight tracking-tight text-(--color-fg)"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {ceremonial}
          </h2>
          <p className="text-sm md:text-base text-(--color-fg-3) font-mono mt-2 tracking-wide">
            <span className="text-(--color-brass-dim) mr-2">§</span>
            {functional}
          </p>
        </div>
      </div>
      {/* Hairline under the marker, brass-tinted on the left, fading to
          the border color — visually anchors the section without a
          heavyweight rule. */}
      <div
        className="h-px mt-6"
        style={{
          background:
            "linear-gradient(90deg, var(--color-brass) 0%, var(--color-border) 30%, transparent 100%)",
        }}
      />
    </header>
  );
}
