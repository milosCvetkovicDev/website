// NO 'use client' directive — this is a server component
// All SEO-critical hero content is rendered as static HTML on the server

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

function PlayerCard() {
  return (
    <div
      className="w-full max-w-[420px] mb-8 rounded-lg font-mono text-xs overflow-hidden transition-all duration-300 border bg-white/95 dark:bg-[rgba(22,27,34,0.9)] border-black/[0.08] dark:border-[rgba(90,97,144,0.25)] hover:border-[rgba(139,92,246,0.35)] hover:shadow-[0_0_30px_rgba(139,92,246,0.06)]"
    >
      {/* Header with dots */}
      <div
        className="flex items-center gap-[7px] px-3 py-1.5 bg-[#f5f5f8]/95 dark:bg-[rgba(30,34,48,0.9)] border-b border-black/[0.06] dark:border-[rgba(90,97,144,0.2)]"
        aria-hidden="true"
      >
        <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f56]" />
        <div className="w-[10px] h-[10px] rounded-full bg-[#ffbd2e]" />
        <div className="w-[10px] h-[10px] rounded-full bg-[#27c93f]" />
      </div>

      {/* Body with stats - semantic definition list */}
      <dl className="px-3 py-[10px]">
        {PLAYER_STATS.map((stat) => (
          <div
            key={stat.label}
            className="flex justify-between items-center px-1.5 py-[3px] -mx-1.5 rounded transition-colors hover:bg-[rgba(139,92,246,0.05)]"
          >
            <dt
              className="font-mono uppercase text-[#6b7280] dark:text-[#8890a8]"
              style={{
                fontSize: '10px',
                letterSpacing: '0.06em',
              }}
            >
              {stat.label}
            </dt>
            <dd
              className="font-mono"
              style={{ fontSize: '12px', color: 'var(--accent)' }}
            >
              {stat.value}
            </dd>
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
          <dt
            className="font-mono uppercase text-[#6b7280] dark:text-[#8890a8]"
            style={{
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            STATUS
          </dt>
          <dd className="font-mono text-[#16a34a] dark:text-[#4ade80]" style={{ fontSize: '12px' }}>
            <span
              className="inline-block w-[7px] h-[7px] rounded-full mr-1.5 bg-[#16a34a] dark:bg-[#4ade80]"
              style={{
                animation: 'hero-status-pulse 2s ease-in-out infinite',
              }}
              aria-hidden="true"
            />
            Building at Obsidian 22
          </dd>
        </div>
      </dl>
    </div>
  );
}

function SkillTags() {
  return (
    <ul className="flex flex-wrap justify-center gap-1.5 mt-6 max-w-[520px] list-none p-0 mx-0 mb-0" aria-label="Technical skills">
      {SKILL_TAGS.map((tag) => (
        <li
          key={tag}
          className="font-mono px-[9px] py-[3px] rounded-[3px] bg-transparent transition-all duration-200 border border-[rgba(99,102,241,0.2)] dark:border-[rgba(139,92,246,0.15)] text-[rgba(99,102,241,0.7)] dark:text-[rgba(167,139,250,0.6)] hover:border-[rgba(139,92,246,0.4)] hover:text-[#a78bfa]"
          style={{
            fontSize: '10px',
          }}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}

export function HeroContent() {
  return (
    <div
      className="relative z-10 flex flex-col items-center w-full max-w-[600px] rounded-2xl border bg-white/80 dark:bg-[rgba(10,10,14,0.75)] border-black/[0.08] dark:border-[rgba(90,97,144,0.12)] shadow-[0_0_80px_rgba(0,0,0,0.08)] dark:shadow-[0_0_80px_rgba(0,0,0,0.5)]"
      style={{
        padding: '2.5rem 3rem',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      {/* Player card */}
      <PlayerCard />

      {/* Headline */}
      <div className="text-center max-w-[540px]">
        <h1
          className="font-extrabold mb-3.5 text-[#1e1e2e] dark:text-white"
          style={{
            fontSize: 'clamp(30px, 5.5vw, 50px)',
            lineHeight: 1.12,
            letterSpacing: '-0.025em',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>This happened at 3am.</span>
          <br />
          Nobody woke up.
        </h1>
        <p className="sr-only">
          Milos Cvetkovic, Senior Full Stack Engineer specializing in AI-native development, TypeScript, React, and cloud architecture
        </p>

        {/* Subtitle */}
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

      {/* Skill tags */}
      <SkillTags />
    </div>
  );
}
