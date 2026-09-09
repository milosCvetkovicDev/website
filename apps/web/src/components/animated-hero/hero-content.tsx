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
    <div className="mb-8 w-full max-w-[420px] overflow-hidden rounded-lg border border-black/[0.08] bg-white/95 font-mono text-xs transition-all duration-300 hover:border-[rgba(139,92,246,0.35)] hover:shadow-[0_0_30px_rgba(139,92,246,0.06)] dark:border-[rgba(90,97,144,0.25)] dark:bg-[rgba(22,27,34,0.9)]">
      {/* Header with dots */}
      <div
        className="flex items-center gap-[7px] border-b border-black/[0.06] bg-[#f5f5f8]/95 px-3 py-1.5 dark:border-[rgba(90,97,144,0.2)] dark:bg-[rgba(30,34,48,0.9)]"
        aria-hidden="true"
      >
        <div className="h-[10px] w-[10px] rounded-full bg-[#ff5f56]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#ffbd2e]" />
        <div className="h-[10px] w-[10px] rounded-full bg-[#27c93f]" />
      </div>

      {/* Body with stats - semantic definition list */}
      <dl className="px-3 py-[10px]">
        {PLAYER_STATS.map((stat) => (
          <div
            key={stat.label}
            className="-mx-1.5 flex items-center justify-between rounded px-1.5 py-[3px] transition-colors hover:bg-[rgba(139,92,246,0.05)]"
          >
            <dt
              className="font-mono text-[#6b7280] uppercase dark:text-[#8890a8]"
              style={{
                fontSize: '10px',
                letterSpacing: '0.06em',
              }}
            >
              {stat.label}
            </dt>
            <dd className="font-mono" style={{ fontSize: '12px', color: 'var(--accent-text)' }}>
              {stat.value}
            </dd>
          </div>
        ))}

        {/* Status row with divider */}
        <div
          className="-mx-1.5 flex items-center justify-between rounded border-t border-black/[0.06] px-1.5 py-[3px] transition-colors hover:bg-[rgba(139,92,246,0.05)] dark:border-[rgba(90,97,144,0.2)]"
          style={{
            marginTop: '3px',
            paddingTop: '3px',
          }}
        >
          <dt
            className="font-mono text-[#6b7280] uppercase dark:text-[#8890a8]"
            style={{
              fontSize: '10px',
              letterSpacing: '0.06em',
            }}
          >
            STATUS
          </dt>
          <dd className="font-mono text-[#16a34a] dark:text-[#4ade80]" style={{ fontSize: '12px' }}>
            <span
              className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[#16a34a] dark:bg-[#4ade80]"
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
    <ul
      className="mx-0 mt-6 mb-0 flex max-w-[520px] list-none flex-wrap justify-center gap-1.5 p-0"
      aria-label="Technical skills"
    >
      {SKILL_TAGS.map((tag) => (
        <li
          key={tag}
          className="rounded-[3px] border border-[rgba(99,102,241,0.2)] bg-transparent px-[9px] py-[3px] font-mono text-[rgba(99,102,241,0.7)] transition-all duration-200 hover:border-[rgba(139,92,246,0.4)] hover:text-[#a78bfa] dark:border-[rgba(139,92,246,0.15)] dark:text-[rgba(167,139,250,0.6)]"
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
      className="relative z-10 flex w-full max-w-[600px] flex-col items-center rounded-2xl border border-black/[0.08] bg-white/80 shadow-[0_0_80px_rgba(0,0,0,0.08)] dark:border-[rgba(90,97,144,0.12)] dark:bg-[rgba(10,10,14,0.75)] dark:shadow-[0_0_80px_rgba(0,0,0,0.5)]"
      style={{
        padding: '2.5rem 3rem',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      {/* Player card */}
      <PlayerCard />

      {/* Headline */}
      <div className="max-w-[540px] text-center">
        <h1
          className="mb-3.5 font-extrabold text-[#1e1e2e] dark:text-white"
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
          Milos Cvetkovic, Senior Full Stack Engineer specializing in AI-native development,
          TypeScript, React, and cloud architecture
        </p>

        {/* Subtitle */}
        <p
          className="text-[#6b7280] dark:text-[#b0b4c4]"
          style={{ fontSize: '16px', lineHeight: 1.6 }}
        >
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
