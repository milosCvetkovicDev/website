/**
 * The site's one placeholder convention: a value only the owner can supply, left unfilled so the code
 * around it can merge first, and a gate that keeps it from being forgotten or published.
 *
 * Two rules bind every module that leaves a placeholder.
 *
 * - **One spelling.** The marker is `OWNER-TODO`, and this is the only file that writes it out. A
 *   typed placeholder is a union branch `{ state: typeof OWNER_TODO }`, which `pnpm typecheck` stops
 *   anyone reading without narrowing first; a placeholder inside prose is `ownerTodo(hint)`. Never
 *   type the literal by hand: `__tests__/owner-todo.test.ts` fails on any other file under
 *   `apps/web/src` or `apps/web/public` that contains it.
 * - **A marker never reaches served output.** Whatever renders a value omits the whole sentence, row
 *   or block while its marker survives, rather than printing a half-filled one, and
 *   `e2e/seo-surface.spec.ts` fails if any route, `/sitemap.xml`, `/robots.txt` or the manifest
 *   serves it.
 *
 * `findOwnerTodoProblems` is the gate. `__tests__/owner-todo.test.ts` runs it over every registered
 * source against `unfilledOwnerFields` on the real clock, so every unfilled field needs a row here
 * with the owner's own deadline, and the gate goes red when that deadline passes. Joining it is one
 * `{ id, value }` entry in that test's source list plus one row below per unfilled field; the test
 * also fails on a module that imports this one and is neither in that list nor named as a renderer.
 *
 * Nothing here imports from `src/data`, so the register never cycles back into the modules it
 * describes.
 */

export const OWNER_TODO = 'OWNER-TODO';

/** A placeholder inside prose: the marker, with what the owner has to supply in brackets. */
export type OwnerTodoMarker = `${typeof OWNER_TODO}(${string})`;

/**
 * Marks a gap in a drafted sentence, naming what the owner has to supply. The hint is plain words on
 * one line with no brackets, since a finding names the gap by it and the marker ends at the first `)`.
 */
export function ownerTodo(hint: string): OwnerTodoMarker {
  if (hint.trim() === '' || /[()\r\n]/.test(hint)) {
    throw new Error(
      `ownerTodo(${JSON.stringify(hint)}): the hint says what the owner supplies, on one line, ` +
        'without brackets',
    );
  }
  return `${OWNER_TODO}(${hint})`;
}

/**
 * Something the gate walks: a data module's export, or a generated artifact such as a rendered text
 * body. `id` is the first segment of every path a finding names.
 */
export interface OwnerTodoSource {
  id: string;
  value: unknown;
}

/** A `YYYY-MM-DD` day, as far as the type system can say so; the gate checks the rest. */
export type IsoDay = `${number}-${number}-${number}`;

/** One unfilled field, admitted until the owner's deadline. */
export interface UnfilledOwnerField {
  /**
   * The field exactly as a finding names it: `<source>.<path>` for a typed placeholder
   * (`case-studies.0.metricDefinition`), and `<source>.<path>#<hint>` for each marker in a string
   * (`about.facts.0.basis#the source`), so every marker in a string has its own row.
   */
  field: string;
  /** What the owner has to supply, and why no one else can. */
  why: string;
  /**
   * The owner's deadline, a `YYYY-MM-DD` day, chosen by the owner and never by an agent, at most
   * `MAX_EXPIRY_DAYS` ahead. The gate fails from that day on, counted in UTC.
   */
  expires: IsoDay;
}

/**
 * The `expires` of a row whose deadline the owner has not chosen yet. It is the placeholder itself,
 * which the gate reads as a deadline already passed, so `pnpm test` fails on the row until the owner
 * writes a real day over it: no agent picks one. The cast gets it past `IsoDay`, which is there to
 * catch a mistyped day rather than this deliberate gap, and it can never get it past the gate.
 */
export const DEADLINE_UNSET = OWNER_TODO as string as IsoDay;

/**
 * Every field still waiting for the owner, one row per placeholder. A row goes in the commit that
 * leaves the placeholder and comes out in the commit that fills it.
 */
export const unfilledOwnerFields: readonly UnfilledOwnerField[] = [
  {
    field: 'case-studies.0.metricDefinition',
    why: "The measurement window (from and to, as YYYY-MM-DD days) and the one-line method behind the self-healing agent's 73% faster resolution: facts only the owner has.",
    expires: DEADLINE_UNSET,
  },
  {
    field: 'case-studies.1.metricDefinition',
    why: "The measurement window (from and to, as YYYY-MM-DD days) and the one-line method behind the enterprise B2B platform's 40% less complexity: facts only the owner has.",
    expires: DEADLINE_UNSET,
  },
  {
    field: 'case-studies.2.metricDefinition',
    why: "The measurement window (from and to, as YYYY-MM-DD days) and the one-line method behind the Nx remote cache's 5× faster builds: facts only the owner has.",
    expires: DEADLINE_UNSET,
  },
];

/**
 * How far ahead a deadline may be. A row is a dated promise, not an allowlist: an `expires` years
 * out would switch the gate off for that field while looking like a deadline.
 */
export const MAX_EXPIRY_DAYS = 366;

export interface OwnerTodoProblem {
  /**
   * `source`: a source id that is empty, not one path segment, or used twice. `unwalkable`: a value
   * the walk cannot see into, so it cannot vouch for it. `unregistered`: an unfilled field with no
   * row. `duplicate`: a second row for one field. `stale`: a row matching no unfilled field. `why`:
   * a row that does not say what the owner supplies. `expiry`: a row whose `expires` is missing, a
   * placeholder, not a real day, reached, or further ahead than `MAX_EXPIRY_DAYS`.
   */
  kind: 'source' | 'unwalkable' | 'unregistered' | 'duplicate' | 'stale' | 'why' | 'expiry';
  /** The `<source>.<path>` concerned. */
  field: string;
  message: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether `value` is a `YYYY-MM-DD` day that exists on the calendar. */
function isRealDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Why a row's `expires` is no deadline, or has been reached; null when it is still ahead. */
function expiryProblem(expires: unknown, today: string): string | null {
  if (typeof expires !== 'string' || expires.trim() === '') return 'has no expires date';
  if (expires.includes(OWNER_TODO)) return 'has a placeholder for its expires date';
  if (!isRealDay(expires)) return `has an expires of "${expires}", which is not a YYYY-MM-DD day`;
  if (expires <= today) return `expired on ${expires} (today is ${today}, UTC)`;
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_EXPIRY_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  if (expires > horizon) {
    return (
      `has an expires of ${expires}, more than ${MAX_EXPIRY_DAYS} days after today ` +
      `(${today}, UTC; the latest allowed is ${horizon}): a row is a deadline, not an allowlist`
    );
  }
  return null;
}

/** A key as a path segment: `.key`, or `["key"]` when the key would make the path ambiguous. */
function segment(key: string): string {
  return /^[^.[\]#]+$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

/**
 * The field each marker in `text` names under `path`: `<path>#<hint>` for `ownerTodo(hint)`, and
 * `<path>` for the bare marker.
 */
function markerFields(text: string, path: string): string[] {
  const fields: string[] = [];
  let at = text.indexOf(OWNER_TODO);
  while (at !== -1) {
    const after = at + OWNER_TODO.length;
    const close = text[after] === '(' ? text.indexOf(')', after) : -1;
    fields.push(close === -1 ? path : `${path}#${text.slice(after + 1, close)}`);
    at = text.indexOf(OWNER_TODO, close === -1 ? after : close + 1);
  }
  return fields;
}

/** What a walk found: each field it names, in walk order, as unfilled (null) or why it is unwalkable. */
type Found = Map<string, string | null>;

/**
 * Every unfilled field in `value`, with dot-separated keys and array indices. A field is unfilled
 * when it is an object whose `state` holds the marker (reported there, not again inside it), a
 * marker inside a string, or an object key holding the marker. Plain objects and arrays are walked
 * and a `Date` is a leaf; a function, any other object (a `Map`, a `Set`, a class instance) or a
 * symbol key is reported as unwalkable rather than skipped, since a skipped value would pass
 * unseen. A value that refers back to one of its ancestors is not walked twice.
 */
function collectUnfilled(value: unknown, path: string, found: Found, ancestors: Set<object>): void {
  if (typeof value === 'string') {
    for (const field of markerFields(value, path)) found.set(field, null);
    return;
  }
  if (typeof value === 'function') {
    found.set(path, 'is a function: register the value it returns');
    return;
  }
  if (typeof value !== 'object' || value === null || ancestors.has(value)) return;
  if (value instanceof Date) return;

  const prototype: unknown = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    const kind = (prototype as { constructor?: { name?: string } }).constructor?.name ?? 'object';
    found.set(path, `is a ${kind}: register it as plain objects, arrays and strings`);
    return;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    found.set(path, 'has symbol keys: register it with string keys only');
    return;
  }

  const state = (value as { state?: unknown }).state;
  if (typeof state === 'string' && state.includes(OWNER_TODO)) {
    found.set(path, null);
    return;
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}${segment(key)}`;
    if (key.includes(OWNER_TODO)) found.set(childPath, null);
    else collectUnfilled(child, childPath, found, ancestors);
  }
  ancestors.delete(value);
}

/** The source id a register row's field starts with. */
function sourceOf(field: string): string {
  return field.split(/[.[#]/, 1)[0];
}

/**
 * The gate, as a pure function: every problem with `sources` against `register` on the day `now`
 * falls in, in UTC. Source problems come first, then what the walk found (unwalkable and
 * unregistered fields, in walk order), then each row's problems in register order. An empty result
 * is a pass.
 */
export function findOwnerTodoProblems(
  sources: readonly OwnerTodoSource[],
  register: readonly UnfilledOwnerField[],
  now: Date,
): OwnerTodoProblem[] {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('findOwnerTodoProblems: now is not a valid Date');
  }
  const today = now.toISOString().slice(0, 10);
  const problems: OwnerTodoProblem[] = [];

  const ids = new Set<string>();
  const found: Found = new Map();
  for (const { id, value } of sources) {
    if (typeof id !== 'string' || !/^[^.[\]#\s]+$/.test(id)) {
      problems.push({
        kind: 'source',
        field: String(id),
        message: `source id ${JSON.stringify(id)} must be one non-empty path segment (no . [ ] # or space)`,
      });
      continue;
    }
    if (ids.has(id)) {
      problems.push({
        kind: 'source',
        field: id,
        message: `source id ${id} is used twice: every source needs its own id`,
      });
      continue;
    }
    ids.add(id);
    collectUnfilled(value, id, found, new Set());
  }

  const registered = new Set(register.map(({ field }) => field));
  for (const [field, unwalkable] of found) {
    if (unwalkable !== null) {
      problems.push({
        kind: 'unwalkable',
        field,
        message: `${field} ${unwalkable}; the gate cannot see a placeholder inside it`,
      });
    } else if (!registered.has(field)) {
      problems.push({
        kind: 'unregistered',
        field,
        message:
          `${field} is unfilled and has no row in unfilledOwnerFields: fill it, or add a row ` +
          "with why and the owner's expires date",
      });
    }
  }

  const seen = new Set<string>();
  for (const { field, why, expires } of register) {
    if (seen.has(field)) {
      problems.push({
        kind: 'duplicate',
        field,
        message: `${field} has more than one row in unfilledOwnerFields: keep one`,
      });
    }
    seen.add(field);
    if (found.get(field) !== null) {
      const source = sourceOf(field);
      problems.push({
        kind: 'stale',
        field,
        message: ids.has(source)
          ? `${field} has a row in unfilledOwnerFields but nothing there is unfilled: delete the row`
          : `${field} has a row in unfilledOwnerFields but names no source the gate walks ` +
            `("${source}"): check its spelling against the source list`,
      });
    }
    if (typeof why !== 'string' || why.trim() === '' || why.includes(OWNER_TODO)) {
      problems.push({
        kind: 'why',
        field,
        message: `${field} has a row in unfilledOwnerFields with no why: say what the owner supplies`,
      });
    }
    const expiry = expiryProblem(expires, today);
    if (expiry !== null) {
      problems.push({
        kind: 'expiry',
        field,
        message:
          `${field} ${expiry} in unfilledOwnerFields: the owner fills the value, ` +
          'or sets a new date in a pull request',
      });
    }
  }

  return problems;
}
