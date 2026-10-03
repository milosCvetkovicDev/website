import Link from 'next/link';
import {
  coreSkills,
  differentiators,
  skillsCopy,
  skillsRecord,
  toolkitTable,
  type CoreSkill,
  type RichParagraph,
} from '@/data/pages/skills';
import { WebPageJsonLd } from '@/components/json-ld';
import { DataTable } from '@/components/data-table';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  title: skillsRecord.title,
  description: skillsRecord.summary,
  path: skillsRecord.path,
});

/** A paragraph from the record, its emphasis set as the page sets it. */
function Rich({ paragraph }: { paragraph: RichParagraph }) {
  if (typeof paragraph === 'string') return paragraph;
  return paragraph.map((piece, index) => {
    if (typeof piece === 'string') return piece;
    switch (piece.tag) {
      case 'em':
        return <em key={index}>{piece.text}</em>;
      case 'strong':
        return (
          <strong key={index} className="text-[var(--foreground)]">
            {piece.text}
          </strong>
        );
      default: {
        // The types rule this out; a new tag must get its own markup rather than fall into another's.
        const unknown: never = piece.tag;
        throw new Error(`Rich: no markup for the emphasis tag "${String(unknown)}"`);
      }
    }
  });
}

function SkillBar({ name, years, level, context }: CoreSkill) {
  return (
    <div className="group rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 transition-all hover:border-[var(--accent)]/50">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold transition-colors group-hover:text-[var(--accent-text)]">
          {name}
        </h3>
        <span className="rounded bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--accent-text)]">
          {years} years
        </span>
      </div>
      <div className="mb-3">
        {/* A fixed level within a known range, so a meter: a progressbar would announce a task
            under way. The value text makes every screen reader say the value as "95%" rather than
            a bare number. The name repeats the level on purpose: a reader without meter support
            announces the name alone. A meter's children are presentational, so the fill inside
            is decoration. */}
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--border)]"
          role="meter"
          aria-valuenow={level}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${level}%`}
          aria-label={`${name} self-assessed proficiency: ${level}%`}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/70 transition-all duration-500"
            style={{ width: `${level}%` }}
          />
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">{context}</p>
    </div>
  );
}

export default function SkillsPage() {
  return (
    <div className="py-16 md:py-24">
      <WebPageJsonLd path={skillsRecord.path} name={skillsRecord.title} />
      <div className="mx-auto max-w-4xl px-6">
        {/* Header */}
        <div className="mb-16">
          <p className="mb-4 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {skillsCopy.eyebrow}
          </p>
          <h1 className="mb-6 text-3xl font-bold md:text-4xl lg:text-5xl">Tools are just tools.</h1>
          <p className="max-w-2xl text-xl text-[var(--muted)]">
            <Rich paragraph={skillsCopy.intro} />
          </p>
        </div>

        {/* Core skills with depth: the note says what the bars and years are before they show */}
        <section className="mb-20">
          <h2 className="mb-3 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {skillsCopy.headings.coreSkills}
          </h2>
          <p className="mb-6 text-sm text-[var(--muted)]">{skillsCopy.coreSkillsNote}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {coreSkills.map((skill) => (
              <SkillBar key={skill.name} {...skill} />
            ))}
          </div>
        </section>

        {/* What makes it different */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {skillsCopy.headings.differentiators}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {differentiators.map((diff) => (
              <div
                key={diff.title}
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5"
              >
                <h3 className="mb-2 font-semibold">{diff.title}</h3>
                <p className="text-sm text-[var(--muted)]">{diff.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The full toolkit, as a table (#58): on a phone each category stacks into a block. */}
        <section className="mb-20">
          <h2 className="mb-6 font-mono text-sm tracking-wider text-[var(--accent-text)] uppercase">
            {skillsCopy.headings.toolkit}
          </h2>
          <DataTable {...toolkitTable} />
        </section>

        {/* Learning philosophy */}
        <section className="mb-20">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8">
            <h2 className="mb-4 text-xl font-semibold">{skillsCopy.staySharp.heading}</h2>
            <div className="space-y-4 text-[var(--muted)]">
              {skillsCopy.staySharp.paragraphs.map((paragraph, index) => (
                <p key={index}>
                  <Rich paragraph={paragraph} />
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center">
          <p className="mb-6 text-[var(--muted)]">{skillsCopy.cta.prompt}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href={skillsCopy.cta.work.href}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <span>{skillsCopy.cta.work.text}</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </Link>
            <a
              href={skillsCopy.cta.linkedIn.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-6 py-3 font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent)]/10"
            >
              <span>{skillsCopy.cta.linkedIn.text}</span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
