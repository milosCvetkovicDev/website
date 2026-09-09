'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal, HudPanel, ActivityEntry } from './hud-elements';
import { AnimatedText } from './animated-text';

const codeLines = [
  { type: 'keyword', content: 'export class', delay: 0 },
  { type: 'class', content: ' ErrorAnalyzer ', delay: 0.1 },
  { type: 'punctuation', content: '{', delay: 0.15 },
  { type: 'newline', content: '', delay: 0.2 },
  { type: 'keyword', content: '  async ', delay: 0.3 },
  { type: 'function', content: 'analyze', delay: 0.35 },
  { type: 'punctuation', content: '(error: Error) {', delay: 0.4 },
  { type: 'newline', content: '', delay: 0.45 },
  { type: 'keyword', content: '    const ', delay: 0.55 },
  { type: 'variable', content: 'context ', delay: 0.6 },
  { type: 'operator', content: '= ', delay: 0.65 },
  { type: 'keyword', content: 'await ', delay: 0.7 },
  { type: 'function', content: 'this.getCodeContext', delay: 0.75 },
  { type: 'punctuation', content: '();', delay: 0.8 },
  { type: 'newline', content: '', delay: 0.85 },
  { type: 'keyword', content: '    return ', delay: 0.95 },
  { type: 'function', content: 'this.claude.diagnose', delay: 1.0 },
  { type: 'punctuation', content: '(error, context);', delay: 1.05 },
  { type: 'newline', content: '', delay: 1.1 },
  { type: 'punctuation', content: '  }', delay: 1.2 },
  { type: 'newline', content: '', delay: 1.25 },
  { type: 'punctuation', content: '}', delay: 1.3 },
];

const activities = [
  { file: 'src/agent/analyzer.ts', desc: 'Error pattern recognition' },
  { file: 'src/agent/fixer.ts', desc: 'Autonomous fix generation' },
  { file: 'src/safety/limits.ts', desc: 'Budget caps, daily limits' },
  { file: 'tests/agent.test.ts', desc: 'Unit test suite' },
];

export function ExecutionPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  // Refs for direct DOM manipulation during animation (avoids React re-renders)
  const filesProgressRef = useRef<HTMLDivElement>(null);
  const filesTextRef = useRef<HTMLSpanElement>(null);
  const testsProgressRef = useRef<HTMLDivElement>(null);
  const testsTextRef = useRef<HTMLSpanElement>(null);
  const coverageProgressRef = useRef<HTMLDivElement>(null);
  const coverageTextRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const comboCountRef = useRef<HTMLSpanElement>(null);
  const codeSpansRef = useRef<(HTMLSpanElement | null)[]>([]);

  // Single state update at the end of animation for final render
  const [animationComplete, setAnimationComplete] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimationComplete(true);
      return;
    }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top center',
          end: 'bottom center',
          toggleActions: 'play none none reverse',
          onEnter: () => {
            // Animate stats using direct DOM manipulation (no React re-renders)
            gsap.to(
              {},
              {
                duration: 3,
                onUpdate: function () {
                  const progress = this.progress();
                  const files = Math.round(progress * 34);
                  const tests = Math.round(progress * 89);
                  const coverage = Math.round(progress * 100);
                  const combo = Math.round(progress * 12);
                  const visibleLineCount = Math.round(progress * codeLines.length);

                  // Direct DOM updates - bypasses React reconciliation
                  if (filesProgressRef.current)
                    filesProgressRef.current.style.width = `${Math.round((files / 34) * 100)}%`;
                  if (filesTextRef.current)
                    filesTextRef.current.textContent = `${Math.round((files / 34) * 100)}%`;
                  if (testsProgressRef.current) testsProgressRef.current.style.width = `${tests}%`;
                  if (testsTextRef.current) testsTextRef.current.textContent = `${tests}%`;
                  if (coverageProgressRef.current)
                    coverageProgressRef.current.style.width = `${coverage}%`;
                  if (coverageTextRef.current) coverageTextRef.current.textContent = `${coverage}%`;
                  if (timeRef.current) timeRef.current.textContent = formatTime(progress * 872);
                  if (comboCountRef.current) comboCountRef.current.textContent = `x${combo}`;

                  // Show/hide code line spans directly
                  codeSpansRef.current.forEach((span, i) => {
                    if (span) {
                      span.style.opacity = i < visibleLineCount ? '1' : '0';
                    }
                  });
                },
                onComplete: () => setAnimationComplete(true),
              },
            );
          },
        },
      });

      // Code panel slides in
      tl.fromTo(codeRef.current, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5 });

      // Stats panel slides in
      tl.fromTo(
        statsRef.current,
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.5 },
        '<0.1',
      );

      // Activity feed
      tl.fromTo(
        activityRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4 },
        '+=0.3',
      );

      // Combo counter
      tl.fromTo(
        comboRef.current,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' },
        '+=0.2',
      );

      // Headline
      tl.fromTo(
        headlineRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.3',
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `00:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  const getTokenColor = (type: string) => {
    switch (type) {
      case 'keyword':
        return 'text-purple-400';
      case 'class':
        return 'text-yellow-300';
      case 'function':
        return 'text-blue-400';
      case 'variable':
        return 'text-[var(--foreground)]';
      case 'operator':
        return 'text-[var(--muted)]';
      case 'punctuation':
        return 'text-[var(--muted)]';
      default:
        return 'text-[var(--foreground)]';
    }
  };

  // Custom progress bar component using refs for direct DOM manipulation
  const AnimatedProgressBar = ({
    label,
    progressRef,
    textRef,
  }: {
    label: string;
    progressRef: React.RefObject<HTMLDivElement | null>;
    textRef: React.RefObject<HTMLSpanElement | null>;
  }) => (
    <div className="group flex items-center gap-3">
      <span className="w-24 shrink-0 font-mono text-xs text-[var(--muted)] transition-colors group-hover:text-[var(--foreground)]">
        {label}
      </span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          ref={progressRef}
          className="h-full rounded-full bg-[var(--accent)] transition-none"
          style={{ width: animationComplete ? '100%' : '0%' }}
        />
      </div>
      <span
        ref={textRef}
        className="w-12 text-right font-mono text-xs text-[var(--muted)] tabular-nums"
      >
        {animationComplete ? '100%' : '0%'}
      </span>
    </div>
  );

  return (
    <section ref={sectionRef} className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-5xl">
        {/* Phase Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="glitch">PHASE 3</AnimatedText>
          </span>
          <AnimatedText animation="stagger-up" className="font-mono text-sm text-[var(--muted)]">
            EXECUTION
          </AnimatedText>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Code Streaming */}
          <div ref={codeRef}>
            <Terminal className="h-full">
              <pre className="text-sm leading-relaxed">
                <code>
                  {codeLines.map((line, i) => (
                    <span
                      key={i}
                      ref={(el) => {
                        codeSpansRef.current[i] = el;
                      }}
                      className={getTokenColor(line.type)}
                      style={{
                        opacity: animationComplete ? 1 : 0,
                        transition: 'none',
                      }}
                    >
                      {line.type === 'newline' ? '\n' : line.content}
                    </span>
                  ))}
                  <span
                    className="ml-0.5 inline-block h-4 w-2 bg-[var(--accent)]"
                    style={{ animation: 'pulse 1s ease-in-out infinite' }}
                  />
                </code>
              </pre>
            </Terminal>
          </div>

          {/* Stats HUD - using refs for direct DOM manipulation */}
          <div ref={statsRef} className="space-y-4">
            <HudPanel title="BUILD STATS">
              <div className="space-y-4">
                <AnimatedProgressBar
                  label="FILES"
                  progressRef={filesProgressRef}
                  textRef={filesTextRef}
                />
                <AnimatedProgressBar
                  label="TESTS"
                  progressRef={testsProgressRef}
                  textRef={testsTextRef}
                />
                <AnimatedProgressBar
                  label="COVERAGE"
                  progressRef={coverageProgressRef}
                  textRef={coverageTextRef}
                />
                <div className="flex items-center justify-between border-t border-[var(--accent)]/20 pt-2">
                  <span className="font-mono text-xs text-[var(--muted)]">TIME ELAPSED</span>
                  <span ref={timeRef} className="font-mono text-[var(--accent-text)]">
                    {animationComplete ? '00:14:32' : '00:00:00'}
                  </span>
                </div>
              </div>
            </HudPanel>

            {/* Combo Counter */}
            <div
              ref={comboRef}
              className="flex items-center justify-center gap-2 rounded-lg border border-[var(--status-warn)]/30 bg-[var(--status-warn)]/10 p-4"
            >
              <span ref={comboCountRef} className="text-3xl font-bold text-[var(--status-warn)]">
                {animationComplete ? 'x12' : 'x0'}
              </span>
              <span className="font-mono text-sm text-[var(--status-warn)]">COMMIT STREAK</span>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div ref={activityRef} className="mt-8">
          <HudPanel title="ACTIVITY LOG">
            <div className="grid gap-2 md:grid-cols-2">
              {activities.map((activity, i) => (
                <ActivityEntry key={i} status="success">
                  <span className="text-[var(--accent-text)]">{activity.file}</span>
                  <span className="text-[var(--muted)]"> — {activity.desc}</span>
                </ActivityEntry>
              ))}
            </div>
          </HudPanel>
        </div>

        {/* Headline */}
        <div ref={headlineRef} className="mt-16 text-center">
          <h2 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="scatter">
              The bottleneck was never my typing speed.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="blur-reveal">
              AI writes the syntax. I make the decisions that matter.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
