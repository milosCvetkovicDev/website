import { AnimatedText } from 'web';

export const Headline = () => (
  <AnimatedText
    as="h2"
    animation="scramble"
    className="text-3xl font-bold text-[var(--foreground)]"
  >
    This happened at 3am. Nobody woke up.
  </AnimatedText>
);

export const PhaseLabel = () => (
  <div className="flex items-center gap-3">
    <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
      <AnimatedText animation="morse">PHASE 1</AnimatedText>
    </span>
    <AnimatedText animation="highlight" className="font-mono text-sm text-[var(--muted)]">
      DISCOVERY
    </AnimatedText>
  </div>
);

export const EveryAnimation = () => (
  <div className="grid gap-3 md:grid-cols-2">
    {(
      [
        'scramble',
        'wave',
        'magnetic',
        'scatter',
        'glitch',
        'typewriter',
        'elastic',
        'stagger-up',
        'rainbow',
        'perspective',
        'gravity',
        'blur-reveal',
        'highlight',
        'morse',
      ] as const
    ).map((animation) => (
      <div
        key={animation}
        className="flex items-baseline justify-between gap-4 rounded-lg border border-[var(--border)] px-4 py-3"
      >
        <AnimatedText
          animation={animation}
          className="text-lg font-semibold text-[var(--foreground)]"
        >
          Ship clarity
        </AnimatedText>
        <span className="font-mono text-xs text-[var(--muted)]">{animation}</span>
      </div>
    ))}
  </div>
);

export const DarkTheme = () => (
  <div className="dark bg-[var(--background)] p-6 text-[var(--foreground)]">
    <AnimatedText as="h2" animation="glitch" className="text-3xl font-bold">
      Hype fades. The right tool for the job doesn&apos;t.
    </AnimatedText>
  </div>
);
