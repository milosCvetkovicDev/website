/**
 * The pure half of `e2e/lighthouse-audits.spec.ts`: which audit results count as a pass, what
 * counts as Lighthouse failing to load rather than failing to run, and how both runners' output is
 * read. No browser and no Playwright, so `src/test/lighthouse.test.ts` pins every branch that
 * decides whether the gate can fail, the way `src/test/schema-validator.test.ts` pins the
 * structured-data check's.
 */

/** The version pinned in `apps/web/package.json`, whose source the spec's docblock describes. */
export const LIGHTHOUSE_VERSION = '13.5.0';

/** The part of an audit result the spec reads, in the shape both runners return it. */
export interface LighthouseAudit {
  id: string;
  title: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  explanation?: string;
  errorMessage?: string;
  warnings?: unknown[];
  details?: unknown;
}

export interface LighthouseReport {
  lighthouseVersion: string;
  finalDisplayedUrl: string;
  runtimeError?: { code: string; message: string };
  audits: Record<string, LighthouseAudit>;
}

/** The modes that carry a score (`core/audits/audit.js`, `SCORING_MODES`). */
const SCORED_MODES = ['binary', 'numeric', 'metricSavings'];

/**
 * The codes Node gives a module it cannot load in this format: the ESM loader refusing a dynamic
 * `import()` that Playwright's transform turned into a `require`, or a loader hook that is absent.
 * A missing package (`MODULE_NOT_FOUND`, `ERR_MODULE_NOT_FOUND`) is deliberately not one: the CLI
 * resolves the same package and would fail the same way, with a worse message.
 */
const IMPORT_FAILURE_CODES = [
  'ERR_REQUIRE_ESM',
  'ERR_REQUIRE_ASYNC_MODULE',
  'ERR_UNKNOWN_FILE_EXTENSION',
  'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING',
];

/** Whether `error`, thrown by `import('lighthouse')`, is Node failing to load it in this format. */
export function isImportFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && IMPORT_FAILURE_CODES.includes(code);
}

export type Runner = 'in-process' | 'cli';

/** The runner `LIGHTHOUSE_RUNNER` asks for; any value but unset or `cli` throws, typos included. */
export function chosenRunner(value: string | undefined): Runner {
  if (value === undefined || value === '') return 'in-process';
  if (value === 'cli') return 'cli';
  throw new Error(`LIGHTHOUSE_RUNNER must be unset or 'cli', got '${value}'`);
}

/** `text` cut to `max` characters, counted in code points so no surrogate pair is split. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

/**
 * The report in the CLI's stdout. Anything that is not a JSON object with an `audits` object
 * throws with the URL and the start of the output, rather than a bare `SyntaxError` here or an
 * "no canonical audit" for every row later.
 */
export function parseCliReport(stdout: string, url: string): LighthouseReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`the Lighthouse CLI printed no JSON report for ${url}: ${clip(stdout, 300)}`);
  }
  const audits = (parsed as { audits?: unknown } | null)?.audits;
  if (!audits || typeof audits !== 'object') {
    throw new Error(
      `the Lighthouse CLI printed JSON with no audits for ${url}: ${clip(stdout, 300)}`,
    );
  }
  return parsed as LighthouseReport;
}

/**
 * The report a failed CLI run still printed, or the original error. On a `runtimeError` the CLI
 * writes the report and then exits 1 (`cli/run.js`), so `execFile` rejects with the report in the
 * error's `stdout`; reading it lets the spec name the runtime error instead of "Command failed".
 */
export function reportFromCliFailure(error: unknown, url: string): LighthouseReport {
  const stdout = (error as { stdout?: unknown } | null)?.stdout;
  if (typeof stdout === 'string' && stdout.trimStart().startsWith('{')) {
    return parseCliReport(stdout, url);
  }
  throw error;
}

/**
 * What stops a report from being about the page the spec asked for: a runtime error, or a final
 * URL on another path (a redirect would have Lighthouse audit the target under the route's name).
 */
export function reportProblem(report: LighthouseReport, path: string): string | undefined {
  const { runtimeError, finalDisplayedUrl } = report;
  if (runtimeError) {
    return `Lighthouse could not audit ${path}: ${runtimeError.code}, ${runtimeError.message}`;
  }
  let finalPath: string | undefined;
  try {
    finalPath = new URL(finalDisplayedUrl).pathname;
  } catch {
    finalPath = undefined;
  }
  if (finalPath !== path) {
    return `Lighthouse was asked for ${path} but audited ${finalDisplayedUrl}`;
  }
  return undefined;
}

/**
 * Why the report's version is not the pinned one, if it is not. A bump that keeps the ids can still
 * change a scoring or `notApplicable` rule, so a bump fails until someone has re-read them.
 */
export function versionProblem(report: LighthouseReport): string | undefined {
  if (report.lighthouseVersion === LIGHTHOUSE_VERSION) return undefined;
  return (
    `Lighthouse ${report.lighthouseVersion} ran, but the spec describes ${LIGHTHOUSE_VERSION}. ` +
    'Re-read the audit rules in the docblock of e2e/lighthouse-audits.spec.ts ' +
    '(.claude/rules/dependencies.md), then update LIGHTHOUSE_VERSION in e2e/support/lighthouse.ts.'
  );
}

/** The human-readable lines in an audit's details (table rows, list sections), clipped. */
export function describeDetails(details: unknown): string {
  const lines: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        if (
          typeof inner === 'string' &&
          ['description', 'message', 'line', 'snippet'].includes(key)
        )
          lines.push(inner);
        else walk(inner);
      }
    }
  };
  walk((details as { items?: unknown } | undefined)?.items);
  return clip(lines.join('; '), 400);
}

/** Everything Lighthouse said about an audit besides its score, for a failure message. */
export function describeAudit({
  displayValue,
  explanation,
  errorMessage,
  details,
}: LighthouseAudit) {
  return [errorMessage, explanation, displayValue, describeDetails(details)]
    .filter(Boolean)
    .join(' | ');
}

/**
 * Why the audit is not a pass, or `undefined` when it was scored and scored 1. `notApplicable`
 * fails with the audit's id: it is how an absent canonical passed the SEO category and an absent
 * `/llms.txt` the agentic one. So do `manual`, `informative` and `error`, which carry no score.
 */
export function auditFailure(
  id: string,
  path: string,
  lighthouseAudit: LighthouseAudit,
): string | undefined {
  const { score, scoreDisplayMode } = lighthouseAudit;
  const said = describeAudit(lighthouseAudit);
  const suffix = said ? `: ${said}` : '';
  if (scoreDisplayMode === 'notApplicable') {
    return `Lighthouse reported ${id} as notApplicable on ${path}, and notApplicable is never a pass${suffix}`;
  }
  if (!SCORED_MODES.includes(scoreDisplayMode)) {
    return `Lighthouse reported ${id} as ${scoreDisplayMode} on ${path}, which carries no score${suffix}`;
  }
  if (score !== 1) return `${id} on ${path} scored ${score}, not 1${suffix}`;
  return undefined;
}

/** The port in the `DevToolsActivePort` file Chromium writes into its profile: the first line. */
export function readDevToolsPort(contents: string): number | undefined {
  const first = contents.split('\n')[0]?.trim() ?? '';
  if (!/^\d+$/.test(first)) return undefined;
  const port = Number(first);
  return port > 0 && port <= 65535 ? port : undefined;
}

/**
 * `work`, or an error naming `what` once `ms` have passed. The work is not cancelled: the caller's
 * `finally` closes the browser under it. Its later rejection is swallowed, so it cannot surface as
 * an unhandled rejection in the worker after the test has already failed.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not finish in ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
