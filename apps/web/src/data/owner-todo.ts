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
 *   `apps/web/src` that contains it.
 * - **A marker never reaches served output.** Whatever renders a value omits the whole sentence, row
 *   or block while its marker survives, rather than printing a half-filled one, and
 *   `e2e/seo-surface.spec.ts` fails if any route, `/sitemap.xml` or `/robots.txt` serves it.
 *
 * `findOwnerTodoProblems` is the gate. `__tests__/owner-todo.test.ts` runs it over every registered
 * source against `unfilledOwnerFields` on the real clock, so every unfilled field needs a row here
 * with the owner's own deadline, and the gate goes red when that deadline passes. Joining it is one
 * `{ id, value }` entry in that test's source list plus one row below per unfilled field.
 *
 * Nothing here imports from `src/data`, so the register never cycles back into the modules it
 * describes.
 */

export const OWNER_TODO = 'OWNER-TODO';

/** A placeholder inside prose: the marker, with what the owner has to supply in brackets. */
export type OwnerTodoMarker = `${typeof OWNER_TODO}(${string})`;

/** Marks a gap in a drafted sentence, naming what the owner has to supply. */
export function ownerTodo(hint: string): OwnerTodoMarker {
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

/** One unfilled field, admitted until the owner's deadline. */
export interface UnfilledOwnerField {
  /** `<source>.<path>`, exactly as a finding names it: `case-studies.0.metricDefinition`. */
  field: string;
  /** What the owner has to supply, and why no one else can. */
  why: string;
  /**
   * The owner's deadline, a `YYYY-MM-DD` day, chosen by the owner and never by an agent. The gate
   * fails from that day on, counted in UTC.
   */
  expires: string;
}

/**
 * Every field still waiting for the owner. Empty while nothing is: a later task adds one row per
 * placeholder it leaves.
 */
export const unfilledOwnerFields: readonly UnfilledOwnerField[] = [];

export interface OwnerTodoProblem {
  /**
   * `unregistered`: an unfilled field with no row. `stale`: a row matching no unfilled field.
   * `expiry`: a row whose `expires` is missing, a placeholder, not a real day, or reached.
   */
  kind: 'unregistered' | 'stale' | 'expiry';
  /** The `<source>.<path>` concerned. */
  field: string;
  message: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  return null;
}

/**
 * Every unfilled field in `value`, as a `<source>.<path>` with dot-separated keys and array indices.
 * A field is unfilled when it is an object whose `state` is `OWNER_TODO` (reported there, not again
 * at the `state` inside it) or a string, or an object key, containing the marker. Plain objects and
 * arrays are walked; a value that refers back to one of its ancestors is not walked twice.
 */
function collectUnfilled(
  value: unknown,
  path: string,
  found: Set<string>,
  ancestors: Set<object>,
): void {
  if (typeof value === 'string') {
    if (value.includes(OWNER_TODO)) found.add(path);
    return;
  }
  if (typeof value !== 'object' || value === null || ancestors.has(value)) return;
  if ((value as { state?: unknown }).state === OWNER_TODO) {
    found.add(path);
    return;
  }
  ancestors.add(value);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (key.includes(OWNER_TODO)) found.add(childPath);
    else collectUnfilled(child, childPath, found, ancestors);
  }
  ancestors.delete(value);
}

/**
 * The gate, as a pure function: every problem with `sources` against `register` on the day `now`
 * falls in, in UTC. Unregistered fields come first, in walk order, then each row's problems in
 * register order. An empty result is a pass.
 */
export function findOwnerTodoProblems(
  sources: readonly OwnerTodoSource[],
  register: readonly UnfilledOwnerField[],
  now: Date,
): OwnerTodoProblem[] {
  const today = now.toISOString().slice(0, 10);
  const unfilled = new Set<string>();
  for (const { id, value } of sources) collectUnfilled(value, id, unfilled, new Set());

  const registered = new Set(register.map(({ field }) => field));
  const problems: OwnerTodoProblem[] = [];

  for (const field of unfilled) {
    if (registered.has(field)) continue;
    problems.push({
      kind: 'unregistered',
      field,
      message:
        `${field} is unfilled and has no row in unfilledOwnerFields: fill it, or add a row ` +
        "with why and the owner's expires date",
    });
  }

  for (const { field, expires } of register) {
    if (!unfilled.has(field)) {
      problems.push({
        kind: 'stale',
        field,
        message: `${field} has a row in unfilledOwnerFields but nothing there is unfilled: delete the row`,
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
