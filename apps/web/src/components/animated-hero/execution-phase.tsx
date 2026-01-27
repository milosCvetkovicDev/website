'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { Terminal, HudPanel, ProgressBar, ActivityEntry } from './hud-elements';

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

  const [stats, setStats] = useState({
    files: 0,
    tests: 0,
    coverage: 0,
    time: '00:00:00',
  });
  const [visibleLines, setVisibleLines] = useState(0);
  const [comboCount, setComboCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      setStats({ files: 34, tests: 89, coverage: 100, time: '00:14:32' });
      setVisibleLines(codeLines.length);
      setComboCount(12);
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
            // Animate stats
            gsap.to(
              {},
              {
                duration: 3,
                onUpdate: function () {
                  const progress = this.progress();
                  setStats({
                    files: Math.round(progress * 34),
                    tests: Math.round(progress * 89),
                    coverage: Math.round(progress * 100),
                    time: formatTime(progress * 872), // 14:32 in seconds
                  });
                  setVisibleLines(Math.round(progress * codeLines.length));
                  setComboCount(Math.round(progress * 12));
                },
              }
            );
          },
        },
      });

      // Code panel slides in
      tl.fromTo(
        codeRef.current,
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.5 }
      );

      // Stats panel slides in
      tl.fromTo(
        statsRef.current,
        { opacity: 0, x: 30 },
        { opacity: 1, x: 0, duration: 0.5 },
        '<0.1'
      );

      // Activity feed
      tl.fromTo(
        activityRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.4 },
        '+=0.3'
      );

      // Combo counter
      tl.fromTo(
        comboRef.current,
        { opacity: 0, scale: 0.5 },
        { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.7)' },
        '+=0.2'
      );

      // Headline
      tl.fromTo(
        headlineRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5 },
        '+=0.3'
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

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-6 py-24"
    >
      <div className="w-full max-w-5xl">
        {/* Phase Header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-mono rounded-full">
            PHASE 3
          </span>
          <span className="text-sm font-mono text-[var(--muted)]">EXECUTION</span>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Code Streaming */}
          <div ref={codeRef}>
            <Terminal className="h-full">
              <pre className="text-sm leading-relaxed">
                <code>
                  {codeLines.slice(0, visibleLines).map((line, i) => (
                    <span key={i} className={getTokenColor(line.type)}>
                      {line.type === 'newline' ? '\n' : line.content}
                    </span>
                  ))}
                  <span className="inline-block w-2 h-4 bg-[var(--accent)] animate-pulse ml-0.5" />
                </code>
              </pre>
            </Terminal>
          </div>

          {/* Stats HUD */}
          <div ref={statsRef} className="space-y-4">
            <HudPanel title="BUILD STATS">
              <div className="space-y-4">
                <ProgressBar
                  label="FILES"
                  progress={Math.round((stats.files / 34) * 100)}
                />
                <ProgressBar
                  label="TESTS"
                  progress={stats.tests}
                />
                <ProgressBar
                  label="COVERAGE"
                  progress={stats.coverage}
                />
                <div className="flex justify-between items-center pt-2 border-t border-[var(--accent)]/20">
                  <span className="text-xs font-mono text-[var(--muted)]">
                    TIME ELAPSED
                  </span>
                  <span className="font-mono text-[var(--accent)]">{stats.time}</span>
                </div>
              </div>
            </HudPanel>

            {/* Combo Counter */}
            <div
              ref={comboRef}
              className="flex items-center justify-center gap-2 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10"
            >
              <span className="text-3xl font-bold text-yellow-400">x{comboCount}</span>
              <span className="text-sm font-mono text-yellow-400/80">COMMIT STREAK</span>
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div ref={activityRef} className="mt-8">
          <HudPanel title="ACTIVITY LOG">
            <div className="grid md:grid-cols-2 gap-2">
              {activities.map((activity, i) => (
                <ActivityEntry key={i} status="success">
                  <span className="text-[var(--accent)]">{activity.file}</span>
                  <span className="text-[var(--muted)]"> — {activity.desc}</span>
                </ActivityEntry>
              ))}
            </div>
          </HudPanel>
        </div>

        {/* Headline */}
        <div ref={headlineRef} className="mt-16 text-center">
          <h2 className="text-2xl md:text-4xl font-bold mb-3">
            The bottleneck was never my typing speed.
          </h2>
          <p className="text-lg text-[var(--muted)]">
            AI writes the syntax. I make the decisions that matter.
          </p>
        </div>
      </div>
    </section>
  );
}
