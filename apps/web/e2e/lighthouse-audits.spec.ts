import { execFile } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { chromium, expect, test } from '@playwright/test';
import { CASE_STUDY_ROUTES } from './routes';

/**
 * Lighthouse, read one named audit at a time and never as a category score (#55, AC 9 and 16;
 * FR-4).
 *
 * A category score certified this site's gaps as fine. Measured on 2026-09-12 with
 * `lighthouse@13.4.1` against the live site: SEO scored 100 while no route carried a
 * `<link rel="canonical">`, because the `canonical` audit reports `notApplicable` when the tag is
 * absent, and agentic browsing scored 1.0 with four of its six audits `notApplicable`. Lighthouse
 * gives a `notApplicable`, `manual` or `informative` audit weight 0 in its category
 * (`core/scoring.js`), so an audit with nothing to check cannot lower a category's score, and an
 * absence reads as a pass. So this spec asks for seven audits by id and asserts each one on its
 * own, on `/` and on a case study: `canonical`, `document-title`, `meta-description`,
 * `is-crawlable`, `robots-txt`, `agent-accessibility-tree` and `llms-txt`. Its one rule is that
 * `notApplicable` is never a pass: an audit that reports it, or any other mode that carries no
 * score (`manual`, `informative`, `error`), throws with its id in the message. Nothing here reads
 * a category, and no timing or CLS audit is asserted, because the local and CI runs serve different
 * builds (the dev server and the production one).
 *
 * What Lighthouse 13.4.1 itself does, read in its source (`core/audits`,
 * `core/config/default-config.js`) on 2026-09-29. A version bump can change any of it, and the ids
 * with it, so a bump means re-reading this list (`.claude/rules/dependencies.md`):
 *
 * - `structured-data` is a manual audit (`scoreDisplayMode: 'manual'`, weight 0 in the SEO
 *   category), so Lighthouse checks no JSON-LD at all and it is not asserted here. Structured data
 *   is covered by the offline gate, `src/components/__tests__/json-ld.test.tsx` under `pnpm test`,
 *   and by the advisory `e2e/structured-data.spec.ts`.
 * - `canonical` has no cross-domain check. It fails a canonical that is invalid, relative or one of
 *   several, and a same-origin one that points a deeper page at the root, and otherwise passes: so
 *   the production-origin canonical `buildMetadata()` writes passes against `localhost` here, and
 *   what this row proves is that the tag is present and well formed. Without it the audit reports
 *   `notApplicable`, which fails. `seo-surface.spec.ts` asserts which URL the canonical names.
 * - `llms-txt` fetches `/llms.txt` from the audited origin and reports a 4xx as `notApplicable`,
 *   which is how a missing file left agentic browsing at 1.0, a 5xx as 0, and a 2xx as a pass only
 *   with an H1, a Markdown link and at least 50 characters. The site serves no `/llms.txt` until
 *   #60, so both of its rows are expected failures naming it, declared only once the audit has
 *   reported `notApplicable`: any other outcome fails the run, and the change that serves the file
 *   deletes the `llms-txt` entry in `EXPECTED_NOT_APPLICABLE`.
 * - `agent-accessibility-tree` passes when none of a fixed set of axe rules (names, labels, ARIA
 *   validity, `document-title` among them) reports a violation on the page as loaded.
 *
 * A green audit is not evidence that any agent read the site. Lighthouse is a checker, not a
 * consumer, and the agentic-browsing category describes itself as "still under development and
 * subject to change". Say so wherever a result from here is quoted.
 *
 * How it runs:
 *
 * - Against `baseURL`, the server this Playwright run started, never a server of its own
 *   (ADR 0014).
 * - In a Chromium this spec launches from Playwright's own `chromium.executablePath()` with a
 *   remote debugging port, which Lighthouse connects to. CI therefore needs no `CHROME_PATH` and no
 *   second browser download.
 * - Lighthouse is ESM, so it is loaded with a dynamic `import()`. If that import fails, the same
 *   pinned package runs as its own CLI through `execFile`, pointed at the same browser, and the
 *   test's `lighthouse` annotation says which of the two ran. `LIGHTHOUSE_RUNNER=cli` forces the
 *   CLI, to prove the fallback still works.
 * - One Lighthouse run per route, in a `beforeAll`, and one test per route and audit. Each route's
 *   tests run one after the other in one worker (`mode: 'default'`, whatever `fullyParallel` says),
 *   so they share that one run instead of each worker repeating it. Not `serial`: there a failing
 *   audit would skip every audit after it on that route. Here Playwright replaces the worker after
 *   an unexpected failure and the next test's `beforeAll` audits the route again, so a failing run
 *   costs one more Lighthouse run per failure and still reports every audit (measured with the
 *   canonical removed: both canonical rows red, the other twelve rows reported, 53 s against 45 s
 *   for `serial`, under a load average of 40-100).
 * - `retries: 0`, as for every gate and every spec carrying an expected failure (`e2e-tests.md`): a
 *   retry would pass an intermittent failure as flaky, or an expected failure that has started
 *   passing.
 */

test.describe.configure({ retries: 0 });

// Lighthouse drives a Chromium this spec launches itself, whatever the project's browser, so every
// project that ran this file would repeat the same audit of the same server. Only `chromium` runs
// the specs outside `e2e/mobile/` today, and the WebKit and phone projects never reach this file.
// Keyed on the project's name rather than `browserName` so that a second Chromium project (a
// channel, another device), which reports `browserName` 'chromium' too, cannot repeat it either.
test.skip(
  () => test.info().project.name !== 'chromium',
  'Lighthouse runs its own Chromium, once per run, from the desktop chromium project',
);

/** The version pinned in `apps/web/package.json`, whose source the docblock describes. */
const LIGHTHOUSE_VERSION = '13.4.1';

/** The audits asserted, in the order each route's tests run. */
const AUDIT_IDS = [
  'canonical',
  'document-title',
  'meta-description',
  'is-crawlable',
  'robots-txt',
  'agent-accessibility-tree',
  'llms-txt',
] as const;

type AuditId = (typeof AUDIT_IDS)[number];

/** The audits whose failure is declared, each with the task that removes the declaration. */
const EXPECTED_NOT_APPLICABLE: Partial<Record<AuditId, string>> = { 'llms-txt': '#60' };

/**
 * The case study #55's AC 9 names. Named rather than taken from the data file's order, so that a
 * reordering cannot change which page is audited; the first test fails if the slug goes away.
 */
const CASE_STUDY = '/work/self-healing-agent';

const ROUTES = ['/', CASE_STUDY];

/**
 * What each route's `beforeAll` and each of its tests is given. The hook needs its own
 * `test.setTimeout`: Playwright 1.63 times a `beforeAll` with the project's timeout (30 s here),
 * not the one `test.describe.configure` sets, and a run under a heavy load took longer than that.
 */
const TIMEOUT_MS = 120_000;

/** Both runners are told to stop well inside `TIMEOUT_MS`. */
const RUN_TIMEOUT_MS = 100_000;

/** The part of Lighthouse's result this spec reads, in the shape both runners return it. */
interface LighthouseAudit {
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

interface LighthouseReport {
  lighthouseVersion: string;
  finalDisplayedUrl: string;
  runtimeError?: { code: string; message: string };
  audits: Record<string, LighthouseAudit>;
}

interface AuditRun {
  report: LighthouseReport;
  runner: string;
}

/** A free TCP port on the loopback interface for Chromium's remote debugging endpoint. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Lighthouse loaded in this worker, connected to the browser on `port`. */
async function runInProcess(url: string, port: number): Promise<LighthouseReport> {
  const { default: lighthouse } = await import('lighthouse');
  const result = await lighthouse(url, {
    port,
    hostname: '127.0.0.1',
    output: 'json',
    logLevel: 'error',
    onlyAudits: [...AUDIT_IDS],
    maxWaitForLoad: RUN_TIMEOUT_MS / 2,
  });
  if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
  return result.lhr;
}

/** The same pinned package as a CLI in a child process, connected to the browser on `port`. */
async function runCli(url: string, port: number): Promise<LighthouseReport> {
  const cli = require.resolve('lighthouse/cli/index.js');
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      cli,
      url,
      `--port=${port}`,
      '--hostname=127.0.0.1',
      '--output=json',
      '--output-path=stdout',
      `--only-audits=${AUDIT_IDS.join(',')}`,
      `--max-wait-for-load=${RUN_TIMEOUT_MS / 2}`,
      '--quiet',
    ],
    { maxBuffer: 64 * 1024 * 1024, timeout: RUN_TIMEOUT_MS },
  );
  return JSON.parse(stdout) as LighthouseReport;
}

/** Audits `path` on the server under test in a Chromium launched from Playwright's own binary. */
async function audit(path: string): Promise<AuditRun> {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error('playwright.config.ts sets no baseURL for Lighthouse to audit');
  const url = new URL(path, baseURL).href;
  const port = await freePort();
  const browser = await chromium.launch({
    executablePath: chromium.executablePath(),
    args: [`--remote-debugging-port=${port}`],
  });
  try {
    if (process.env.LIGHTHOUSE_RUNNER === 'cli') {
      return { report: await runCli(url, port), runner: 'CLI (LIGHTHOUSE_RUNNER=cli)' };
    }
    let report: LighthouseReport;
    try {
      report = await runInProcess(url, port);
    } catch (error) {
      // Only a failure to load the module falls back; a run that failed is a failure.
      if (!isImportFailure(error)) throw error;
      const why = error instanceof Error ? error.message : String(error);
      return { report: await runCli(url, port), runner: `CLI (the import failed: ${why})` };
    }
    return { report, runner: 'in-process' };
  } finally {
    await browser.close();
  }
}

/** Whether `error` is Node failing to load the `lighthouse` module, as opposed to a run failing. */
function isImportFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return (
    typeof code === 'string' &&
    [
      'ERR_REQUIRE_ESM',
      'ERR_REQUIRE_ASYNC_MODULE',
      'ERR_MODULE_NOT_FOUND',
      'MODULE_NOT_FOUND',
      'ERR_UNKNOWN_FILE_EXTENSION',
      'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING',
    ].includes(code)
  );
}

/** The human-readable lines in an audit's details (table rows, list sections), clipped. */
function describeDetails(details: unknown): string {
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
  const text = lines.join('; ');
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

/** Everything Lighthouse said about an audit besides its score, for a failure message. */
function describeAudit({ displayValue, explanation, errorMessage, details }: LighthouseAudit) {
  return [errorMessage, explanation, displayValue, describeDetails(details)]
    .filter(Boolean)
    .join(' | ');
}

/**
 * Fails unless the audit was scored and scored 1. `notApplicable` throws with the audit's id: it is
 * how an absent canonical passed the SEO category and an absent `/llms.txt` the agentic one.
 */
function expectPassed(id: AuditId, path: string, lighthouseAudit: LighthouseAudit): void {
  const { score, scoreDisplayMode } = lighthouseAudit;
  const said = describeAudit(lighthouseAudit);
  if (scoreDisplayMode === 'notApplicable') {
    throw new Error(
      `Lighthouse reported ${id} as notApplicable on ${path}, and notApplicable is never a pass` +
        (said ? `: ${said}` : ''),
    );
  }
  if (scoreDisplayMode !== 'binary' && scoreDisplayMode !== 'numeric') {
    throw new Error(
      `Lighthouse reported ${id} as ${scoreDisplayMode} on ${path}, which carries no score` +
        (said ? `: ${said}` : ''),
    );
  }
  expect(score, `${id} on ${path} scored ${score}${said ? `: ${said}` : ''}`).toBe(1);
}

/**
 * Declares the test an expected failure because the audited file is not served yet, and only for
 * that: the audit must have reported `notApplicable` (the 404) before `test.fail()` is called, so a
 * 5xx, a malformed file or a pass fails the run. Once `issue` serves the file, delete the audit's
 * entry in `EXPECTED_NOT_APPLICABLE`.
 */
function expectNotApplicableUntil(
  issue: string,
  id: AuditId,
  path: string,
  lighthouseAudit: LighthouseAudit,
): void {
  test.info().annotations.push({ type: 'fixed-by', description: issue });
  const { scoreDisplayMode } = lighthouseAudit;
  expect(
    scoreDisplayMode,
    `${id} on ${path} is ${scoreDisplayMode}. While ${issue} is open it must be notApplicable ` +
      `(no file served); once ${issue} serves it, delete the ${id} entry in ` +
      `EXPECTED_NOT_APPLICABLE so the assertion below decides. ${describeAudit(lighthouseAudit)}`,
  ).toBe('notApplicable');
  test.fail();
}

test('the audited case study is still one the data file renders', () => {
  expect(CASE_STUDY_ROUTES, `${CASE_STUDY} must be a route in e2e/routes.ts`).toContain(CASE_STUDY);
});

for (const path of ROUTES) {
  test.describe(`Lighthouse on ${path}`, () => {
    test.describe.configure({ mode: 'default', timeout: TIMEOUT_MS });

    let run: AuditRun | undefined;

    test.beforeAll(async () => {
      test.setTimeout(TIMEOUT_MS);
      run = await audit(path);
      const { runtimeError } = run.report;
      if (runtimeError) {
        throw new Error(
          `Lighthouse could not audit ${path}: ${runtimeError.code}, ${runtimeError.message}`,
        );
      }
    });

    for (const id of AUDIT_IDS) {
      const issue = EXPECTED_NOT_APPLICABLE[id];
      test(`${path} passes Lighthouse's ${id} audit${issue ? ` (${issue})` : ''}`, () => {
        if (!run) throw new Error(`no Lighthouse run for ${path}`);
        const { report, runner } = run;
        const lighthouseAudit = report.audits[id];
        if (!lighthouseAudit) {
          throw new Error(
            `Lighthouse ${report.lighthouseVersion} returned no ${id} audit for ${path}. ` +
              `The pinned version is ${LIGHTHOUSE_VERSION}; an audit id that was renamed or ` +
              'removed means re-reading the list above (.claude/rules/dependencies.md).',
          );
        }
        const { score, scoreDisplayMode } = lighthouseAudit;
        test.info().annotations.push({
          type: 'lighthouse',
          description:
            `${report.lighthouseVersion} (${runner}) on ${report.finalDisplayedUrl}: ` +
            `${id} ${scoreDisplayMode}, score ${score}`,
        });
        if (issue) expectNotApplicableUntil(issue, id, path, lighthouseAudit);
        expectPassed(id, path, lighthouseAudit);
      });
    }
  });
}
