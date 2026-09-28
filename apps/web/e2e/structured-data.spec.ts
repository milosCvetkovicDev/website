import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * The served JSON-LD, read by schema.org's own validator. Advisory: it fails open.
 *
 * #55 (AC 8, FR-4). Structured data has two gates. The hard one is offline,
 * `src/components/__tests__/json-ld.test.tsx`: it renders every block and fails `pnpm test` on one
 * that does not parse or has no `@context` or `@type`, with no network at all. This is the second:
 * it takes the `<script type="application/ld+json">` elements the build under test serves on `/` and
 * on a case study, exactly as served, and posts them to `validator.schema.org/validate`, which checks
 * the vocabulary. A misspelled predicate such as `jobTitel` parses as JSON and comes back from it as
 * `INVALID_PREDICATE` at ERROR severity. It checks schema.org, not Google's rich-result eligibility:
 * only the Rich Results Test answers that, and it has no API.
 *
 * The endpoint is undocumented, so it cannot be allowed to decide a run (ADR 0004 keeps a third
 * party's status out of the gates). Every way it can fail to reach a verdict passes the test, with
 * an annotation and a log line saying why: a network error, a timeout, a non-2xx answer, a body that
 * is not the JSON it returned when probed, and an answer with no errors that says it read nothing.
 * The only failure is a verdict: `totalNumErrors` above zero.
 *
 * What the probe of 2026-09-28 showed, and this spec relies on: a POST of the form field `html`
 * answers 200 with `)]}'` (a guard against cross-site script inclusion) and a newline before the
 * JSON, whose `totalNumErrors`, `totalNumWarnings`, `numObjects` and top-level `errors` (each with an
 * `errorType` and its `args`) describe the verdict. A block that is not JSON is an error there too
 * (`JSON_PARSE_ERROR`, with `numObjects` 0). An empty `html` answers `fetchError: "NOT_FOUND"` with
 * zero errors and zero objects, which is why an error-free answer that read no object is treated as
 * no verdict rather than a pass.
 *
 * Only the script elements are sent, not the page: the validator needs nothing else, and the rest of
 * the document has no business going to a third party. Every value in them is in this public
 * repository already.
 */

// No retries: each one is another call to a third party, and every way that call itself can fail
// already passes. A verdict with errors is the same verdict on a retry.
test.describe.configure({ retries: 0, timeout: 30_000 });

// The requests go out from Node, not from the browser, so every project would send the same HTML and
// get the same answer: one project's worth is the whole check. Only the desktop `chromium` project runs
// the specs outside `e2e/mobile/` today, the two phone projects running that folder alone, so this is
// for the day a desktop WebKit or Firefox project is added, which would otherwise repeat the call.
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'an advisory third-party call, made once per run from Chromium',
);

const VALIDATOR_URL = 'https://validator.schema.org/validate';

/** Long enough for its measured sub-second answers, short enough that a hung endpoint costs little. */
const VALIDATOR_TIMEOUT_MS = 10_000;

/** What it prefixes every JSON answer with, so that the answer cannot run as a script. */
const XSSI_PREFIX = ")]}'";

/** The home page, whose blocks are the root layout's, and a case study, which adds its own two. */
const ROUTES = ['/', '/work/self-healing-agent'];

interface ValidatorError {
  errorType?: string;
  args?: unknown[];
}

interface ValidatorReport {
  totalNumErrors: number;
  totalNumWarnings?: number;
  /**
   * The top-level entities it read, not the blocks: a node another one names by `@id` is read as part
   * of it. 1 for the two blocks on `/`, whose WebSite names the Person as its author, and 2 for the
   * four on a case study, measured 2026-09-28.
   */
  numObjects?: number;
  fetchError?: string;
  errors?: ValidatorError[];
}

type Verdict = { reached: true; report: ValidatorReport } | { reached: false; why: string };

/**
 * Every ld+json script element in a served document, verbatim. A pattern is enough here: the blocks
 * are written through `serializeJsonLd`, which escapes every `<`, so none can contain `</script>`;
 * and Next's flight payload further down describes each one as a React element in escaped JSON
 * (`\"type\":\"application/ld+json\"`), which the pattern does not match, so nothing is sent twice.
 */
function ldJsonScripts(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi)].map(
    ([element]) => element,
  );
}

const firstLine = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0];

/** Posts the elements and reads the answer, or says why there is no answer to read. */
async function validate(request: APIRequestContext, html: string): Promise<Verdict> {
  let status: number;
  let body: string;
  try {
    const response = await request.post(VALIDATOR_URL, {
      form: { html },
      timeout: VALIDATOR_TIMEOUT_MS,
    });
    status = response.status();
    if (!response.ok()) return { reached: false, why: `it answered ${status}` };
    body = await response.text();
  } catch (error) {
    return { reached: false, why: `the request failed: ${firstLine(error)}` };
  }

  const json = body.startsWith(XSSI_PREFIX) ? body.slice(XSSI_PREFIX.length) : body;
  let report: unknown;
  try {
    report = JSON.parse(json);
  } catch {
    return { reached: false, why: `its ${status} body is not JSON: ${body.slice(0, 120)}` };
  }
  if (
    typeof report !== 'object' ||
    report === null ||
    typeof (report as ValidatorReport).totalNumErrors !== 'number'
  ) {
    return { reached: false, why: `its body has no totalNumErrors: ${json.slice(0, 120)}` };
  }
  const { totalNumErrors, numObjects, fetchError } = report as ValidatorReport;
  if (totalNumErrors === 0 && (fetchError !== undefined || !numObjects)) {
    return {
      reached: false,
      why: `it read no object (fetchError ${fetchError ?? 'none'}, numObjects ${numObjects ?? 'none'})`,
    };
  }
  return { reached: true, report: report as ValidatorReport };
}

/** The errors a report lists, as `errorType(args)`, read defensively: the shape is undocumented. */
function describeErrors({ errors }: ValidatorReport): string {
  if (!Array.isArray(errors)) return '(the report lists none)';
  return errors
    .map((error: ValidatorError | null) => {
      const args = error?.args;
      return `${error?.errorType}(${Array.isArray(args) ? args.join(', ') : ''})`;
    })
    .join('; ');
}

for (const path of ROUTES) {
  test(`validator.schema.org finds no error in the JSON-LD served on ${path}`, async ({
    request,
  }) => {
    // The build under test is not the third party: a page that fails to serve is a real failure.
    const served = await request.get(path);
    expect(served.status(), `${path} must be served`).toBe(200);
    const scripts = ldJsonScripts(await served.text());
    expect(scripts.length, `${path} must serve JSON-LD to validate`).toBeGreaterThan(0);

    const verdict = await validate(request, scripts.join('\n'));
    if (!verdict.reached) {
      const description =
        `validator.schema.org reached no verdict on ${path}, so this advisory check passes: ` +
        `${verdict.why}. The offline gate, json-ld.test.tsx under pnpm test, does not depend on it.`;
      test.info().annotations.push({ type: 'advisory: validator unavailable', description });
      console.warn(`[structured-data] ${description}`);
      return;
    }

    const { totalNumErrors, totalNumWarnings, numObjects } = verdict.report;
    test.info().annotations.push({
      type: 'validator.schema.org',
      description:
        `${path}: ${scripts.length} blocks sent, ${numObjects} objects read, ` +
        `${totalNumErrors} errors, ${totalNumWarnings ?? 0} warnings`,
    });
    expect(
      totalNumErrors,
      `validator.schema.org reports errors in the JSON-LD on ${path}: ${describeErrors(verdict.report)}`,
    ).toBe(0);
  });
}
