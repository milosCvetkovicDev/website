/**
 * The pure half of `e2e/lighthouse-audits.spec.ts`: what counts as a pass, as a load failure, as a
 * report about the page asked for, and how the CLI's output is read. These branches decide whether
 * the Lighthouse gate can fail at all, and a live run only exercises the modes the site happens to
 * produce, so a flipped condition here would pass unseen. No browser.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIGHTHOUSE_VERSION,
  auditFailure,
  chosenRunner,
  clip,
  describeDetails,
  isImportFailure,
  parseCliReport,
  readDevToolsPort,
  reportFromCliFailure,
  reportProblem,
  versionProblem,
  withDeadline,
  type LighthouseAudit,
  type LighthouseReport,
} from '../../e2e/support/lighthouse';

const URL_UNDER_TEST = 'http://localhost:3210/work/self-healing-agent';

const audit = (overrides: Partial<LighthouseAudit>): LighthouseAudit => ({
  id: 'canonical',
  title: 'Document has a valid `rel=canonical`',
  score: 1,
  scoreDisplayMode: 'binary',
  ...overrides,
});

const report = (overrides: Partial<LighthouseReport> = {}): LighthouseReport => ({
  lighthouseVersion: LIGHTHOUSE_VERSION,
  finalDisplayedUrl: URL_UNDER_TEST,
  audits: { canonical: audit({}) },
  ...overrides,
});

const codeError = (code: string) => Object.assign(new Error(code), { code });

describe('auditFailure', () => {
  it('passes a scored audit that scored 1, in every mode that carries a score', () => {
    for (const scoreDisplayMode of ['binary', 'numeric', 'metricSavings']) {
      expect(auditFailure('canonical', '/', audit({ scoreDisplayMode }))).toBeUndefined();
    }
  });

  it('never passes notApplicable, whatever the score says, and names the audit and route', () => {
    const failure = auditFailure(
      'canonical',
      '/work/x',
      audit({ scoreDisplayMode: 'notApplicable', score: null }),
    );
    expect(failure).toMatch(/canonical as notApplicable on \/work\/x.*never a pass/);
    // A score of 1 beside notApplicable is still not a pass.
    expect(auditFailure('llms-txt', '/', audit({ scoreDisplayMode: 'notApplicable' }))).toMatch(
      /never a pass/,
    );
  });

  it('fails every mode that carries no score, even with a score of 1 attached', () => {
    for (const scoreDisplayMode of ['manual', 'informative', 'error', 'somethingNew']) {
      expect(auditFailure('robots-txt', '/', audit({ scoreDisplayMode, score: 1 }))).toContain(
        `robots-txt as ${scoreDisplayMode} on /, which carries no score`,
      );
    }
  });

  it('fails a scored audit below 1, with what Lighthouse said about it', () => {
    const failure = auditFailure(
      'meta-description',
      '/',
      audit({ score: 0, explanation: 'Description text is empty.' }),
    );
    expect(failure).toBe('meta-description on / scored 0, not 1: Description text is empty.');
    expect(
      auditFailure('is-crawlable', '/', audit({ score: 0.5, scoreDisplayMode: 'numeric' })),
    ).toMatch(/scored 0\.5, not 1/);
    expect(auditFailure('is-crawlable', '/', audit({ score: null }))).toMatch(/scored null/);
  });
});

describe('isImportFailure', () => {
  it('takes the ESM loader refusing the module as a load failure', () => {
    for (const code of [
      'ERR_REQUIRE_ESM',
      'ERR_REQUIRE_ASYNC_MODULE',
      'ERR_UNKNOWN_FILE_EXTENSION',
      'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING',
    ]) {
      expect(isImportFailure(codeError(code)), code).toBe(true);
    }
  });

  it('does not fall back on a missing package, which the CLI cannot find either', () => {
    expect(isImportFailure(codeError('MODULE_NOT_FOUND'))).toBe(false);
    expect(isImportFailure(codeError('ERR_MODULE_NOT_FOUND'))).toBe(false);
  });

  it('does not fall back on an error without a code, or on anything that is not an error', () => {
    expect(isImportFailure(new Error('protocol timeout'))).toBe(false);
    expect(isImportFailure(codeError('ECONNREFUSED'))).toBe(false);
    expect(isImportFailure(null)).toBe(false);
    expect(isImportFailure('ERR_REQUIRE_ESM')).toBe(false);
  });
});

describe('chosenRunner', () => {
  it('runs in-process unless LIGHTHOUSE_RUNNER is exactly cli', () => {
    expect(chosenRunner(undefined)).toBe('in-process');
    expect(chosenRunner('')).toBe('in-process');
    expect(chosenRunner('cli')).toBe('cli');
  });

  it('throws on any other value rather than quietly running in-process', () => {
    for (const value of ['CLI', 'cli ', 'in-process', 'yes']) {
      expect(() => chosenRunner(value), value).toThrow(/must be unset or 'cli'/);
    }
  });
});

describe('parseCliReport', () => {
  it('reads a report with audits', () => {
    expect(parseCliReport(JSON.stringify(report()), URL_UNDER_TEST)).toEqual(report());
  });

  it('names the URL and the output when stdout is not JSON', () => {
    expect(() => parseCliReport('Runtime error encountered', URL_UNDER_TEST)).toThrow(
      `printed no JSON report for ${URL_UNDER_TEST}: Runtime error encountered`,
    );
    expect(() => parseCliReport('', URL_UNDER_TEST)).toThrow(/printed no JSON report/);
  });

  it('refuses JSON without an audits object, so no row reads "returned no audit" instead', () => {
    for (const json of ['{"lighthouseVersion":"13.4.1"}', 'null', '{"audits":"none"}']) {
      expect(() => parseCliReport(json, URL_UNDER_TEST), json).toThrow(/JSON with no audits/);
    }
  });
});

describe('reportFromCliFailure', () => {
  it('reads the report a CLI run printed before exiting 1 on a runtime error', () => {
    const failed = report({ runtimeError: { code: 'NO_FCP', message: 'no paint' } });
    const error = Object.assign(new Error('Command failed'), {
      code: 1,
      stdout: `\n${JSON.stringify(failed)}`,
    });
    expect(reportFromCliFailure(error, URL_UNDER_TEST)).toEqual(failed);
  });

  it('rethrows the original error when the CLI printed no report', () => {
    const error = Object.assign(new Error('Command failed: ECONNREFUSED'), { stdout: '' });
    expect(() => reportFromCliFailure(error, URL_UNDER_TEST)).toThrow(error);
    const killed = Object.assign(new Error('killed'), { killed: true });
    expect(() => reportFromCliFailure(killed, URL_UNDER_TEST)).toThrow(killed);
  });
});

describe('reportProblem', () => {
  it('accepts a report on the path asked for', () => {
    expect(reportProblem(report(), '/work/self-healing-agent')).toBeUndefined();
    expect(
      reportProblem(report({ finalDisplayedUrl: 'http://localhost:3210/' }), '/'),
    ).toBeUndefined();
  });

  it('names a runtime error', () => {
    const problem = reportProblem(
      report({ runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'status 500' } }),
      '/work/self-healing-agent',
    );
    expect(problem).toBe(
      'Lighthouse could not audit /work/self-healing-agent: ERRORED_DOCUMENT_REQUEST, status 500',
    );
  });

  it('refuses a report whose final URL is on another path: a redirect audited the target', () => {
    for (const finalDisplayedUrl of [
      'http://localhost:3210/',
      'http://localhost:3210/work',
      'http://localhost:3210/work/self-healing-agent/',
      'not a url',
    ]) {
      expect(reportProblem(report({ finalDisplayedUrl }), '/work/self-healing-agent')).toBe(
        `Lighthouse was asked for /work/self-healing-agent but audited ${finalDisplayedUrl}`,
      );
    }
  });
});

describe('versionProblem', () => {
  it('accepts the pinned version', () => {
    expect(versionProblem(report())).toBeUndefined();
  });

  it('fails any other version, so a bump that keeps the ids still forces the re-read', () => {
    expect(versionProblem(report({ lighthouseVersion: '13.5.0' }))).toMatch(
      /^Lighthouse 13\.5\.0 ran, but the spec describes 13\.4\.1\. Re-read/,
    );
  });
});

describe('describeDetails and clip', () => {
  it('collects the readable strings in the items and ignores the rest', () => {
    const details = {
      type: 'table',
      headings: [{ key: 'node', label: 'ignored' }],
      items: [
        { node: { snippet: '<a href="#">', selector: 'a.x' } },
        { subItems: { items: [{ description: 'Links do not have a discernible name' }] } },
      ],
    };
    expect(describeDetails(details)).toBe('<a href="#">; Links do not have a discernible name');
    expect(describeDetails(undefined)).toBe('');
  });

  it('clips by code point, so an emoji at the cut is never split', () => {
    const text = `${'a'.repeat(399)}😀tail`;
    const clipped = clip(text, 400);
    expect(clipped).toBe(`${'a'.repeat(399)}😀…`);
    expect(clip('short', 400)).toBe('short');
  });
});

describe('readDevToolsPort', () => {
  it('reads the port on the first line of the file Chromium writes', () => {
    expect(readDevToolsPort('53117\n/devtools/browser/0b6f-4d2a\n')).toBe(53117);
  });

  it('reads nothing from a file that is empty, half written or not a port', () => {
    for (const contents of ['', '\n', '0\n/devtools', '70000\n', 'port\n', '12ab\n']) {
      expect(readDevToolsPort(contents), JSON.stringify(contents)).toBeUndefined();
    }
  });
});

describe('withDeadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the work when it finishes in time', async () => {
    await expect(withDeadline(Promise.resolve('report'), 1000, 'Lighthouse')).resolves.toBe(
      'report',
    );
  });

  it('passes the work’s own error through', async () => {
    await expect(
      withDeadline(Promise.reject(new Error('protocol error')), 1000, 'Lighthouse'),
    ).rejects.toThrow('protocol error');
  });

  it('fails with a named error once the deadline passes, and swallows the work’s later failure', async () => {
    vi.useFakeTimers();
    let fail: (error: Error) => void = () => {};
    const work = new Promise<string>((_, reject) => {
      fail = reject;
    });
    const raced = withDeadline(work, 100_000, 'Lighthouse on http://localhost:3210/');
    const settled = expect(raced).rejects.toThrow(
      'Lighthouse on http://localhost:3210/ did not finish in 100000 ms',
    );
    await vi.advanceTimersByTimeAsync(100_000);
    await settled;
    vi.useRealTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    fail(new Error('Target closed'));
    await new Promise((resolve) => setImmediate(resolve));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
