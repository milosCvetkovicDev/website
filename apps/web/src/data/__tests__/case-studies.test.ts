/**
 * These are pure data assertions with no DOM in them, and building a jsdom window is the most
 * expensive thing in a test file that does not need one -- importing the module alone costs about
 * two seconds in every worker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { isPublishableContentDate } from '@/lib/content-date';
import {
  adjacentCaseStudies,
  caseStudies,
  caseStudyMetricScope,
  formatMetric,
  formatMetricScope,
  getCaseStudy,
  oneLine,
  type MetricDefinition,
} from '../case-studies';
import { OWNER_TODO, ownerTodo, unfilledOwnerFields } from '../owner-todo';

/**
 * Fixture text, not anyone's claim: the real basis lines are #49's and the real windows and methods
 * are the owner's.
 */
const BASIS = 'What the figure counted, against its baseline';
const METHOD = 'How the figure was produced';
const DEFINED: MetricDefinition = {
  state: 'defined',
  window: { from: '2025-03-01', to: '2025-08-31' },
  method: METHOD,
};
const UNFILLED: MetricDefinition = { state: OWNER_TODO };
const WINDOW_SENTENCE = 'Measured from 1 March 2025 to 31 August 2025.';

/** Closing quotes and brackets, which may follow a sentence's stop. */
const CLOSERS = `["'’”)\\]]`;

/**
 * What an honest scope line looks like: nothing, or a non-empty string with no placeholder marker,
 * no `undefined`, `null` or `NaN`, no line break or doubled space, no sentence that is empty or
 * starts with a stop, and no full stop added after a sentence that had already ended. Honest
 * punctuation passes: `?!`, an ellipsis, a stop inside closing quotes.
 */
function expectHonestScope(scope: string | null, context: string): void {
  if (scope === null) return;
  expect(scope.length, context).toBeGreaterThan(0);
  expect(scope, context).toBe(scope.trim());
  expect(scope, context).not.toContain(OWNER_TODO);
  expect(scope, context).not.toMatch(/\bundefined\b|\bnull\b|\bNaN\b/);
  expect(scope, context).not.toMatch(/[^\S ]| {2}/);
  expect(scope, context).not.toMatch(/^[.!?…,;:]/);
  expect(scope, context).not.toMatch(new RegExp(`[.!?…]${CLOSERS}* [.!?…,;:]`));
  expect(scope, context).not.toMatch(
    new RegExp(`(?:[.!?…]${CLOSERS}+|[!?…,;:]|(?:^|[^.])\\.)\\.(?= |$)`),
  );
}

/**
 * What is wrong with a measurement window on the day `now` falls in: each end must be a real day
 * that has begun (the same rule the content dates follow), and the window must not end before it
 * starts. An empty list when nothing is.
 */
function windowProblems({ from, to }: { from: string; to: string }, now: Date): string[] {
  const problems: string[] = [];
  for (const [end, day] of [
    ['from', from],
    ['to', to],
  ] as const) {
    if (!isPublishableContentDate(day, now)) {
      problems.push(`${end} ${day} is not a real day on or before today`);
    }
  }
  // Order means nothing between strings that are not both days, so it is judged only once they are.
  if (problems.length === 0 && to < from) problems.push(`to ${to} is before from ${from}`);
  return problems;
}

describe('formatMetric', () => {
  it('renders a whole number with a suffix', () => {
    expect(formatMetric({ value: 73, suffix: '%', label: 'errors resolved autonomously' })).toBe(
      '73%',
    );
  });

  it('renders a prefix, decimals and a suffix together', () => {
    expect(formatMetric({ value: 1.25, prefix: '~', suffix: 'x', decimals: 1, label: 'x' })).toBe(
      '~1.3x',
    );
  });

  it('renders a bare number when there is no prefix or suffix', () => {
    expect(formatMetric({ value: 12, label: 'services' })).toBe('12');
  });

  // `not.toThrow()` alone would also pass for a formatMetric that returned the empty string, so the
  // rendered strings are asserted. The clamp is to 0..20, a cap chosen inside the 0..100 that
  // `toFixed` accepts: past 20 digits a double shows only rounding noise.
  it('clamps an out-of-range decimals value instead of throwing', () => {
    expect(formatMetric({ value: 5, decimals: -1, label: 'x' })).toBe('5');
    expect(formatMetric({ value: 5, decimals: -1000, label: 'x' })).toBe('5');
    expect(formatMetric({ value: 5, decimals: 500, label: 'x' })).toBe(`5.${'0'.repeat(20)}`);
    expect(formatMetric({ value: 5, decimals: Infinity, label: 'x' })).toBe(`5.${'0'.repeat(20)}`);
    expect(formatMetric({ value: 5, decimals: -Infinity, label: 'x' })).toBe('5');
    // The sign of the value survives a clamped count.
    expect(formatMetric({ value: -5, decimals: 500, label: 'x' })).toBe(`-5.${'0'.repeat(20)}`);
    // A fractional count renders its whole digits: 2.9 gives two, not the three rounding would.
    expect(formatMetric({ value: 5, decimals: 2.9, label: 'x' })).toBe('5.00');
    // A NaN count renders no decimals rather than throwing: `toFixed` reads NaN as 0 digits.
    expect(formatMetric({ value: 5, decimals: Number.NaN, label: 'x' })).toBe('5');
  });

  it('does not print NaN or Infinity', () => {
    expect(formatMetric({ value: Number.NaN, suffix: '%', label: 'x' })).toBe('—');
    expect(formatMetric({ value: Number.POSITIVE_INFINITY, suffix: '%', label: 'x' })).toBe('—');
  });
});

describe('caseStudies', () => {
  it('has unique slugs', () => {
    expect(new Set(caseStudies.map((study) => study.slug)).size).toBe(caseStudies.length);
  });

  it('gives every study a URL-safe slug and a non-empty title and description', () => {
    // The slug is a path segment and part of the card's description id, which aria-describedby
    // reads as a space-separated list; the title is the card link's whole accessible name and the
    // description its accessible description.
    for (const { slug, title, description } of caseStudies) {
      expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(title.trim(), slug).not.toBe('');
      expect(description.trim(), slug).not.toBe('');
    }
  });

  it('dates every study with real calendar dates, none in the future, updated no earlier than published', () => {
    // The live clock is deliberate: "not in the future" is a statement about the day the suite runs.
    // Google's publication-dates guidance forbids a future date, and the page now shows these.
    const now = new Date();
    for (const { slug, publishedAt, updatedAt } of caseStudies) {
      for (const date of [publishedAt, updatedAt]) {
        expect(date, slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), slug).toBe(date);
        expect(
          isPublishableContentDate(date, now),
          `${slug}: ${date} is not a real day on or before today`,
        ).toBe(true);
      }
      expect(updatedAt >= publishedAt, `${slug}: updatedAt before publishedAt`).toBe(true);
    }
  });

  it('states every headline metric as a finite number', () => {
    for (const study of caseStudies) {
      expect(Number.isFinite(study.highlight.metric.value)).toBe(true);
      expect(study.highlight.metric.label.length).toBeGreaterThan(0);
    }
  });

  it("labels the self-healing agent's figure as what the owner decided it measures (#49)", () => {
    // The owner decided on 2026-09-11 that 73% counts production errors resolved autonomously; the
    // label used to say "faster resolution", a different claim about the same number.
    const metric = getCaseStudy('self-healing-agent')?.highlight.metric;
    expect(metric?.label).toBe('errors resolved autonomously');
  });

  it('gives every headline metric a basis: one line of what it counted, against what', () => {
    // The case-study page prints it under the figure as it stands (#49), so it is copy: something
    // to read, on one line. A placeholder marker would be served there, so there is none.
    for (const { slug, highlight } of caseStudies) {
      const { basis } = highlight.metric;
      expect(typeof basis, slug).toBe('string');
      expect(basis, slug).toBe(basis.trim());
      expect(basis, slug).toMatch(/\p{L}/u);
      expect(basis, slug).not.toMatch(/[\r\n]/);
      expect(basis, slug).not.toContain(OWNER_TODO);
      // "Against what baseline" is half of the contract: a basis names the whole it is a fraction
      // of ("out of") or the state it is compared with ("against"), or it is only a description.
      expect(basis, slug).toMatch(/\b(?:against|out of)\b/);
      // The scope sentence opens with the basis verbatim, which the page and twin specs search for:
      // a finished sentence on one line with no run of spaces, so neither formatMetricScope's full
      // stop (which replaces a trailing comma, semicolon or colon) nor its whitespace collapse
      // rewrites it once the owner defines the window and method.
      expect(basis, slug).toBe(oneLine(basis));
      expect(basis, slug).toMatch(new RegExp(`[.!?…]${CLOSERS}*$`));
    }
  });

  it('states every headline figure with a scope that opens with its basis, the one the page and twin print', () => {
    for (const study of caseStudies) {
      const { basis } = study.highlight.metric;
      const scope = caseStudyMetricScope(study);
      expect(scope.startsWith(basis), study.slug).toBe(true);
      // And it would still open with it verbatim once the owner defines the window and method.
      const defined = caseStudyMetricScope({ ...study, metricDefinition: DEFINED });
      expect(defined, study.slug).toBe(`${basis} ${WINDOW_SENTENCE} ${METHOD}.`);
    }
  });

  it('states every defined metric over two real days in order, and registers every other one', () => {
    // The live clock, as for the content dates above: "not in the future" is about the day the
    // suite runs, and isPublishableContentDate judges it against UTC instants, not the runner's zone.
    // A defined study must also come out of formatMetricScope with its window and method: a blank
    // or bare-punctuation method would otherwise drop off the page silently, its register row gone.
    // A study whose definition is still the owner's must have its row (owner-todo.test.ts checks
    // the row's deadline). Either way every study is asserted on, so the test cannot pass empty.
    const now = new Date();
    caseStudies.forEach(({ slug, metricDefinition }, index) => {
      const field = `case-studies.${index}.metricDefinition`;
      if (metricDefinition.state === 'defined') {
        expect(windowProblems(metricDefinition.window, now), slug).toEqual([]);
        expect(formatMetricScope(null, metricDefinition), slug).toMatch(/^Measured (?:on|from) /);
      } else {
        expect(
          unfilledOwnerFields.map((row) => row.field),
          `${slug} is unfilled, so it needs a register row`,
        ).toContain(field);
      }
    });
  });

  it("names, in each metric definition's register row, the figure of the study the row points at", () => {
    // The gate keys a row by the study's index, so a reordered or inserted study would leave a row
    // whose text describes another study's figure. Its figure, as formatMetric renders it, pins it.
    const rows = unfilledOwnerFields.filter(({ field }) => field.endsWith('.metricDefinition'));
    expect(rows.length).toBeGreaterThan(0);
    for (const { field, why } of rows) {
      const index = /^case-studies\.(\d+)\.metricDefinition$/.exec(field)?.[1];
      const study = index === undefined ? undefined : caseStudies[Number(index)];
      expect(study, `${field} points at no study`).toBeDefined();
      if (!study) continue;
      const { metric } = study.highlight;
      expect(why, `${field} (${study.slug})`).toContain(`${formatMetric(metric)} ${metric.label}`);
    }
  });

  it("gives every study a scope line that is honest, or none, while #49's basis is absent or present", () => {
    for (const { slug, metricDefinition } of caseStudies) {
      expectHonestScope(formatMetricScope(null, metricDefinition), `${slug}, no basis`);
      expectHonestScope(formatMetricScope(BASIS, metricDefinition), `${slug}, with a basis`);
    }
  });
});

describe('windowProblems, the check the defined windows above go through', () => {
  const now = new Date('2026-09-28T12:00:00Z');

  it('accepts a window of two real days in order, one day long included', () => {
    expect(windowProblems({ from: '2025-03-01', to: '2025-08-31' }, now)).toEqual([]);
    expect(windowProblems({ from: '2026-09-28', to: '2026-09-28' }, now)).toEqual([]);
  });

  it('refuses a window that ends before it starts', () => {
    expect(windowProblems({ from: '2025-08-31', to: '2025-03-01' }, now)).toEqual([
      'to 2025-03-01 is before from 2025-08-31',
    ]);
  });

  it('refuses an end in the future', () => {
    expect(windowProblems({ from: '2026-09-01', to: '2026-10-01' }, now)).toEqual([
      'to 2026-10-01 is not a real day on or before today',
    ]);
  });

  it('refuses an end that is not a real YYYY-MM-DD day', () => {
    expect(windowProblems({ from: '2025-02-30', to: '2025-03-01' }, now)).toEqual([
      'from 2025-02-30 is not a real day on or before today',
    ]);
    expect(windowProblems({ from: '2025-03-01', to: '2025-08-31T00:00:00' }, now)).toEqual([
      'to 2025-08-31T00:00:00 is not a real day on or before today',
    ]);
    expect(windowProblems({ from: OWNER_TODO, to: '2025-08-31' }, now)).toEqual([
      `from ${OWNER_TODO} is not a real day on or before today`,
    ]);
  });
});

describe('formatMetricScope', () => {
  it("says nothing when there is no basis and the definition is still the owner's", () => {
    expect(formatMetricScope(null, UNFILLED)).toBeNull();
  });

  it("returns #49's basis alone while only the definition is unfilled", () => {
    expect(formatMetricScope(BASIS, UNFILLED)).toBe(BASIS);
    expect(formatMetricScope(`${BASIS}.`, UNFILLED)).toBe(`${BASIS}.`);
  });

  it('puts a basis or a method on one line, with its ends trimmed, on either path', () => {
    const padded = `  What the figure\ncounted,  against\n\nits baseline \n`;
    expect(formatMetricScope(padded, UNFILLED)).toBe(BASIS);
    expect(
      formatMetricScope(padded, { ...DEFINED, method: ' How the figure\n was  produced\n' }),
    ).toBe(`${BASIS}. ${WINDOW_SENTENCE} ${METHOD}.`);
  });

  it('says "on" rather than "from X to X" for a window one day long', () => {
    expect(
      formatMetricScope(null, { ...DEFINED, window: { from: '2025-03-01', to: '2025-03-01' } }),
    ).toBe(`Measured on 1 March 2025. ${METHOD}.`);
  });

  it('joins the basis, then the window, then the method', () => {
    expect(formatMetricScope(BASIS, DEFINED)).toBe(`${BASIS}. ${WINDOW_SENTENCE} ${METHOD}.`);
  });

  it('gives the window and the method alone while there is no basis', () => {
    expect(formatMetricScope(null, DEFINED)).toBe(`${WINDOW_SENTENCE} ${METHOD}.`);
  });

  it('writes the window through the locale-free content-date formatter', () => {
    const definition: MetricDefinition = {
      state: 'defined',
      window: { from: '2024-12-31', to: '2025-01-01' },
      method: METHOD,
    };
    expect(formatMetricScope(null, definition)).toBe(
      `Measured from 31 December 2024 to 1 January 2025. ${METHOD}.`,
    );
  });

  it('keeps the stop a basis or a method already ends with, rather than doubling it', () => {
    expect(formatMetricScope(`${BASIS}.`, { ...DEFINED, method: `${METHOD}.` })).toBe(
      `${BASIS}. ${WINDOW_SENTENCE} ${METHOD}.`,
    );
    expect(formatMetricScope(`${BASIS}?`, { ...DEFINED, method: `${METHOD}!` })).toBe(
      `${BASIS}? ${WINDOW_SENTENCE} ${METHOD}!`,
    );
  });

  it.each([
    ['a closing quote', `${METHOD} "p50."`],
    ['a closing bracket', `${METHOD} (median.)`],
    ['an ellipsis', `${METHOD}…`],
    ['a question mark and an exclamation mark', `${METHOD}?!`],
    ['three full stops', `${METHOD}...`],
  ])('adds no stop after a method that already ends a sentence with %s', (_, method) => {
    expect(formatMetricScope(null, { ...DEFINED, method })).toBe(`${WINDOW_SENTENCE} ${method}`);
  });

  it('closes a basis or a method ending in a comma, semicolon or colon with a full stop instead', () => {
    expect(formatMetricScope(`${BASIS}:`, { ...DEFINED, method: `${METHOD} ;` })).toBe(
      `${BASIS}. ${WINDOW_SENTENCE} ${METHOD}.`,
    );
    expect(formatMetricScope(null, { ...DEFINED, method: `${METHOD},` })).toBe(
      `${WINDOW_SENTENCE} ${METHOD}.`,
    );
  });

  it('treats a basis with no letter or digit in it as none', () => {
    for (const bare of ['.', '...', '…', ' ? ']) {
      expect(formatMetricScope(bare, UNFILLED), JSON.stringify(bare)).toBeNull();
      expect(formatMetricScope(bare, DEFINED), JSON.stringify(bare)).toBe(
        `${WINDOW_SENTENCE} ${METHOD}.`,
      );
    }
  });

  it('treats a blank basis as none, so it never prints an empty part', () => {
    for (const blank of ['', '   ', '\n']) {
      expect(formatMetricScope(blank, UNFILLED), JSON.stringify(blank)).toBeNull();
      expect(formatMetricScope(blank, DEFINED), JSON.stringify(blank)).toBe(
        `${WINDOW_SENTENCE} ${METHOD}.`,
      );
    }
  });

  it('leaves out a basis that still carries a placeholder marker', () => {
    const marked = `Counted ${ownerTodo('what the figure counted')}`;
    expect(formatMetricScope(marked, UNFILLED)).toBeNull();
    expect(formatMetricScope(marked, DEFINED)).toBe(`${WINDOW_SENTENCE} ${METHOD}.`);
  });

  it.each<[string, MetricDefinition]>([
    [
      'a window that ends before it starts',
      { ...DEFINED, window: { from: '2025-08-31', to: '2025-03-01' } },
    ],
    [
      'a start that is not a real day',
      { ...DEFINED, window: { from: '2025-02-30', to: '2025-08-31' } },
    ],
    [
      'an end that is a timestamp',
      { ...DEFINED, window: { from: '2025-03-01', to: '2025-08-31T00:00:00Z' } },
    ],
    ['an end that is the marker', { ...DEFINED, window: { from: '2025-03-01', to: OWNER_TODO } }],
    ['a blank method', { ...DEFINED, method: '  ' }],
    ['a method that is only punctuation', { ...DEFINED, method: ' . ' }],
    [
      'a method with a placeholder marker',
      { ...DEFINED, method: ownerTodo('how it was measured') },
    ],
  ])('states no window or method from %s: the basis alone, or nothing', (_, definition) => {
    expect(formatMetricScope(BASIS, definition)).toBe(BASIS);
    expect(formatMetricScope(null, definition)).toBeNull();
  });

  it('never emits a marker, an empty part, undefined or null, whatever it is given', () => {
    const bases = [
      null,
      '',
      ' ',
      '.',
      '…',
      BASIS,
      `${BASIS}.`,
      `  ${BASIS} \n`,
      `What the figure\n\ncounted,  against its baseline`,
      `${BASIS};`,
      `${BASIS} "in all."`,
      `Counted ${ownerTodo('the count')}`,
    ];
    const definitions: MetricDefinition[] = [
      UNFILLED,
      DEFINED,
      { ...DEFINED, window: { from: '2025-03-01', to: '2025-03-01' } },
      { ...DEFINED, method: '' },
      { ...DEFINED, method: '?' },
      { ...DEFINED, method: `${METHOD}.` },
      { ...DEFINED, method: `\n  How the figure\nwas  produced ` },
      { ...DEFINED, method: `${METHOD}:` },
      { ...DEFINED, method: `${METHOD} (median.)` },
      { ...DEFINED, method: `${METHOD}…` },
      { ...DEFINED, method: ownerTodo('the method') },
      { ...DEFINED, window: { from: '', to: '' } },
      { ...DEFINED, window: { from: '2025-08-31', to: '2025-03-01' } },
    ];
    for (const basis of bases) {
      for (const definition of definitions) {
        const context = `${JSON.stringify(basis)} with ${JSON.stringify(definition)}`;
        expectHonestScope(formatMetricScope(basis, definition), context);
      }
    }
  });

  it('makes pnpm typecheck refuse a read of the window or the method before state is narrowed', () => {
    // Vitest does not type-check; `pnpm typecheck` does, and it fails on a @ts-expect-error that
    // expects nothing. So the two directives below are the proof that an unnarrowed read does not
    // compile, and the narrowed read after them that the fields are there once `state` says so.
    const read = (definition: MetricDefinition): unknown[] => {
      // @ts-expect-error -- `window` exists only once `state` is 'defined'
      const unnarrowedWindow: unknown = definition.window;
      // @ts-expect-error -- `method` exists only once `state` is 'defined'
      const unnarrowedMethod: unknown = definition.method;
      return definition.state === 'defined'
        ? [definition.window.from, definition.window.to, definition.method]
        : [unnarrowedWindow, unnarrowedMethod];
    };
    expect(read(DEFINED)).toEqual(['2025-03-01', '2025-08-31', METHOD]);
    expect(read(UNFILLED)).toEqual([undefined, undefined]);
  });
});

describe('caseStudyMetricScope', () => {
  const [study] = caseStudies;
  if (!study) throw new Error('there is a case study to build fixtures from');
  const withBasis = (basis: string, metricDefinition: MetricDefinition) => ({
    ...study,
    highlight: { ...study.highlight, metric: { ...study.highlight.metric, basis } },
    metricDefinition,
  });

  it("is formatMetricScope's sentence of the study's basis and definition", () => {
    expect(caseStudyMetricScope(withBasis(BASIS, UNFILLED))).toBe(BASIS);
    expect(caseStudyMetricScope(withBasis(BASIS, DEFINED))).toBe(
      `${BASIS}. ${WINDOW_SENTENCE} ${METHOD}.`,
    );
  });

  it('throws, naming the study, when the basis has nothing to state, even with a defined window', () => {
    for (const definition of [UNFILLED, DEFINED]) {
      for (const basis of ['', '   ', '—.', ownerTodo('the basis')]) {
        expect(
          () => caseStudyMetricScope(withBasis(basis, definition)),
          `${JSON.stringify(basis)} with ${definition.state}`,
        ).toThrow(`caseStudyMetricScope(${study.slug}): the headline figure has no basis to state`);
      }
    }
  });
});

describe('adjacentCaseStudies', () => {
  it('links every study to the studies either side of it, never to itself', () => {
    const count = caseStudies.length;
    caseStudies.forEach(({ slug }, index) => {
      const adjacent = adjacentCaseStudies(slug);
      expect(adjacent.map(({ study }) => study.slug)).not.toContain(slug);
      expect(adjacent).toEqual([
        { direction: 'previous', study: caseStudies[(index - 1 + count) % count] },
        { direction: 'next', study: caseStudies[(index + 1) % count] },
      ]);
    });
    expect(count, 'with three studies, previous and next are the other two').toBe(3);
  });

  it('reaches every study from some other study, so none is left without an inbound link', () => {
    const linked = new Set(
      caseStudies.flatMap(({ slug }) => adjacentCaseStudies(slug).map(({ study }) => study.slug)),
    );
    expect([...linked].sort()).toEqual(caseStudies.map(({ slug }) => slug).sort());
  });

  it('returns nothing for a slug it does not know', () => {
    expect(adjacentCaseStudies('no-such-study')).toEqual([]);
  });
});
