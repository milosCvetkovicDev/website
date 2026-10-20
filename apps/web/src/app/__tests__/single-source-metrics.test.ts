/**
 * @vitest-environment node
 *
 * The single-source rule in CLAUDE.md, enforced over the source files themselves.
 *
 * Rows R33 and R34 of the RED manifest, issue #49.
 *
 * `apps/web/src/data` is the single source of truth for project copy and metrics, and pages are
 * supposed to read from it rather than restate any of it. Two families of literal broke that,
 * metric figures (R33) and years of experience (R34). Neither does now: #162 fixed R34 and #207
 * R33, and both rows pass. Both were invisible to any test that renders a component, because a
 * hard-coded `73%` renders exactly as well as a derived one. The only instrument that can see the
 * difference is the source text, so this file reads the modules as files.
 *
 * That makes it a lint rule wearing a test's clothes, and it is deliberately written as one: it reports
 * the file, the line and the literal, so a failure is actionable without opening anything.
 *
 * Two decisions from the task, recorded because they shape what is asserted rather than how:
 *
 * - The About page's `40%` was **not** established. #49 dropped it from the 2021 timeline entry
 *   pending the owner's answer, and sourcing it from the enterprise study through `formatMetric()`
 *   instead would pass here too: this file forbids a hard-coded metric literal rather than asserting
 *   a value, so it stays correct whichever way that decision goes.
 * - Likewise the years of experience. A fixed count and `10+` used to contradict each other; the
 *   assertion is that there is one source, not which number wins. #49 made that source
 *   `data/profile.ts`, which derives the total from the year the career started.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caseStudies, formatMetric } from '@/data/case-studies';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every regular file under `root`, subfolders included, as a path relative to it. Folders are left
 * out even when their name ends like a source file: route folders carry file-like names
 * (`about/index.md/`, #173), and one ending in `.ts` or `.tsx` would pass the callers' filters,
 * reach `readFileSync` and throw `EISDIR` (#189).
 */
function filesUnder(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

/**
 * The page records under `src/data/pages`, one module per route, less `types.ts`, which holds no
 * copy. They are read from the directory, subfolders included, rather than listed, so a record
 * added later is scanned without anyone remembering to add it here. A `.tsx` record counts; a
 * declaration file or a test beside the records does not.
 */
const PAGE_RECORDS = filesUnder(join(SRC, 'data/pages'))
  .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.d.ts') && name !== 'types.ts')
  .filter((name) => !/(^|\/)__tests__\/|\.test\./.test(name))
  .sort()
  .map((name) => `data/pages/${name}`);

/**
 * Every module that renders page copy: the routes, the root layout, the JSON-LD blocks, and the page
 * records. The rest of `src/data` is excluded by construction — it is where these literals belong.
 * The page records are not: they hold the copy #59 moves out of the page modules so a page and its
 * Markdown twin read one source, and the copy is no less page copy for having moved. A metric or a
 * years figure restated there contradicts the data exactly as it did in the page module, so the
 * move must not take it out of these rows' sight.
 */
const COPY_MODULES = [
  'app/layout.tsx',
  'app/page.tsx',
  'app/about/page.tsx',
  'app/blog/page.tsx',
  'app/contact/page.tsx',
  'app/skills/page.tsx',
  'app/work/page.tsx',
  'app/work/[slug]/page.tsx',
  'app/blog/[slug]/page.tsx',
  'app/not-found.tsx',
  'app/error.tsx',
  'components/json-ld.tsx',
  'lib/structured-data.ts',
  'components/animated-hero/hero-content.tsx',
  ...PAGE_RECORDS,
];

/**
 * A years-of-experience figure as copy prints it, and the About fact's label, which names one. The
 * label is a hit because its row comes whole from `data/profile.ts` (R34 below).
 */
const YEAR_PATTERNS = [/\b\d{1,2}\+? years\b/, /\b\d{1,2}\+? yrs\b/, /\bYears shipping code\b/];

/** The About page and the record that holds its copy, one of which quotes the case studies. */
const ABOUT_COPY = ['app/about/page.tsx', 'data/pages/about.ts'];

/**
 * Whether `source` has a value import from the case-study data: a statement at the start of a line,
 * so a comment that names the module does not count, and not `import type`, which brings no figure
 * in. Behaviour (the sentence quoting the study's metric) is `data/pages/__tests__/records.test.ts`'s.
 */
function importsCaseStudies(source: string): boolean {
  return /^import\s+(?!type\s)[^;]*?\sfrom\s+'@\/data\/case-studies';/m.test(source);
}

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
    // R33's import half reads ABOUT_COPY, so its files are proven readable here, and inside the
    // scanned set: a rename would otherwise fail R33 with ENOENT rather than a finding.
    for (const file of ABOUT_COPY) {
      expect(COPY_MODULES, `${file} must be one of the scanned copy modules`).toContain(file);
      const source = readFileSync(join(SRC, file), 'utf8');
      expect(source.length, `${file} must be readable and non-empty`).toBeGreaterThan(100);
    }
    // And a literal that really is there, so the search itself is proven to work.
    expect(findLiterals(['Milos Cvetkovic'], ['app/layout.tsx']).length).toBeGreaterThan(0);
    // And the import check on a module that does import the data, so its pattern is proven too.
    expect(importsCaseStudies(readFileSync(join(SRC, 'data/pages/about.ts'), 'utf8'))).toBe(true);
  });

  it('R33 (#49): no page module restates a caseStudies metric literal, and the About page reads them from the data', () => {
    // Every metric as it renders: `formatMetric` is the one function that turns the data into copy,
    // so its output is exactly the string a page must not contain in source.
    const rendered = caseStudies.map(({ highlight }) => formatMetric(highlight.metric));
    expect(rendered, 'the data file must actually define metrics').not.toHaveLength(0);

    const restated = findLiterals(rendered);
    expect(
      restated.map(describeHit),
      'a page module states a case-study figure itself, so it can contradict /work and the home ' +
        'page without anything failing: read it from the study through formatMetric()',
    ).toEqual([]);

    // The other half of the same row: the About copy has to read the figures from somewhere.
    // Forbidding the literal without requiring the import would be satisfied by deleting the
    // sentence. #59 moved the copy from the page into its record, so either module may hold it.
    const importers = ABOUT_COPY.filter((file) =>
      importsCaseStudies(readFileSync(join(SRC, file), 'utf8')),
    );
    expect(
      importers,
      `the About copy (${ABOUT_COPY.join(' or ')}) must import the case-study data it quotes figures from`,
    ).not.toHaveLength(0);
  });

  it('R34 (#49): no page, layout or JSON-LD module hard-codes a years-of-experience figure', () => {
    // Two numbers used to ship for one fact: a fixed count of years in json-ld.tsx and
    // hero-content.tsx, and `10+` in the About record (data/pages/about.ts), in its description
    // and its "Years shipping code" stat. `data/profile.ts` now derives the total from the year the
    // career started, and every one of those reads it: the stat's whole row, label included, comes
    // from there, which is why the label is still a hit here if a module spells it out again.
    // /skills' per-skill badges (`2+` for AI/LLM Integration) are a different fact, one per skill,
    // and its record holds them as bare figures that the page suffixes, so they are not hits.
    const hits: Hit[] = [];
    for (const file of COPY_MODULES) {
      const source = readFileSync(join(SRC, file), 'utf8');
      source.split('\n').forEach((text, index) => {
        const match = YEAR_PATTERNS.map((pattern) => text.match(pattern)).find(Boolean);
        if (!match) return;
        hits.push({ file, line: index + 1, text: text.trim().slice(0, 110), literal: match[0] });
      });
    }

    expect(
      hits.map(describeHit),
      'the years of experience is stated in several places with different values. Put it in ' +
        'src/data and derive it, so the biography cannot disagree with itself.',
    ).toEqual([]);
  });

  it('R34 beyond the listed modules: only src/data states a years figure', () => {
    // COPY_MODULES names the routes and the JSON-LD; a component or helper added later is not on it.
    // Every module under src outside src/data renders or builds what the pages say, so none of them
    // may state the figure either. src/data is where it belongs: profile.ts derives it.
    const modules = filesUnder(SRC)
      .filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.d.ts'))
      .filter((name) => !/(^|\/)(__tests__|test)\/|\.test\./.test(name))
      .filter((name) => !name.startsWith('data/') || name.startsWith('data/pages/'));
    expect(modules).toContain('components/animated-hero/hero-content.tsx');
    expect(modules).not.toContain('data/profile.ts');

    const hits: Hit[] = [];
    for (const file of modules) {
      readFileSync(join(SRC, file), 'utf8')
        .split('\n')
        .forEach((text, index) => {
          const match = YEAR_PATTERNS.map((pattern) => text.match(pattern)).find(Boolean);
          if (match)
            hits.push({
              file,
              line: index + 1,
              text: text.trim().slice(0, 110),
              literal: match[0],
            });
        });
    }
    expect(hits.map(describeHit), 'read the figure from data/profile.ts').toEqual([]);
  });
});
