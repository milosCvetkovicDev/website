import { expect, test, type APIRequestContext } from '@playwright/test';
import { CASE_STUDY_ROUTES } from './routes';
import { jsonLdOpenTagCount, jsonLdScripts } from './support/json-ld';
import { clip, describeErrors, readVerdict, type Verdict } from './support/schema-validator';

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
 * is not the JSON it returned when probed, an answer with a `fetchError`, and an answer with no
 * errors that says it read nothing. The only failure is a verdict: `totalNumErrors` above zero.
 * `readVerdict` in `support/schema-validator.ts` draws that line, and
 * `src/test/schema-validator.test.ts` pins it. Failing open can hide a check that has stopped
 * working, a changed contract answering 4xx on every run for instance, so
 * `SCHEMA_VALIDATOR_STRICT=1` turns every no-verdict into a failure, for whoever wants to know that
 * the check still reaches a verdict.
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
// already passes. A verdict with errors is the same verdict on a retry. `mode: 'default'` runs the
// file's tests one after the other in one worker, whatever `fullyParallel` says, so a local run
// never sends the validator two requests at once; unlike `serial`, a failure does not skip the rest.
test.describe.configure({ mode: 'default', retries: 0, timeout: 30_000 });

// The requests go out from Node, not from the browser, so every project would send the same HTML and
// get the same answer: one project's worth is the whole check. Keyed on the project's name rather
// than its browser, because a second Chromium project (a channel, another device) reports
// `browserName` 'chromium' too and would repeat the call. Only `chromium` runs the specs outside
// `e2e/mobile/` today; this holds whatever projects are added.
test.skip(
  () => test.info().project.name !== 'chromium',
  'an advisory third-party call, made once per run from the desktop chromium project',
);

const VALIDATOR_URL = 'https://validator.schema.org/validate';

/** Long enough for its measured sub-second answers, short enough that a hung endpoint costs little. */
const VALIDATOR_TIMEOUT_MS = 10_000;

/** Set to 1 to fail on no verdict, for checking that the advisory check still reaches one. */
const STRICT = process.env.SCHEMA_VALIDATOR_STRICT === '1';

/**
 * The home page, whose blocks are the root layout's, and one case study, which adds its own two, taken
 * from the data file so a renamed slug cannot leave this spec asking for a page that is gone. One
 * study stands for all: every study renders the same two components with the same predicates, and
 * the offline gate parses every study's blocks; each further study is another third-party call.
 */
const ROUTES = ['/', ...CASE_STUDY_ROUTES.slice(0, 1)];

/** Posts the elements and reads the answer, or says why there is no answer to read. */
async function validate(request: APIRequestContext, html: string): Promise<Verdict> {
  try {
    const response = await request.post(VALIDATOR_URL, {
      form: { html },
      timeout: VALIDATOR_TIMEOUT_MS,
    });
    return readVerdict(response.status(), response.ok() ? await response.text() : '');
  } catch (error) {
    return {
      reached: false,
      why: `the request failed: ${clip(error instanceof Error ? error.message : String(error))}`,
    };
  }
}

for (const path of ROUTES) {
  test(`validator.schema.org finds no error in the JSON-LD served on ${path}`, async ({
    request,
  }) => {
    // The build under test is not the third party: a page that fails to serve is a real failure.
    const served = await request.get(path);
    expect(served.status(), `${path} must be served`).toBe(200);
    const html = await served.text();
    const scripts = jsonLdScripts(html);
    expect(scripts.length, `${path} must serve JSON-LD to validate`).toBeGreaterThan(0);
    expect(
      scripts.length,
      `every ld+json script tag on ${path} must be extracted, or a block goes unvalidated`,
    ).toBe(jsonLdOpenTagCount(html));

    const verdict = await validate(request, scripts.join('\n'));
    if (!verdict.reached) {
      const description =
        `validator.schema.org reached no verdict on ${path}, so this advisory check passes: ` +
        `${verdict.why}. The offline gate, json-ld.test.tsx under pnpm test, does not depend on it.`;
      test.info().annotations.push({ type: 'advisory: validator unavailable', description });
      console.warn(`[structured-data] ${description}`);
      expect(STRICT, `SCHEMA_VALIDATOR_STRICT=1: ${description}`).toBe(false);
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
