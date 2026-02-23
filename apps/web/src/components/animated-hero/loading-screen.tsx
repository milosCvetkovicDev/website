'use client';

import { useEffect, useRef, useState } from 'react';
import { TmuxBackground } from './tmux-background';
import { AnimatedText } from './animated-text';

const SKILL_TAGS = [
  'TypeScript',
  'React',
  'NestJS',
  'Azure',
  'Terraform',
  'Claude Code',
  'DDD',
  'Kubernetes',
];

const PLAYER_STATS = [
  { label: 'PLAYER', value: 'Milos Cvetkovic' },
  { label: 'CLASS', value: 'Full Stack Engineer & Architect' },
  { label: 'SPEC', value: 'AI-Native Development' },
  { label: 'XP', value: '13 years \u00B7 6 domains \u00B7 3 clouds' },
];

const BREATHE_CSS = `
@keyframes hero-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes hero-scroll-bounce {
  0%, 100% { top: 7px; opacity: 1; }
  50% { top: 20px; opacity: 0.4; }
}
@keyframes hero-status-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

function PlayerCard() {
  return (
    <div
      className="w-full max-w-[420px] mb-8 rounded-lg font-mono text-xs overflow-hidden transition-all duration-300 border bg-white/95 dark:bg-[rgba(22,27,34,0.9)] border-black/[0.08] dark:border-[rgba(90,97,144,0.25)] hover:border-[rgba(139,92,246,0.35)] hover:shadow-[0_0_30px_rgba(139,92,246,0.06)]"
    >
      {/* Header with dots */}
      <div
        className="flex items-center gap-[7px] px-3 py-1.5 bg-[#f5f5f8]/95 dark:bg-[rgba(30,34,48,0.9)] border-b border-black/[0.06] dark:border-[rgba(90,97,144,0.2)]"
      >
        <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f56]" />
        <div className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
        <div className="w-[10px] h-[10px] rounded-full bg-[#27c93f]" />
      </div>

      {/* Body with stats */}
      <div className="px-3 py-[10px]">
        {PLAYER_STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex justify-between items-center px-1.5 py-[3px] -mx-1.5 rounded transition-colors hover:bg-[rgba(139,92,246,0.05)]"
          >
            <span
              className="font-mono uppercase text-[#6b7280] dark:text-[#8890a8]"
              style={{
                fontSize: '10px',
                letterSpacing: '0.06em',
              }}
            >
              {stat.label}
            </span>
            <span
              className="font-mono"
              style={{ fontSize: '12px', color: 'var(--accent)' }}
            >
              {stat.value}
            </span>
          </div>
        ))}

        {/* Status row with divider */}
        <div
          className="flex justify-between items-center px-1.5 py-[3px] -mx-1.5 rounded transition-colors hover:bg-[rgba(139,92,246,0.05)] border-t border-black/[0.06] dark:border-[rgba(90,97,144,0.2)]"
          style={{
            marginTop: '3px',
            paddingTop: '3px',
          }}
        >
          <span
            className="font-mono uppercase text-[#6b7280] dark:text-[#8890a8]"
            style={{
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            STATUS
          </span>
          <span className="font-mono text-[#16a34a] dark:text-[#4ade80]" style={{ fontSize: '12px' }}>
            <span
              className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 bg-[#16a34a] dark:bg-[#4ade80]"
              style={{
                animation: 'hero-status-pulse 2s ease-in-out infinite',
              }}
            />
            Building at Obsidian 22
          </span>
        </div>
      </div>
    </div>
  );
}

function SkillTags() {
  return (
    <div className="flex flex-wrap justify-center gap-1.5 mt-6 max-w-[520px]">
      {SKILL_TAGS.map((tag) => (
        <span
          key={tag}
          className="font-mono px-[9px] py-[3px] rounded-[3px] bg-transparent transition-all duration-200 border border-[rgba(99,102,241,0.2)] dark:border-[rgba(139,92,246,0.15)] text-[rgba(99,102,241,0.7)] dark:text-[rgba(167,139,250,0.6)] hover:border-[rgba(139,92,246,0.4)] hover:text-[#a78bfa]"
          style={{
            fontSize: '10px',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

export function LoadingScreen() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  // Hide scroll indicator when user starts scrolling
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY > 100;
      setShowScrollIndicator(!scrolled);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
    >
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: BREATHE_CSS }} />

      {/* 1. TmuxBackground -- absolute-positioned background */}
      <TmuxBackground />

      {/* 2. Overlay layers */}
      {/* Glow */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background:
            'radial-gradient(ellipse 45% 40% at 50% 45%, rgba(139,92,246,0.06) 0%, transparent 65%)',
          animation: 'hero-breathe 6s ease-in-out infinite',
        }}
      />
      {/* Vignette - light */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] block dark:hidden"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(250,250,250,0.5) 100%)',
        }}
      />
      {/* Vignette - dark */}
      <div
        className="absolute inset-0 pointer-events-none z-[3] hidden dark:block"
        style={{
          background:
            'radial-gradient(ellipse 48% 42% at 50% 50%, transparent 10%, rgba(10,10,10,0.6) 100%)',
        }}
      />
      {/* Top fade - light */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-[4] block dark:hidden"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(250,250,250,0.3))',
        }}
      />
      {/* Top fade - dark */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-[4] hidden dark:block"
        style={{
          height: '8%',
          background: 'linear-gradient(to top, transparent, rgba(10,10,10,0.3))',
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-[4]"
        style={{
          height: '15%',
          background: 'linear-gradient(to bottom, transparent, var(--background))',
        }}
      />

      {/* 3. Content island -- frosted glass wrapper */}
      <div
        className="relative z-10 flex flex-col items-center w-full max-w-[600px] rounded-2xl border bg-white/80 dark:bg-[rgba(10,10,14,0.75)] border-black/[0.08] dark:border-[rgba(90,97,144,0.12)] shadow-[0_0_80px_rgba(0,0,0,0.08)] dark:shadow-[0_0_80px_rgba(0,0,0,0.5)]"
        style={{
          padding: '2.5rem 3rem',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
        }}
      >
        {/* 4a. Compact player card */}
        <PlayerCard />

        {/* 4b. Headline */}
        <div className="text-center max-w-[540px]">
          <h1
            className="font-extrabold mb-3.5 text-[#1e1e2e] dark:text-white"
            style={{
              fontSize: 'clamp(30px, 5.5vw, 50px)',
              lineHeight: 1.12,
              letterSpacing: '-0.025em',
              textShadow: '0 2px 30px rgba(0,0,0,0.9)',
            }}
          >
            <span style={{ whiteSpace: 'nowrap' }}>This happened at 3am.</span>
            <br />
            Nobody woke up.
          </h1>

          {/* 4c. Subtitle */}
          <p className="text-[#6b7280] dark:text-[#b0b4c4]" style={{ fontSize: '16px', lineHeight: 1.6 }}>
            I build systems that inherit chaos and ship clarity.
            <br />
            <span
              className="font-bold"
              style={{
                background: 'linear-gradient(135deg, #a78bfa, #22d3ee)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Scroll to see how.
            </span>
          </p>
        </div>

        {/* 4d. Skill tags */}
        <SkillTags />
      </div>

      {/* 5. Scroll indicator -- fixed, bottom-11, z-20 */}
      <div
        className={`fixed bottom-11 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 transition-opacity duration-300 ${
          showScrollIndicator ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <span
          className="font-mono uppercase tracking-[0.2em]"
          style={{
            fontSize: '9px',
            color: 'rgba(139, 92, 246, 0.7)',
            textShadow: '0 1px 10px rgba(0,0,0,0.9)',
          }}
        >
          <AnimatedText animation="perspective">
            Scroll
          </AnimatedText>
        </span>
        <div
          className="relative w-[22px] h-[36px] rounded-[11px] border-[1.5px] border-[rgba(99,102,241,0.3)] dark:border-[rgba(139,92,246,0.35)] bg-white/60 dark:bg-[rgba(10,10,10,0.6)]"
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[5px] h-[5px] bg-[var(--accent)] rounded-full"
            style={{ animation: 'hero-scroll-bounce 1.5s ease-in-out infinite', top: '7px' }}
          />
        </div>
      </div>
    </section>
  );
}
