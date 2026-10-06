import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { CASE_STUDY_ROUTES } from './routes';
import { CHROMIUM_LAUNCH_ARGS } from './support/chromium-launch-args';
import {
  LIGHTHOUSE_VERSION,
  auditFailure,
  chosenRunner,
  describeAudit,
  isImportFailure,
  parseCliReport,
  readDevToolsPort,
  reportFromCliFailure,
  reportProblem,
  versionProblem,
  withDeadline,
  type LighthouseAudit,
  type LighthouseReport,
} from './support/lighthouse';

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
 * score (`manual`, `informative`, `error`), fails with its id in the message. Nothing here reads
 * a category, and no timing or CLS audit is asserted, because the local and CI runs serve different
 * builds (the dev server and the production one). The rules themselves live in
 * `e2e/support/lighthouse.ts`, pinned by `src/test/lighthouse.test.ts`.
 *
 * What Lighthouse 13.5.0 itself does, read in its published source (`core/audits`,
 * `core/config/default-config.js`). Its `agentic-browsing` category files `llms-txt` in an
 * `agent-discoverability` group beside an `ard-schema` audit, which looks for
 * `/.well-known/ai-catalog.json` and reports `notApplicable` when there is no catalog and no
 * `ai-catalog` link, header or robots.txt `Agentmap:` line pointing at one (a pointer without a
 * catalog fails it); the site has neither, so it is not asserted. A version bump can change any of
 * it, and the ids with it, so a bump means re-reading this list (`.claude/rules/dependencies.md`),
 * and each route's first test fails on any other version until `LIGHTHOUSE_VERSION` is updated:
 *
 * - `structured-data` is a manual audit (`scoreDisplayMode: 'manual'`, weight 0 in the SEO
 *   category), so Lighthouse checks no JSON-LD at all and it is not asserted here. Structured data
 *   is covered by the offline gate, `src/components/__tests__/json-ld.test.tsx` under `pnpm test`,
 *   and by the advisory `e2e/structured-data.spec.ts`.
 * - `canonical` has no cross-domain check. It fails a canonical that is invalid, relative or one of
 *   several, and a same-origin one that points a deeper page at the root, and otherwise passes: so
 *   the production-origin canonical `buildMetadata()` writes passes against `localhost` here, and
 *   what this row proves is that the tag is present and well formed. Without it the audit reports
 *   `notApplicable`, which fails. Which URL it names, its own path on every page and every case
 *   study, is asserted by "every page serves one canonical link for its own path, and a 404 serves
 *   none" in `e2e/seo-surface.spec.ts`.
 * - `llms-txt` fetches `/llms.txt` from the audited origin and reports a 4xx as `notApplicable`,
 *   which is how a missing file left agentic browsing at 1.0, a 5xx as 0, and a 2xx as a pass only
 *   with an H1, a Markdown link and at least 50 characters. The site serves no `/llms.txt` until
 *   #60, so both of its rows are expected failures naming it, declared only once the audit has
 *   reported `notApplicable`: any other outcome fails the run, and the change that serves the file
 *   deletes the `llms-txt` entry in `EXPECTED_NOT_APPLICABLE`.
 * - `agent-accessibility-tree` passes when none of a fixed set of axe rules (names, labels, ARIA
 *   validity, `document-title` among them) reports a violation on the page as loaded. It runs under
 *   Lighthouse's default emulation, the mobile form factor at a 412 px wide viewport, so it checks
 *   the phone layout; the desktop layout is axe-checked in both schemes by
 *   `e2e/accessibility.spec.ts`.
 *
 * A green audit is not evidence that any agent read the site. Lighthouse is a checker, not a
 * consumer, and the agentic-browsing category describes itself as "still under development and
 * subject to change". Say so wherever a result from here is quoted.
 *
 * How it runs:
 *
 * - Against `baseURL`, the server this Playwright run started, never a server of its own
 *   (ADR 0014). A report whose final URL is on another path fails the route: a redirect would have
 *   Lighthouse audit the target under this route's name.
 * - In a Chromium this spec launches from Playwright's own `chromium.executablePath()` (the full
 *   build, which CI's `playwright install chromium` downloads), into a fresh profile, with
 *   `--remote-debugging-port=0`. Chromium picks the port and writes it to `DevToolsActivePort` in
 *   that profile, and Lighthouse connects to that port, so two workers cannot race for one port and
 *   CI needs no `CHROME_PATH`.
 * - Lighthouse is ESM, so it is loaded with a dynamic `import()`. Only if that import fails in a way
 *   the CLI can avoid (`isImportFailure`) does the same pinned package run as its own CLI through
 *   `execFile`, pointed at the same browser, and the test's `lighthouse` annotation says which of the
 *   two ran. A failure during the run is a failure, never a reason to run again.
 *   `LIGHTHOUSE_RUNNER=cli` forces the CLI, to prove the fallback still works; any other value
 *   throws. Both runners stop at `RUN_TIMEOUT_MS`, inside the hook's own timeout.
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
// `src/test/playwright-config.test.ts` pins the project names, so renaming `chromium` fails
// `pnpm test` rather than skipping this file unnoticed.
test.skip(
  () => test.info().project.name !== 'chromium',
  'Lighthouse runs its own Chromium, once per run, from the desktop chromium project',
);

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

/** Both runners are stopped here, well inside `TIMEOUT_MS`, so the browser is closed in time. */
const RUN_TIMEOUT_MS = 100_000;

/** How long Chromium gets to write `DevToolsActivePort` after Playwright has launched it. */
const PORT_FILE_TIMEOUT_MS = 10_000;

interface AuditRun {
  report: LighthouseReport;
  runner: string;
}

/** Lighthouse loaded in this worker, connected to the browser on `port`. */
async function runInProcess(
  lighthouse: typeof import('lighthouse').default,
  url: string,
  port: number,
): Promise<LighthouseReport> {
  const result = await withDeadline(
    lighthouse(url, {
      port,
      hostname: '127.0.0.1',
      output: 'json',
      logLevel: 'error',
      onlyAudits: [...AUDIT_IDS],
      maxWaitForLoad: RUN_TIMEOUT_MS / 2,
    }),
    RUN_TIMEOUT_MS,
    `Lighthouse on ${url}`,
  );
  if (!result) throw new Error(`Lighthouse returned no result for ${url}`);
  return result.lhr;
}

/** The same pinned package as a CLI in a child process, connected to the browser on `port`. */
async function runCli(url: string, port: number): Promise<LighthouseReport> {
  const cli = require.resolve('lighthouse/cli/index.js');
  try {
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
        // Never ask, never read a stored answer from the home directory, never report.
        '--no-enable-error-reporting',
        '--quiet',
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: RUN_TIMEOUT_MS },
    );
    return parseCliReport(stdout, url);
  } catch (error) {
    return reportFromCliFailure(error, url);
  }
}

/** The port Chromium chose for its DevTools endpoint, from the profile it was launched into. */
async function devToolsPort(profile: string): Promise<number> {
  const file = join(profile, 'DevToolsActivePort');
  const until = Date.now() + PORT_FILE_TIMEOUT_MS;
  for (;;) {
    const port = readDevToolsPort(await readFile(file, 'utf8').catch(() => ''));
    if (port) return port;
    if (Date.now() > until) {
      throw new Error(`Chromium wrote no DevToolsActivePort in ${PORT_FILE_TIMEOUT_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Audits `path` on the server under test in a Chromium launched from Playwright's own binary. */
async function audit(path: string): Promise<AuditRun> {
  const { baseURL } = test.info().project.use;
  if (!baseURL) throw new Error('playwright.config.ts sets no baseURL for Lighthouse to audit');
  const url = new URL(path, baseURL).href;
  const runner = chosenRunner(process.env.LIGHTHOUSE_RUNNER);
  const profile = await mkdtemp(join(tmpdir(), 'lighthouse-audits-'));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: chromium.executablePath(),
      // Playwright merges the project's launch options in shallowly, so these args replace the
      // project's: the launch flags are spread back in (ADR 0032).
      args: [...CHROMIUM_LAUNCH_ARGS, '--remote-debugging-port=0'],
    });
    const port = await devToolsPort(profile);
    if (runner === 'cli') {
      return { report: await runCli(url, port), runner: 'CLI (LIGHTHOUSE_RUNNER=cli)' };
    }
    let lighthouse: typeof import('lighthouse').default;
    try {
      ({ default: lighthouse } = await import('lighthouse'));
    } catch (error) {
      if (!isImportFailure(error)) throw error;
      const why = error instanceof Error ? error.message : String(error);
      return { report: await runCli(url, port), runner: `CLI (the import failed: ${why})` };
    }
    return { report: await runInProcess(lighthouse, url, port), runner: 'in-process' };
  } finally {
    // A browser that crashed or was already closed must not replace Lighthouse's own error.
    await context?.close().catch((error: unknown) => {
      console.warn(`closing the Lighthouse browser for ${path} failed:`, error);
    });
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
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
      const problem = reportProblem(run.report, path);
      if (problem) throw new Error(problem);
    });

    test(`${path} was audited by the Lighthouse version the rules were read in`, () => {
      if (!run) throw new Error(`no Lighthouse run for ${path}`);
      const problem = versionProblem(run.report);
      if (problem) throw new Error(problem);
    });

    for (const id of AUDIT_IDS) {
      const issue = EXPECTED_NOT_APPLICABLE[id];
      test(`${path} passes Lighthouse's ${id} audit${issue ? ` (${issue})` : ''}`, () => {
        if (!run) throw new Error(`no Lighthouse run for ${path}`);
        const { report, runner } = run;
        const lighthouseAudit = report.audits?.[id];
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
        const failure = auditFailure(id, path, lighthouseAudit);
        if (failure) throw new Error(failure);
      });
    }
  });
}
