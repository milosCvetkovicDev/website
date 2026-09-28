/**
 * The owner-todo gate: the checker's own cases, then the live run over every registered source, then
 * the one-spelling rule over the files under `src`.
 *
 * `pnpm --filter web exec vitest run src/data/__tests__/owner-todo.test.ts` is the command the sibling
 * tasks cite for this gate, and `pnpm test` runs it in CI. Nothing in this file spells the marker
 * out: every fixture goes through `OWNER_TODO` or `ownerTodo(...)`, which is what lets the last test
 * scan this file along with every other one.
 *
 * @vitest-environment node
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '../case-studies';
import {
  MAX_EXPIRY_DAYS,
  OWNER_TODO,
  findOwnerTodoProblems,
  ownerTodo,
  unfilledOwnerFields,
  type IsoDay,
  type OwnerTodoSource,
  type UnfilledOwnerField,
} from '../owner-todo';

/**
 * Modules under `src` that import owner-todo only to narrow or omit a placeholder, never to leave
 * one that could be served, so they are no source: a renderer, or a unit test whose fixtures ship
 * nowhere. The path under `src`, and why.
 */
const RENDERS_ONLY: Record<string, string> = {
  'data/__tests__/case-studies.test.ts':
    'a unit test: builds unfilled fixtures to prove formatMetricScope leaves them out, and ships nowhere',
};

/**
 * Every source the live gate walks, as one array literal. A task that leaves a placeholder somewhere
 * new joins the gate with one entry here and one `unfilledOwnerFields` row per unfilled field; a
 * generated artifact joins with the string its builder returns as the `value`. A module under `src`
 * that imports owner-todo has to be imported by this file (for an entry here) or named in
 * `RENDERS_ONLY`: the 'every importer' test below fails otherwise.
 */
const OWNER_TODO_SOURCES: OwnerTodoSource[] = [{ id: 'case-studies', value: caseStudies }];

const NOW = new Date('2026-09-28T12:00:00Z');
const IN_DATE = '2026-10-31';

// `expires` is typed as a day; the cast lets the fixtures below hand the checker what the compiler
// would refuse, since the checker is the guard for a row the compiler did not see.
const row = (field: string, expires: string = IN_DATE): UnfilledOwnerField => ({
  field,
  why: 'the owner supplies it',
  expires: expires as IsoDay,
});

describe('OWNER_TODO and ownerTodo', () => {
  it('spells the marker the way the served-output assertion and the sibling tasks expect', () => {
    // Built from its parts so that this file does not spell it out and the scan below stays exact.
    expect(OWNER_TODO).toBe(['OWNER', 'TODO'].join('-'));
  });

  it('wraps a hint in the marker, so the hint says what the owner has to supply', () => {
    expect(ownerTodo('the measurement window')).toBe(`${OWNER_TODO}(the measurement window)`);
  });

  it.each([
    ['empty', ''],
    ['blank', '  '],
    ['holding a closing bracket', 'the window (UTC)'],
    ['holding an opening bracket', 'the window ('],
    ['on two lines', 'the window\nand the method'],
  ])('refuses a hint that is %s, since a finding names the gap by it', (_, hint) => {
    expect(() => ownerTodo(hint)).toThrow('the hint says what the owner supplies');
  });
});

/**
 * Each placeholder shape the checker has to find, with the same source once the owner has filled it
 * and the `<source>.<path>` a finding must name. Both detection modes (a typed `state` union and a
 * marker inside a sentence) and both source kinds (a nested data module and a bare generated string).
 */
const PLACEHOLDERS: {
  shape: string;
  unfilled: OwnerTodoSource;
  filled: OwnerTodoSource;
  field: string;
}[] = [
  {
    shape: 'a typed union in a nested data module',
    unfilled: {
      id: 'studies',
      value: [
        { slug: 'a', definition: { state: 'defined', method: 'Median of 40 incidents' } },
        { slug: 'b', definition: { state: OWNER_TODO } },
      ],
    },
    filled: {
      id: 'studies',
      value: [
        { slug: 'a', definition: { state: 'defined', method: 'Median of 40 incidents' } },
        { slug: 'b', definition: { state: 'defined', method: 'CI minutes, June against May' } },
      ],
    },
    field: 'studies.1.definition',
  },
  {
    shape: 'a marker inside a sentence in a nested data module',
    unfilled: {
      id: 'about',
      value: { facts: [{ label: 'Teams led', basis: `Counted from ${ownerTodo('the source')}.` }] },
    },
    filled: {
      id: 'about',
      value: { facts: [{ label: 'Teams led', basis: 'Counted from the org charts.' }] },
    },
    field: 'about.facts.0.basis#the source',
  },
  {
    shape: 'a marker inside a bare generated string',
    unfilled: { id: 'llms-txt', value: `# Site\n\n> ${ownerTodo('the summary')}\n` },
    filled: { id: 'llms-txt', value: '# Site\n\n> A portfolio.\n' },
    field: 'llms-txt#the summary',
  },
  {
    shape: 'a typed union that is the whole source',
    unfilled: { id: 'availability', value: { state: OWNER_TODO } },
    filled: { id: 'availability', value: { state: 'open', from: '2026-11-01' } },
    field: 'availability',
  },
];

describe('findOwnerTodoProblems', () => {
  it('finds nothing in sources with no placeholder and an empty register', () => {
    const clean: OwnerTodoSource[] = [
      // Near misses: the parts of the marker apart, and a `state` that is some other string.
      { id: 'notes', value: { todo: 'TODO: owner', state: 'OWNER', list: ['a', 1, null, true] } },
      { id: 'text', value: 'A generated body with nothing left to fill.' },
      { id: 'empty', value: undefined },
    ];
    expect(findOwnerTodoProblems(clean, [], NOW)).toEqual([]);
  });

  describe.each(PLACEHOLDERS)('$shape', ({ unfilled, filled, field }) => {
    it('reports the unfilled field when no register row covers it', () => {
      expect(findOwnerTodoProblems([unfilled], [], NOW)).toEqual([
        { kind: 'unregistered', field, message: expect.stringContaining(field) },
      ]);
    });

    it('passes while a register row covers it and its deadline is ahead', () => {
      expect(findOwnerTodoProblems([unfilled], [row(field)], NOW)).toEqual([]);
    });

    it('reports the row as stale once the value is filled', () => {
      expect(findOwnerTodoProblems([filled], [row(field)], NOW)).toEqual([
        { kind: 'stale', field, message: expect.stringContaining(field) },
      ]);
    });

    it('passes once the value is filled and the row is gone', () => {
      expect(findOwnerTodoProblems([filled], [], NOW)).toEqual([]);
    });

    it('reports the row once its deadline has passed', () => {
      expect(findOwnerTodoProblems([unfilled], [row(field, '2026-09-01')], NOW)).toEqual([
        { kind: 'expiry', field, message: expect.stringContaining(field) },
      ]);
    });
  });

  describe('an expires that is no deadline, or one already reached', () => {
    const { unfilled, field } = PLACEHOLDERS[0];

    it('reports a row with no expires at all', () => {
      // The type requires `expires`, so only a cast can leave it out: this is the checker's own
      // guard, for a row the compiler did not see.
      const missing = { field, why: 'the owner supplies it' } as UnfilledOwnerField;
      expect(findOwnerTodoProblems([unfilled], [missing], NOW)).toEqual([
        { kind: 'expiry', field, message: expect.stringContaining(field) },
      ]);
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['the sentinel itself', OWNER_TODO],
      ['a marker asking for a date', ownerTodo('pick a date')],
      ['not a date', 'end of October'],
      ['a day that does not exist', '2026-02-30'],
      ['a month that does not exist', '2026-13-01'],
      ['a date in another order', '31-10-2026'],
      ['a timestamp rather than a day', '2026-10-31T00:00:00Z'],
      ['today', '2026-09-28'],
      ['yesterday', '2026-09-27'],
      [`more than ${MAX_EXPIRY_DAYS} days ahead`, '2027-09-30'],
      ['a date that switches the gate off for good', '9999-12-31'],
    ])('reports an expires that is %s', (_, expires) => {
      expect(findOwnerTodoProblems([unfilled], [row(field, expires)], NOW)).toEqual([
        { kind: 'expiry', field, message: expect.stringContaining(field) },
      ]);
    });

    it('types expires as a day, so pnpm typecheck refuses the obvious mistakes first', () => {
      const day: IsoDay = '2026-10-31';
      // @ts-expect-error: words are no day.
      const words: IsoDay = 'end of October';
      // @ts-expect-error: nor is the marker.
      const marker: IsoDay = OWNER_TODO;
      expect([day, words, marker]).toHaveLength(3);
    });

    it('passes an expires of tomorrow', () => {
      expect(findOwnerTodoProblems([unfilled], [row(field, '2026-09-29')], NOW)).toEqual([]);
    });

    it(`passes an expires exactly ${MAX_EXPIRY_DAYS} days ahead, the furthest a deadline may be`, () => {
      // 2026-09-28 plus 366 days.
      expect(findOwnerTodoProblems([unfilled], [row(field, '2027-09-29')], NOW)).toEqual([]);
    });

    it('counts the day in UTC, so a deadline ends at midnight UTC', () => {
      const lastSecond = new Date('2026-09-28T23:59:59Z');
      const midnight = new Date('2026-09-29T00:00:00Z');
      expect(findOwnerTodoProblems([unfilled], [row(field, '2026-09-29')], lastSecond)).toEqual([]);
      expect(findOwnerTodoProblems([unfilled], [row(field, '2026-09-29')], midnight)).toEqual([
        { kind: 'expiry', field, message: expect.stringContaining(field) },
      ]);
    });

    it('checks the deadline of a stale row too', () => {
      const { filled } = PLACEHOLDERS[0];
      expect(
        findOwnerTodoProblems([filled], [row(field, '2026-09-01')], NOW).map(({ kind }) => kind),
      ).toEqual(['stale', 'expiry']);
    });
  });

  it('reports a typed union once, at the union, not again at the state inside it', () => {
    const source: OwnerTodoSource = {
      id: 'studies',
      value: [{ definition: { state: OWNER_TODO, hint: ownerTodo('the window') } }],
    };
    expect(findOwnerTodoProblems([source], [], NOW).map(({ field }) => field)).toEqual([
      'studies.0.definition',
    ]);
  });

  it('reports a marker in an object key as the field that key names', () => {
    const source: OwnerTodoSource = {
      id: 'facts',
      value: { rows: { [ownerTodo('a label')]: 'a value' } },
    };
    expect(findOwnerTodoProblems([source], [], NOW).map(({ field }) => field)).toEqual([
      `facts.rows.${ownerTodo('a label')}`,
    ]);
  });

  it('walks a value that refers back to itself without looping', () => {
    const cyclic: Record<string, unknown> = { basis: ownerTodo('the basis') };
    cyclic.self = cyclic;
    expect(
      findOwnerTodoProblems([{ id: 'cyclic', value: cyclic }], [], NOW).map(({ field }) => field),
    ).toEqual(['cyclic.basis#the basis']);
  });

  it('reports every problem across several sources, each naming its own source', () => {
    const [typed, marked, generated] = PLACEHOLDERS;
    const problems = findOwnerTodoProblems(
      [typed.unfilled, marked.unfilled, generated.filled],
      [row(marked.field, '2026-09-28'), row(generated.field), row('studies.9.definition')],
      NOW,
    );
    expect(problems.map(({ kind, field }) => [kind, field])).toEqual([
      ['unregistered', 'studies.1.definition'],
      ['expiry', 'about.facts.0.basis#the source'],
      ['stale', 'llms-txt#the summary'],
      ['stale', 'studies.9.definition'],
    ]);
  });

  it('names every marker in a string on its own, so each needs its own row and deadline', () => {
    const body = `# Site\n\n> ${ownerTodo('the summary')}\n\n${ownerTodo('the facts')}\n`;
    const source: OwnerTodoSource = { id: 'llms-txt', value: body };
    expect(findOwnerTodoProblems([source], [], NOW).map(({ field }) => field)).toEqual([
      'llms-txt#the summary',
      'llms-txt#the facts',
    ]);
    // A row for one marker does not cover a marker added next to it.
    expect(
      findOwnerTodoProblems([source], [row('llms-txt#the summary')], NOW).map(({ kind, field }) => [
        kind,
        field,
      ]),
    ).toEqual([['unregistered', 'llms-txt#the facts']]);
  });

  it('names a bare marker in a string at the string itself', () => {
    expect(
      findOwnerTodoProblems([{ id: 'profile', value: { availability: OWNER_TODO } }], [], NOW).map(
        ({ field }) => field,
      ),
    ).toEqual(['profile.availability']);
  });

  it('reports a union whose state is a marker with a hint at the union', () => {
    const source: OwnerTodoSource = {
      id: 'studies',
      value: [{ window: { state: ownerTodo('x') } }],
    };
    expect(findOwnerTodoProblems([source], [], NOW).map(({ field }) => field)).toEqual([
      'studies.0.window',
    ]);
  });

  it('brackets a key that would make its path ambiguous, so two fields never share a name', () => {
    const source: OwnerTodoSource = {
      id: 'links',
      value: { 'a.b': ownerTodo('one'), a: { b: ownerTodo('two') }, 'c#d': ownerTodo('three') },
    };
    expect(findOwnerTodoProblems([source], [], NOW).map(({ field }) => field)).toEqual([
      'links["a.b"]#one',
      'links.a.b#two',
      'links["c#d"]#three',
    ]);
  });

  it('leaves a Date alone, since it cannot hold a marker', () => {
    const source: OwnerTodoSource = { id: 'dates', value: { at: new Date('2026-09-28') } };
    expect(findOwnerTodoProblems([source], [], NOW)).toEqual([]);
  });

  class Card {
    constructor(readonly text: string) {}
  }

  it.each([
    ['a function', () => ownerTodo('the copy'), 'is a function'],
    ['a Map', new Map([['copy', ownerTodo('the copy')]]), 'is a Map'],
    ['a Set', new Set([ownerTodo('the copy')]), 'is a Set'],
    ['a class instance', new Card(ownerTodo('the copy')), 'is a Card'],
    ['an object with a symbol key', { [Symbol('copy')]: ownerTodo('the copy') }, 'symbol keys'],
  ])('reports %s as unwalkable instead of passing it unseen', (_, value, says) => {
    expect(findOwnerTodoProblems([{ id: 'copy', value: { body: value } }], [], NOW)).toEqual([
      { kind: 'unwalkable', field: 'copy.body', message: expect.stringContaining(says) },
    ]);
  });

  it('reports a second row for one field', () => {
    const { unfilled, field } = PLACEHOLDERS[0];
    expect(
      findOwnerTodoProblems([unfilled], [row(field), row(field, '2026-11-30')], NOW).map(
        ({ kind, field }) => [kind, field],
      ),
    ).toEqual([['duplicate', field]]);
  });

  it.each([
    ['used twice', ['studies', 'studies'], 'used twice'],
    ['empty', [''], 'one non-empty path segment'],
    ['more than one path segment', ['case.studies'], 'one non-empty path segment'],
  ])('reports a source id that is %s', (_, ids, says) => {
    const sources = ids.map((id) => ({ id, value: 'nothing to fill' }));
    expect(findOwnerTodoProblems(sources, [], NOW)).toEqual([
      { kind: 'source', field: ids.at(-1), message: expect.stringContaining(says) },
    ]);
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['a placeholder', ownerTodo('why')],
  ])('reports a row whose why is %s', (_, why) => {
    const { unfilled, field } = PLACEHOLDERS[0];
    expect(findOwnerTodoProblems([unfilled], [{ ...row(field), why }], NOW)).toEqual([
      { kind: 'why', field, message: expect.stringContaining(field) },
    ]);
  });

  it('says so when a row names no source at all, rather than calling the value filled', () => {
    const { unfilled } = PLACEHOLDERS[0];
    expect(findOwnerTodoProblems([unfilled], [row('studeis.1.definition')], NOW)).toEqual([
      { kind: 'unregistered', field: 'studies.1.definition', message: expect.any(String) },
      {
        kind: 'stale',
        field: 'studeis.1.definition',
        message: expect.stringContaining('names no source the gate walks ("studeis")'),
      },
    ]);
  });

  it('refuses a now that is not a valid Date, instead of judging deadlines against it', () => {
    expect(() => findOwnerTodoProblems([], [], new Date('not a date'))).toThrow(
      'now is not a valid Date',
    );
  });
});

describe('the live register', () => {
  it('covers every unfilled field in the registered sources, each with its deadline ahead', () => {
    // The real clock, deliberately, and never `vi.setSystemTime`: a row's `expires` is the owner's
    // deadline, and a frozen clock would switch it off. Once a deadline passes, this test is red on
    // every branch until the owner fills the value or moves the date in a pull request.
    const problems = findOwnerTodoProblems(OWNER_TODO_SOURCES, unfilledOwnerFields, new Date());
    expect(problems.map(({ message }) => message)).toEqual([]);
  });
});

const WEB = fileURLToPath(new URL('../../..', import.meta.url));
const SRC = path.join(WEB, 'src');
const THIS_FILE = fileURLToPath(import.meta.url);

/**
 * Every file under `dir`, whatever its extension, as `grep -r` would read it. A symlink or anything
 * else that is neither a file nor a directory fails the scan by name rather than being skipped.
 */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(file);
    if (entry.isFile()) return [file];
    throw new Error(`${file} is neither a file nor a directory: the scan reads real files only`);
  });
}

const posix = (from: string, file: string) => path.relative(from, file).split(path.sep).join('/');

/** The file an import specifier in `from` resolves to, or null for a package. */
function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null;
  const candidates = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((ext) => base + ext);
  return candidates.find((file) => existsSync(file)) ?? base;
}

/** Every module specifier `file` imports, statically, dynamically or as a re-export. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)].map(([, s]) => s);
}

describe('one spelling', () => {
  it('spells the marker out in owner-todo.ts and in no other file under src or public', () => {
    // An exact byte search: it catches the literal typed by hand, which is the mistake it exists
    // for, not a marker assembled from pieces at run time. The e2e served-output check is the
    // backstop for that.
    const needle = Buffer.from(OWNER_TODO);
    const spelled = ['src', 'public']
      .flatMap((dir) => filesUnder(path.join(WEB, dir)))
      .filter((file) => readFileSync(file).includes(needle))
      .map((file) => posix(WEB, file));
    expect(
      spelled,
      'write a typed placeholder as { state: OWNER_TODO } and a marker in prose as ownerTodo(hint)',
    ).toEqual(['src/data/owner-todo.ts']);
  });
});

describe('every importer', () => {
  it('walks every module that imports owner-todo, or names it as a renderer', () => {
    // A module that uses ownerTodo(...) or OWNER_TODO spells no literal, so only this link keeps it
    // from leaving a placeholder that the live gate never walks. It is joined by importing it here
    // for an OWNER_TODO_SOURCES entry (an unused import fails lint), or by a RENDERS_ONLY reason.
    const register = path.join(SRC, 'data', 'owner-todo.ts');
    const importers = filesUnder(SRC)
      .filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(file) && file !== THIS_FILE)
      .filter((file) => importsOf(file).some((spec) => resolveImport(file, spec) === register))
      .map((file) => posix(SRC, file));
    const walked = new Set(
      importsOf(THIS_FILE).flatMap((spec) => {
        const file = resolveImport(THIS_FILE, spec);
        return file === null ? [] : [posix(SRC, file)];
      }),
    );
    expect(
      importers.filter((file) => !walked.has(file) && !(file in RENDERS_ONLY)),
      'import the module here and add it to OWNER_TODO_SOURCES, or name it in RENDERS_ONLY',
    ).toEqual([]);
    expect(
      Object.keys(RENDERS_ONLY).filter((file) => !importers.includes(file)),
      'a RENDERS_ONLY entry no longer imports owner-todo: delete it',
    ).toEqual([]);
  });
});
