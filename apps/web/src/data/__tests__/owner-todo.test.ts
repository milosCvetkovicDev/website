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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '../case-studies';
import {
  OWNER_TODO,
  findOwnerTodoProblems,
  ownerTodo,
  unfilledOwnerFields,
  type OwnerTodoSource,
  type UnfilledOwnerField,
} from '../owner-todo';

/**
 * Every source the live gate walks, as one array literal. A task that leaves a placeholder somewhere
 * new joins the gate with one entry here and one `unfilledOwnerFields` row per unfilled field; a
 * generated artifact joins with the string its builder returns as the `value`.
 */
const OWNER_TODO_SOURCES: OwnerTodoSource[] = [{ id: 'case-studies', value: caseStudies }];

const NOW = new Date('2026-09-28T12:00:00Z');
const IN_DATE = '2026-10-31';

const row = (field: string, expires = IN_DATE): UnfilledOwnerField => ({
  field,
  why: 'the owner supplies it',
  expires,
});

describe('OWNER_TODO and ownerTodo', () => {
  it('spells the marker the way the served-output assertion and the sibling tasks expect', () => {
    // Built from its parts so that this file does not spell it out and the scan below stays exact.
    expect(OWNER_TODO).toBe(['OWNER', 'TODO'].join('-'));
  });

  it('wraps a hint in the marker, so the hint says what the owner has to supply', () => {
    expect(ownerTodo('the measurement window')).toBe(`${OWNER_TODO}(the measurement window)`);
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
    field: 'about.facts.0.basis',
  },
  {
    shape: 'a marker inside a bare generated string',
    unfilled: { id: 'llms-txt', value: `# Site\n\n> ${ownerTodo('the summary')}\n` },
    filled: { id: 'llms-txt', value: '# Site\n\n> A portfolio.\n' },
    field: 'llms-txt',
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
    ])('reports an expires that is %s', (_, expires) => {
      expect(findOwnerTodoProblems([unfilled], [row(field, expires)], NOW)).toEqual([
        { kind: 'expiry', field, message: expect.stringContaining(field) },
      ]);
    });

    it('passes an expires of tomorrow', () => {
      expect(findOwnerTodoProblems([unfilled], [row(field, '2026-09-29')], NOW)).toEqual([]);
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
    ).toEqual(['cyclic.basis']);
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
      ['expiry', 'about.facts.0.basis'],
      ['stale', 'llms-txt'],
      ['stale', 'studies.9.definition'],
    ]);
  });
});

describe('the live register', () => {
  it('names every source once', () => {
    const ids = OWNER_TODO_SOURCES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every unfilled field in the registered sources, each with its deadline ahead', () => {
    // The real clock, deliberately, and never `vi.setSystemTime`: a row's `expires` is the owner's
    // deadline, and a frozen clock would switch it off. Once a deadline passes, this test is red on
    // every branch until the owner fills the value or moves the date in a pull request.
    const problems = findOwnerTodoProblems(OWNER_TODO_SOURCES, unfilledOwnerFields, new Date());
    expect(problems.map(({ message }) => message)).toEqual([]);
  });
});

const SRC = fileURLToPath(new URL('../..', import.meta.url));

/** Every file under `src`, whatever its extension, as `grep -r` would read it. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

describe('one spelling', () => {
  it('spells the marker out in owner-todo.ts and in no other file under src', () => {
    const needle = Buffer.from(OWNER_TODO);
    const spelled = filesUnder(SRC)
      .filter((file) => readFileSync(file).includes(needle))
      .map((file) => path.relative(SRC, file).split(path.sep).join('/'));
    expect(
      spelled,
      'write a typed placeholder as { state: OWNER_TODO } and a marker in prose as ownerTodo(hint)',
    ).toEqual(['data/owner-todo.ts']);
  });
});
