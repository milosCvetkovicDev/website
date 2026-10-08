/**
 * The pure half of `e2e/structured-data.spec.ts`: deciding whether validator.schema.org's answer is
 * a verdict (`support/json-ld.ts` finds the ld+json elements it posts). No network and no
 * Playwright, so `src/test/schema-validator.test.ts` pins every branch that decides whether the
 * advisory check can fail, the way `src/test/playwright-config.test.ts` pins the config's parsing.
 */

/** What the validator prefixes every JSON answer with, so that the answer cannot run as a script. */
export const XSSI_PREFIX = ")]}'";

export interface ValidatorError {
  errorType?: string;
  args?: unknown[];
}

export interface ValidatorReport {
  totalNumErrors: number;
  totalNumWarnings?: number;
  /**
   * The top-level entities it read, not the blocks: a node another one names by `@id` is read as part
   * of it, so the count moves when the graph's references do. `ROUTES` in
   * `e2e/structured-data.spec.ts` pins it per route, says when it was measured and how its numbers
   * follow from the graph, and `objectCountProblem` compares against them.
   */
  numObjects?: number;
  fetchError?: string;
  errors?: ValidatorError[];
}

export type Verdict = { reached: true; report: ValidatorReport } | { reached: false; why: string };

/**
 * Up to `max` characters of text from a third party, safe to print: every control character (the
 * escape that starts an ANSI sequence among them) becomes a space, and whitespace runs collapse.
 */
export function clip(text: string, max = 120): string {
  const printable = [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
    })
    .join('');
  return printable.replace(/\s+/g, ' ').trim().slice(0, max);
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Reads the validator's answer: a verdict, or why there is none. Anything short of a well-formed,
 * 2xx answer that read at least one object and fetched nothing is no verdict, so a third party's
 * trouble never decides a run (ADR 0004); only a count of errors in what it did read is a verdict.
 */
export function readVerdict(status: number, body: string): Verdict {
  if (status < 200 || status > 299) {
    // A 4xx other than a timeout or a rate limit refuses the request itself: the undocumented
    // contract (the `html` form field) has probably changed, so the message says so.
    const refused = status >= 400 && status < 500 && status !== 408 && status !== 429;
    return {
      reached: false,
      why: refused
        ? `it refused the request with ${status}, so the endpoint's contract may have changed`
        : `it answered ${status}`,
    };
  }
  const json = body.startsWith(XSSI_PREFIX) ? body.slice(XSSI_PREFIX.length) : body;
  let report: unknown;
  try {
    report = JSON.parse(json);
  } catch {
    return { reached: false, why: `its ${status} body is not JSON: ${clip(body)}` };
  }
  if (typeof report !== 'object' || report === null || Array.isArray(report)) {
    return { reached: false, why: `its body is not a report: ${clip(json)}` };
  }
  const { totalNumErrors, numObjects, fetchError } = report as Record<string, unknown>;
  if (!isCount(totalNumErrors)) {
    return { reached: false, why: `its body has no error count: ${clip(json)}` };
  }
  // A fetch error means it did not read what was sent, whatever it counted. An empty `html` answers
  // `fetchError: "NOT_FOUND"` with zero errors and zero objects, which would otherwise be a false
  // green; an answer with errors and no object read is a parse failure of what was sent, a verdict.
  if (fetchError !== undefined && fetchError !== null) {
    return {
      reached: false,
      why: `it could not read what was sent (fetchError ${clip(String(fetchError))})`,
    };
  }
  if (numObjects !== undefined && !isCount(numObjects)) {
    return {
      reached: false,
      why: `its object count is not a count: ${clip(JSON.stringify(numObjects))}`,
    };
  }
  if (totalNumErrors === 0 && !numObjects) {
    return { reached: false, why: `it read no object (numObjects ${numObjects ?? 'none'})` };
  }
  return { reached: true, report: report as ValidatorReport };
}

/**
 * Why a verdict read another number of objects than the route's graph has, or null when it read
 * exactly `expected` (the owner's comment on #57). A clean verdict can still be a partial read, and
 * the error count alone passes it. The count catches a read that changes the number of top-level
 * objects, not every one: a block whose loss leaves the count where it was goes unseen (what each
 * route's count rests on is in `ROUTES` in `e2e/structured-data.spec.ts`). The count is the
 * validator's own, so a change in how it counts fails too, and the message says to re-measure
 * either way. An `expected` that is no count of objects is a typo in the spec, and throws.
 */
export function objectCountProblem(
  expected: number,
  { numObjects }: ValidatorReport,
): string | null {
  if (!Number.isInteger(expected) || expected < 1) {
    throw new Error(`objectCountProblem: ${expected} is not a count of objects to expect`);
  }
  if (numObjects === expected) return null;
  const read =
    numObjects === undefined
      ? 'gave no object count'
      : `read ${numObjects} object${numObjects === 1 ? '' : 's'}`;
  return (
    `validator.schema.org ${read}, and ${expected} ${expected === 1 ? 'is' : 'are'} expected: ` +
    'a block went unread, or the graph changed: re-measure and update the expected count'
  );
}

/** The errors a report lists, as `errorType(args)`, read defensively: the shape is undocumented. */
export function describeErrors({ errors }: ValidatorReport): string {
  if (!Array.isArray(errors) || errors.length === 0) return '(the report lists none)';
  return errors
    .map((error: unknown) => {
      if (typeof error !== 'object' || error === null) return clip(JSON.stringify(error) ?? 'null');
      const { errorType, args } = error as ValidatorError;
      const type = typeof errorType === 'string' ? clip(errorType) : 'UNKNOWN_ERROR';
      const list = Array.isArray(args)
        ? args.map((arg) => clip(typeof arg === 'string' ? arg : (JSON.stringify(arg) ?? 'null')))
        : [];
      return `${type}(${list.join(', ')})`;
    })
    .join('; ');
}
