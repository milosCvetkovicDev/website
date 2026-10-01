/**
 * @vitest-environment node
 *
 * The case studies as JSON (#60): `caseStudyToJson()` and `caseStudiesToJson()` in `serialise.ts`,
 * and the two static handlers that serve them, `/case-studies.json` and `/work/<slug>/index.json`.
 *
 * The field check reads the data, not the interface: every key of every study must reach its entry,
 * with the same value, beside the two derived URLs, so a serialiser change cannot drop a key and a
 * new `CaseStudy` field cannot ship without the JSON carrying it. The two exceptions are written
 * out: the highlight's metric gains its `formatMetric()` rendering, and a metric definition that is
 * still the owner's placeholder is served as `null`, because a marker never reaches served output.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseStudies, formatMetric, type CaseStudy } from '@/data/case-studies';
import { OWNER_TODO, ownerTodo } from '@/data/owner-todo';
import { markdownTwinPath } from '../pathname';
import { caseStudiesToJson, caseStudyToJson, jsonResponse } from '../serialise';

const ORIGIN = 'https://miloscvetkovic.dev';
const APP = join(dirname(fileURLToPath(import.meta.url)), '../../app');

beforeEach(() => {
  // Empty, as an unset variable is: the URLs fall back to production, as `metadataBase` does.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The keys the JSON adds to every study: its page and its Markdown twin, both absolute. */
const DERIVED_KEYS = ['url', 'markdown'];

const route = (study: CaseStudy) => `/work/${study.slug}`;

/** A study whose metric definition is filled in, as it will be once the owner supplies it. */
const defined = (study: CaseStudy, method = 'The median time from alert to resolved incident.') =>
  ({
    ...study,
    metricDefinition: {
      state: 'defined',
      window: { from: '2026-01-05', to: '2026-03-27' },
      method,
    },
  }) satisfies CaseStudy;

interface ListHandler {
  dynamic?: string;
  GET: () => Response | Promise<Response>;
}

interface StudyHandler {
  dynamic?: string;
  dynamicParams?: boolean;
  generateStaticParams: () => { slug: string }[];
  GET: (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;
}

describe('caseStudiesToJson', () => {
  it('is every case study, in the data module’s order, each as caseStudyToJson renders it', () => {
    const entries = caseStudiesToJson();
    expect(entries).toHaveLength(caseStudies.length);
    expect(entries).toEqual(caseStudies.map((study) => caseStudyToJson(study)));
  });

  it('survives a JSON round trip unchanged, so nothing in it is lost on the way out', () => {
    const entries = caseStudiesToJson();
    expect(JSON.parse(JSON.stringify(entries))).toStrictEqual(entries);
  });

  it('never serves the owner’s placeholder marker', () => {
    expect(JSON.stringify(caseStudiesToJson())).not.toContain(OWNER_TODO);
  });
});

describe.each(caseStudies.map((study) => [study.slug, study] as const))(
  'caseStudyToJson(%s)',
  (_slug, study) => {
    it('has exactly the study’s own keys plus url and markdown', () => {
      expect(Object.keys(caseStudyToJson(study)).sort()).toEqual(
        [...Object.keys(study), ...DERIVED_KEYS].sort(),
      );
    });

    it('carries every field as the data module holds it', () => {
      const entry = caseStudyToJson(study) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(study)) {
        if (key === 'highlight' || key === 'metricDefinition') continue;
        expect(entry[key], key).toStrictEqual(value);
      }
    });

    it('serves its metric definition as the data states it, or null while it is the placeholder', () => {
      // The data test requires every defined study to be statable, so only the placeholder is null.
      const definition = study.metricDefinition;
      expect(caseStudyToJson(study).metricDefinition).toStrictEqual(
        definition.state === 'defined'
          ? { ...definition, method: definition.method.replace(/\s+/g, ' ').trim() }
          : null,
      );
    });

    it('renders the highlight’s metric through formatMetric, beside its raw parts', () => {
      const { highlight } = caseStudyToJson(study);
      expect(highlight).toStrictEqual({
        ...study.highlight,
        metric: { ...study.highlight.metric, formatted: formatMetric(study.highlight.metric) },
      });
    });

    it('links its page and its Markdown twin by absolute URL on the site’s origin', () => {
      const { url, markdown } = caseStudyToJson(study);
      expect(url).toBe(`${ORIGIN}${route(study)}`);
      expect(markdown).toBe(`${ORIGIN}${markdownTwinPath(route(study))}`);
      expect(markdown).toBe(`${ORIGIN}/work/${study.slug}/index.md`);
    });
  },
);

describe('caseStudyToJson', () => {
  it('serves an unfilled metric definition as null and a stated one as it stands', () => {
    const [study] = caseStudies;
    const unfilled = { ...study, metricDefinition: { state: OWNER_TODO } } satisfies CaseStudy;
    expect(caseStudyToJson(unfilled).metricDefinition).toBeNull();

    const filled = defined(study);
    expect(caseStudyToJson(filled).metricDefinition).toStrictEqual(filled.metricDefinition);
  });

  it('serves a definition formatMetricScope could not state as null too', () => {
    // A blank method, or one still carrying a marker, is not a statement the page could make.
    const [study] = caseStudies;
    expect(caseStudyToJson(defined(study, '  ')).metricDefinition).toBeNull();
    expect(
      caseStudyToJson(defined(study, `Over ${OWNER_TODO}(the incident count).`)).metricDefinition,
    ).toBeNull();
  });

  it('serves the method on one line, as the page’s sentence states it', () => {
    const [study] = caseStudies;
    const padded = defined(study, '  The median time\n from alert  to resolved incident.\n');
    expect(caseStudyToJson(padded).metricDefinition).toStrictEqual({
      ...padded.metricDefinition,
      method: 'The median time from alert to resolved incident.',
    });
  });

  it('serves a definition whose window ends before it starts as null', () => {
    const [study] = caseStudies;
    const inverted = {
      ...study,
      metricDefinition: {
        ...defined(study).metricDefinition,
        window: { from: '2026-03-27', to: '2026-01-05' },
      },
    } satisfies CaseStudy;
    expect(caseStudyToJson(inverted).metricDefinition).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'fails, naming the study, rather than serve a metric value of %s that JSON writes as null',
    (value) => {
      const [study] = caseStudies;
      const broken = {
        ...study,
        highlight: { ...study.highlight, metric: { ...study.highlight.metric, value } },
      } satisfies CaseStudy;
      expect(() => caseStudyToJson(broken)).toThrow(`caseStudyToJson(${study.slug})`);
      expect(() => caseStudyToJson(broken)).toThrow('not finite');
    },
  );

  it('fails, naming the study, rather than serve a placeholder marker in any other field', () => {
    const [study] = caseStudies;
    const drafted = {
      ...study,
      lessons: [`Lesson ${ownerTodo('the lesson')}.`],
    } satisfies CaseStudy;
    expect(() => caseStudyToJson(drafted)).toThrow(`caseStudyToJson(${study.slug})`);
    expect(() => caseStudyToJson({ ...study, description: ownerTodo('the summary') })).toThrow(
      OWNER_TODO,
    );
  });

  it('takes its origin from NEXT_PUBLIC_SITE_URL, as metadataBase does', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.com/');
    const [study] = caseStudies;
    const { url, markdown } = caseStudyToJson(study);
    expect(url).toBe(`https://preview.example.com/work/${study.slug}`);
    expect(markdown).toBe(`https://preview.example.com/work/${study.slug}/index.md`);
  });
});

describe('jsonResponse', () => {
  it('serves a JSON value as its text, with the JSON content type', async () => {
    const response = jsonResponse([{ a: 1 }]);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.text()).toBe('[{"a":1}]');
  });

  it.each([undefined, () => 1, Symbol('x')])(
    'fails rather than serve an empty body for %s, which JSON cannot write',
    (value) => {
      expect(() => jsonResponse(value)).toThrow('is not a JSON value');
    },
  );
});

describe('the JSON handlers', () => {
  it('serves every case study as one static JSON array at /case-studies.json', async () => {
    const handler = (await import(join(APP, 'case-studies.json', 'route.ts'))) as ListHandler;
    expect(handler.dynamic).toBe('force-static');
    const response = await handler.GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    const body = await response.text();
    expect(body).toBe(JSON.stringify(caseStudiesToJson()));
    const parsed: unknown = JSON.parse(body);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(caseStudies.length);
  });

  it('serves each case study, and only those, from one static handler', async () => {
    const handler = (await import(
      join(APP, 'work', '[slug]', 'index.json', 'route.ts')
    )) as StudyHandler;
    expect(handler.dynamic).toBe('force-static');
    // An unknown slug is a routing-level 404, as the page's and the twin's are (ADR 0015).
    expect(handler.dynamicParams).toBe(false);
    expect(handler.generateStaticParams()).toEqual(caseStudies.map(({ slug }) => ({ slug })));

    for (const study of caseStudies) {
      const response = await handler.GET(new Request('http://localhost/'), {
        params: Promise.resolve({ slug: study.slug }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/json');
      expect(await response.text(), study.slug).toBe(JSON.stringify(caseStudyToJson(study)));
    }
  });

  it('names the slug when asked for a study it does not have', async () => {
    const handler = (await import(
      join(APP, 'work', '[slug]', 'index.json', 'route.ts')
    )) as StudyHandler;
    await expect(
      handler.GET(new Request('http://localhost/'), {
        params: Promise.resolve({ slug: 'no-such-study' }),
      }),
    ).rejects.toThrow('"no-such-study"');
  });
});
