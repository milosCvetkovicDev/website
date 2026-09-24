'use client';

import { useEffect, useRef } from 'react';
import { isAlreadyReached, runWithGsap } from './load-gsap';
import { Terminal, HudPanel, QuestItem, TypingCursor } from './hud-elements';
import { AnimatedText } from './animated-text';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

const requirements = [
  { id: 'monitoring', label: 'monitoring', delay: 0 },
  { id: 'autonomous', label: 'autonomous', delay: 0.2 },
  { id: 'pr-creation', label: 'PR creation', delay: 0.4 },
  { id: 'safety', label: 'safety limits', delay: 0.6 },
];

export function DiscoveryPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);
  const questRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    // Reduced motion: the section is shown as it is, with no scroll-driven timeline.
    if (prefersReducedMotion) return;

    // GSAP arrives after hydration (load-gsap.ts); until then the section keeps its
    // server-rendered state. The cleanup covers both orders: before the load it cancels the build,
    // after it reverts. A build that finds the section already in view finishes the entrance at
    // once rather than hide what the visitor is reading (isAlreadyReached).
    let ctx: gsap.Context | undefined;
    const cancelBuild = runWithGsap(({ gsap }) => {
      // The element, read once, never the ref: a soft navigation away from `/` nulls the ref
      // before this effect's cleanup runs (runWithGsap).
      const section = sectionRef.current;
      if (!section) return;
      const reached = isAlreadyReached(section);
      ctx = gsap.context(() => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: 'top center',
            end: 'bottom center',
            toggleActions: 'play none none reverse',
          },
        });

        // Chat message types in
        tl.fromTo(chatRef.current, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5 });

        // Tags extract and float
        const tagElements = tagsRef.current?.querySelectorAll('.requirement-reveal');
        if (tagElements) {
          tl.fromTo(
            tagElements,
            { opacity: 0, scale: 0, x: -50 },
            {
              opacity: 1,
              scale: 1,
              x: 0,
              duration: 0.4,
              stagger: 0.15,
              ease: 'back.out(1.7)',
            },
            '+=0.3',
          );
        }

        // Quest log updates. fromTo() renders its "from" state immediately, before the trigger
        // fires, so the entries must start fully hidden rather than dimmed: dimmed text sits on the
        // page at 2.7:1 until the user scrolls here, which fails WCAG AA (and the Lighthouse audit).
        const questItems = questRef.current?.querySelectorAll('.quest-item');
        if (questItems?.length) {
          tl.fromTo(
            questItems,
            { opacity: 0, x: -8 },
            {
              opacity: 1,
              x: 0,
              duration: 0.3,
              stagger: 0.2,
            },
            '+=0.2',
          );
        }

        // Headline
        tl.fromTo(
          headlineRef.current,
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.5 },
          '+=0.2',
        );

        if (reached) tl.progress(1);
      }, section);
    });

    return () => {
      cancelBuild();
      ctx?.revert();
    };
  }, [prefersReducedMotion]);

  return (
    <section
      ref={sectionRef}
      className="flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="w-full max-w-5xl">
        {/* Phase Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="morse">PHASE 1</AnimatedText>
          </span>
          <AnimatedText animation="highlight" className="font-mono text-sm text-[var(--muted)]">
            DISCOVERY
          </AnimatedText>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Chat Interface */}
          <div ref={chatRef}>
            <Terminal>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <span className="text-[var(--accent-text)]">&gt;</span>
                  <p className="text-[var(--foreground)]">
                    &quot;I&apos;m tired of 3am pages. Build something that fixes itself.&quot;
                  </p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-[var(--status-ok)]">←</span>
                  <p>Interesting. What does &quot;fix itself&quot; mean to you?</p>
                </div>
                <div className="flex gap-3">
                  <span className="text-[var(--accent-text)]">&gt;</span>
                  <p className="text-[var(--foreground)]">
                    Detect the error. Understand it. Open a PR with a fix.
                  </p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-[var(--status-ok)]">←</span>
                  <p>Autonomous code changes need guardrails. What&apos;s the blast radius?</p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-[var(--status-ok)]">←</span>
                  <p>
                    I&apos;m thinking: budget caps, confidence thresholds, human approval...
                    <TypingCursor />
                  </p>
                </div>
              </div>
            </Terminal>
          </div>

          {/* Mind Map / Tags */}
          <div className="space-y-6">
            <HudPanel
              title={<AnimatedText animation="scatter">EXTRACTED REQUIREMENTS</AnimatedText>}
              glow
            >
              <div ref={tagsRef} className="flex flex-wrap gap-2">
                {requirements.map((req, index) => (
                  // The timeline animates this wrapper and the tag inside it keeps the hover: on one
                  // element a transition re-eases every frame GSAP writes, and GSAP's inline
                  // `scale: none` cancels hover:scale-105.
                  <span key={req.id} className="requirement-reveal inline-block">
                    <span
                      className="requirement-tag block cursor-default rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 font-mono text-sm text-[var(--accent-text)] transition-[scale,color,background-color,border-color,box-shadow] duration-300 hover:scale-105 hover:bg-[var(--accent)]/20 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)]"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <span className="mr-1 text-[var(--muted)]">#{index + 1}</span>
                      {req.label}
                    </span>
                  </span>
                ))}
              </div>
            </HudPanel>

            <HudPanel title="QUEST LOG">
              <div ref={questRef} className="space-y-2">
                <div className="quest-item">
                  <QuestItem completed={true}>Requirements captured</QuestItem>
                </div>
                <div className="quest-item">
                  <QuestItem completed={true}>Constraints identified</QuestItem>
                </div>
                <div className="quest-item">
                  <QuestItem completed={true}>Scope locked</QuestItem>
                </div>
                <div className="quest-item">
                  <QuestItem completed={false}>Architecture designed</QuestItem>
                </div>
              </div>
            </HudPanel>
          </div>
        </div>

        {/* Headline */}
        <div ref={headlineRef} className="mt-16 text-center">
          <h2 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="wave">
              Most bugs live in the gap between what you asked for and what you meant.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="typewriter">
              I close that gap before writing a single line of code.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
