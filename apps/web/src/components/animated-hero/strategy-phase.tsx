'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { HudPanel, NotificationToast } from './hud-elements';
import { AnimatedText } from './animated-text';

const techChoices = [
  {
    category: 'Runtime',
    choice: 'Bun',
    icon: '⚡',
    reason: 'Cold starts matter when errors are on fire',
    selected: true,
  },
  {
    category: 'Framework',
    choice: 'Elysia',
    icon: '🔷',
    reason: 'Type errors caught at compile time, not 3am',
    selected: true,
  },
  {
    category: 'AI Core',
    choice: 'Claude Agent SDK',
    icon: '🧠',
    reason: 'The part that actually thinks',
    selected: true,
  },
  {
    category: 'Monitoring',
    choice: 'Azure Log Analytics',
    icon: '👁',
    reason: 'See everything. Miss nothing.',
    selected: true,
  },
];

const synergies = [
  { combo: 'Bun + Elysia', bonus: '40% smaller bundle' },
  { combo: 'Claude SDK + GitHub API', bonus: 'autonomous PRs' },
];

export function StrategyPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const techTreeRef = useRef<HTMLDivElement>(null);
  const synergiesRef = useRef<HTMLDivElement>(null);
  const architectureRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top center',
          end: 'bottom center',
          toggleActions: 'play none none reverse',
        },
      });

      // Tech tree items appear
      const techItems = techTreeRef.current?.querySelectorAll('.tech-item');
      if (techItems) {
        tl.fromTo(
          techItems,
          { opacity: 0, x: -30, scale: 0.9 },
          {
            opacity: 1,
            x: 0,
            scale: 1,
            duration: 0.4,
            stagger: 0.15,
            ease: 'power2.out',
          },
        );
      }

      // Synergy bonuses pop in
      const synergyItems = synergiesRef.current?.querySelectorAll('.synergy-item');
      if (synergyItems) {
        tl.fromTo(
          synergyItems,
          { opacity: 0, scale: 0.8, y: 10 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            duration: 0.3,
            stagger: 0.2,
            ease: 'back.out(1.7)',
          },
          '+=0.2',
        );
      }

      // Architecture diagram
      tl.fromTo(
        architectureRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.2',
      );

      // SVG lines draw
      const lines = architectureRef.current?.querySelectorAll('.arch-line');
      if (lines) {
        lines.forEach((line) => {
          const length = (line as SVGPathElement).getTotalLength?.() || 100;
          gsap.set(line, { strokeDasharray: length, strokeDashoffset: length });
          tl.to(line, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' }, '-=0.3');
        });
      }

      // Headline
      tl.fromTo(
        headlineRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.2',
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-5xl">
        {/* Phase Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="perspective">PHASE 2</AnimatedText>
          </span>
          <AnimatedText animation="scramble" className="font-mono text-sm text-[var(--muted)]">
            STRATEGY
          </AnimatedText>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Tech Tree */}
          <div ref={techTreeRef} className="space-y-3">
            <h3 className="mb-4 font-mono text-xs tracking-wider text-[var(--muted)] uppercase">
              TECH TREE
            </h3>
            {techChoices.map((tech) => (
              <div
                key={tech.category}
                className="tech-item group hover-lift relative flex cursor-default items-center gap-4 overflow-hidden rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4"
              >
                {/* Selection indicator */}
                <div className="absolute top-0 bottom-0 left-0 w-1 bg-[var(--accent)] transition-all duration-300 group-hover:w-1.5" />

                <span className="text-2xl transition-transform duration-300 group-hover:scale-125">
                  {tech.icon}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] tracking-wider text-[var(--muted)] uppercase">
                      {tech.category}
                    </span>
                    <span className="text-[var(--accent-text)] transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                    <span className="font-semibold">{tech.choice}</span>
                  </div>
                  <p className="text-sm text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]">
                    {tech.reason}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[var(--status-ok)] transition-transform duration-300 group-hover:scale-110">
                    ✓
                  </span>
                  <span
                    className="font-mono text-[10px] text-[var(--status-ok)] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  >
                    LOCKED
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Synergies & Architecture */}
          <div className="space-y-6">
            <div ref={synergiesRef} className="space-y-2">
              <h3 className="mb-3 font-mono text-xs tracking-wider text-[var(--muted)] uppercase">
                SYNERGIES DETECTED
              </h3>
              {synergies.map((synergy) => (
                <div key={synergy.combo} className="synergy-item">
                  <NotificationToast type="success">
                    <span className="flex items-center gap-2">
                      <span>+</span>
                      <span>
                        {synergy.combo} = <strong>{synergy.bonus}</strong>
                      </span>
                    </span>
                  </NotificationToast>
                </div>
              ))}
            </div>

            {/* Simple Architecture Diagram */}
            <div ref={architectureRef}>
              <HudPanel title="ARCHITECTURE">
                <div className="relative h-48">
                  <svg
                    viewBox="0 0 300 180"
                    className="h-full w-full"
                    fill="none"
                    stroke="currentColor"
                  >
                    {/* Boxes */}
                    <rect
                      x="10"
                      y="70"
                      width="80"
                      height="40"
                      rx="4"
                      className="fill-[var(--accent)]/10 stroke-[var(--accent)]"
                    />
                    <text
                      x="50"
                      y="95"
                      textAnchor="middle"
                      className="fill-[var(--foreground)] font-mono text-[10px]"
                    >
                      Azure Logs
                    </text>

                    <rect
                      x="110"
                      y="70"
                      width="80"
                      height="40"
                      rx="4"
                      className="fill-[var(--accent)]/10 stroke-[var(--accent)]"
                    />
                    <text
                      x="150"
                      y="95"
                      textAnchor="middle"
                      className="fill-[var(--foreground)] font-mono text-[10px]"
                    >
                      Claude Agent
                    </text>

                    <rect
                      x="210"
                      y="70"
                      width="80"
                      height="40"
                      rx="4"
                      className="fill-[var(--accent)]/10 stroke-[var(--accent)]"
                    />
                    <text
                      x="250"
                      y="95"
                      textAnchor="middle"
                      className="fill-[var(--foreground)] font-mono text-[10px]"
                    >
                      GitHub API
                    </text>

                    {/* Connecting Lines */}
                    <path
                      d="M90 90 L110 90"
                      className="arch-line stroke-[var(--accent)]"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />
                    <path
                      d="M190 90 L210 90"
                      className="arch-line stroke-[var(--accent)]"
                      strokeWidth="2"
                      markerEnd="url(#arrowhead)"
                    />

                    {/* Labels */}
                    <text
                      x="100"
                      y="80"
                      textAnchor="middle"
                      className="fill-[var(--muted)] font-mono text-[8px]"
                    >
                      errors
                    </text>
                    <text
                      x="200"
                      y="80"
                      textAnchor="middle"
                      className="fill-[var(--muted)] font-mono text-[8px]"
                    >
                      PRs
                    </text>

                    {/* Arrow marker definition */}
                    <defs>
                      <marker
                        id="arrowhead"
                        markerWidth="10"
                        markerHeight="7"
                        refX="9"
                        refY="3.5"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 3.5, 0 7" className="fill-[var(--accent)]" />
                      </marker>
                    </defs>
                  </svg>
                </div>
              </HudPanel>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div ref={headlineRef} className="mt-16 text-center">
          <h2 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="magnetic">
              Hype fades. The right tool for the job doesn&apos;t.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="elastic">
              I pick technologies that solve the problem, not pad my resume.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
