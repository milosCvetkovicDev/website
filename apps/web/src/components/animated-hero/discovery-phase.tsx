'use client';

import { useEffect, useRef } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal, HudPanel, QuestItem, TypingCursor } from './hud-elements';

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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

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

      // Chat message types in
      tl.fromTo(
        chatRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.5 }
      );

      // Tags extract and float
      const tagElements = tagsRef.current?.querySelectorAll('.requirement-tag');
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
          '+=0.3'
        );
      }

      // Quest log updates
      const questItems = questRef.current?.querySelectorAll('.quest-item');
      if (questItems) {
        tl.fromTo(
          questItems,
          { opacity: 0.3 },
          {
            opacity: 1,
            duration: 0.3,
            stagger: 0.2,
          },
          '+=0.2'
        );
      }

      // Headline
      tl.fromTo(
        headlineRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.2'
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-6 py-24"
    >
      <div className="w-full max-w-5xl">
        {/* Phase Header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-mono rounded-full">
            PHASE 1
          </span>
          <span className="text-sm font-mono text-[var(--muted)]">DISCOVERY</span>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Chat Interface */}
          <div ref={chatRef}>
            <Terminal>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <span className="text-[var(--accent)]">&gt;</span>
                  <p className="text-[var(--foreground)]">
                    &quot;I&apos;m tired of 3am pages. Build something that fixes itself.&quot;
                  </p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-green-400">←</span>
                  <p>Interesting. What does &quot;fix itself&quot; mean to you?</p>
                </div>
                <div className="flex gap-3">
                  <span className="text-[var(--accent)]">&gt;</span>
                  <p className="text-[var(--foreground)]">
                    Detect the error. Understand it. Open a PR with a fix.
                  </p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-green-400">←</span>
                  <p>Autonomous code changes need guardrails. What&apos;s the blast radius?</p>
                </div>
                <div className="flex gap-3 text-[var(--muted)]">
                  <span className="text-green-400">←</span>
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
            <HudPanel title="EXTRACTED REQUIREMENTS">
              <div ref={tagsRef} className="flex flex-wrap gap-2">
                {requirements.map((req) => (
                  <span
                    key={req.id}
                    className="requirement-tag px-3 py-1.5 bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] text-sm font-mono rounded-lg"
                  >
                    {req.label}
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
          <h2 className="text-2xl md:text-4xl font-bold mb-3">
            Most bugs live in the gap between what you asked for and what you meant.
          </h2>
          <p className="text-lg text-[var(--muted)]">
            I close that gap before writing a single line of code.
          </p>
        </div>
      </div>
    </section>
  );
}
