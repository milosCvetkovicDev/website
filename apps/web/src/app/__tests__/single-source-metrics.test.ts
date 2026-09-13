/**
 * @vitest-environment node
 *
 * The single-source rule in CLAUDE.md, enforced over the source files themselves.
 *
 * Rows R33 and R34 of the RED manifest, both fixed by #49.
 *
 * `apps/web/src/data` is the single source of truth for project copy and metrics, and pages are
 * supposed to read from it rather than restate any of it. Two families of literal break that today, and
 * both are invisible to any test that renders a component, because a hard-coded `73%` renders exactly
 * as well as a derived one. The only instrument that can see the difference is the source text, so this
 * file reads the modules as files.
 *
 * That makes it a lint rule wearing a test's clothes, and it is deliberately written as one: it reports
 * the file, the line and the literal, so a failure is actionable without opening anything.
 *
 * Two decisions from the task, recorded because they shape what is asserted rather than how:
 *
 * - The About page's `40%` is **not** established. The owner confirms or drops it in #49, so this file
 *   forbids a hard-coded metric literal rather than asserting a value: it stays correct whichever way
 *   that decision goes.
 * - Likewise the years of experience. `13 years`, `10+ years` and `/skills`' own `2+` contradict each
 *   other today; the assertion is that there is one source, not which number wins.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseStudies, formatMetric } from '@/data/case-studies';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every module that renders page copy: the routes, the root layout and the JSON-LD blocks. `src/data`
 * is excluded by construction — it is where these literals belong.
 */
const COPY_MODULES = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/about/page.tsx',
  'app/blog/page.tsx',
  'app/contact/page.tsx',
  'app/skills/page.tsx',
  'app/skills/layout.tsx',
  'app/work/page.tsx',
  'app/work/[slug]/page.tsx',
  'app/not-found.tsx',
  'app/error.tsx',
  'components/json-ld.tsx',
  'components/animated-hero/hero-content.tsx',
];

interface Hit {
  file: string;
  line: number;
  text: string;
  literal: string;
}

/** Every line of every copy module that contains one of `needles`, with the match named. */
function findLiterals(needles: string[], files = COPY_MODULES): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const source = readFileSync(join(SRC, file), 'utf8');
    source.split('\n').forEach((text, index) => {
      for (const literal of needles) {
        if (!text.includes(literal)) continue;
        hits.push({
          file: relative(SRC, join(SRC, file)),
          line: index + 1,
          text: text.trim().slice(0, 110),
          literal,
        });
      }
    });
  }
  return hits;
}

const describeHit = ({ file, line, literal, text }: Hit) =>
  `${file}:${line} hard-codes "${literal}" — ${text}`;

describe('metrics and biography live in one place', () => {
  it('reads the modules it is supposed to be checking', () => {
    // The control. Every assertion below is "this literal does not appear", so a wrong path or an empty
    // read would make all of them pass and the rows would go green without a fix — and for an
    // expected failure, a pass fails the run for a reason that looks like success.
    for (const file of COPY_MODULES) {
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.length, `${file} must be readable and non-empty`).toBeGreaterThan(100);
    }
    // And a literal that really is there, so the search itself is proven to work.
    expect(findLiterals(['Milos Cvetkovic'], ['app/layout.tsx']).length).toBeGreaterThan(0);
  });

  it.fails(
    'R33 (#49): no page module restates a caseStudies metric literal, and the About page reads them from the data',
    () => {
      // Every metric as it renders: `formatMetric` is the one function that turns the data into copy,
      // so its output is exactly the string a page must not contain in source.
      const rendered = caseStudies.map(({ highlight }) => formatMetric(highlight.metric));
      expect(rendered, 'the data file must actually define metrics').not.toHaveLength(0);

      const restated = findLiterals(rendered);
      expect(
        restated.map(describeHit),
        'about/page.tsx:20 and :26 hard-code 73% and 40%, and the module imports no case-study data ' +
          'at all, so the About page can contradict /work and the home page without anything failing.',
      ).toEqual([]);

      // The other half of the same row: the page has to read the figures from somewhere. Forbidding the
      // literal without requiring the import would be satisfied by deleting the sentence.
      const about = readFileSync(join(SRC, 'app/about/page.tsx'), 'utf8');
      expect(
        about,
        'the About page must import the case-study data it quotes figures from',
      ).toMatch(/from '@\/data\/case-studies'/);
    },
  );

  it.fails(
    'R34 (#49): no page, layout or JSON-LD module hard-codes a years-of-experience figure',
    () => {
      // Three different numbers ship today for one fact: `13 years` in layout.tsx:32, :60 and
      // json-ld.tsx:14 and hero-content.tsx:19; `10+ years` in about/page.tsx:6, :70 and
      // skills/layout.tsx:6; and /skills' own `2+` for AI. Whichever is right, it cannot be three.
      const yearPatterns = [
        /\b\d{1,2}\+? years\b/,
        /\b\d{1,2}\+? yrs\b/,
        /\bYears shipping code\b/,
      ];
      const hits: Hit[] = [];
      for (const file of COPY_MODULES) {
        const source = readFileSync(join(SRC, file), 'utf8');
        source.split('\n').forEach((text, index) => {
          const match = yearPatterns.map((pattern) => text.match(pattern)).find(Boolean);
          if (!match) return;
          hits.push({ file, line: index + 1, text: text.trim().slice(0, 110), literal: match[0] });
        });
      }

      expect(
        hits.map(describeHit),
        'the years of experience is stated in seven places with three different values. Put it in ' +
          'src/data and derive it, so the biography cannot disagree with itself.',
      ).toEqual([]);
    },
  );
});
