/**
 * Reads route files and data modules, no DOM.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { publishedPosts } from '@/data/posts';
import { STATIC_PARAMS_ROUTES, staticParamsPaths } from '../../e2e/global-setup';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

/** Every page or route handler file under `src/app`, outside `__tests__`. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : routeFiles(path);
    return /^(page|route)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** `src/app/work/[slug]/index.json/route.ts` → `/work/[slug]/index.json`; route groups dropped. */
function routePattern(file: string): string {
  const segments = relative(APP_DIR, dirname(file))
    .split(sep)
    .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment));
  return `/${segments.join('/')}`;
}

const EXPORTS_STATIC_PARAMS = /export\s+(async\s+)?(function|const)\s+generateStaticParams\b/;

describe('global setup warm-up', () => {
  it('lists exactly the routes that export generateStaticParams', () => {
    const exporting = routeFiles(APP_DIR)
      .filter((file) => EXPORTS_STATIC_PARAMS.test(readFileSync(file, 'utf8')))
      .map(routePattern)
      .sort();
    expect(exporting.length, 'the scan found no route at all: is APP_DIR right?').toBeGreaterThan(
      0,
    );
    expect([...STATIC_PARAMS_ROUTES].sort()).toEqual(exporting);
  });

  it('serves one path per route that has entries, built from the first slug', () => {
    const work = caseStudies[0]?.slug;
    const post = publishedPosts[0]?.slug;
    const expected = STATIC_PARAMS_ROUTES.flatMap((pattern) => {
      const slug = pattern.startsWith('/work/') ? work : post;
      return slug === undefined ? [] : [pattern.replace('[slug]', encodeURIComponent(slug))];
    });
    expect(staticParamsPaths()).toEqual(expected);
    expect(
      work,
      'case-studies.ts has no study, so the /work routes would go unwarmed',
    ).toBeDefined();
    expect(staticParamsPaths().every((path) => !path.includes('['))).toBe(true);
  });
});
