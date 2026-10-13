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
import { posts } from '@/data/posts';
import { NO_PUBLISHED_POST_SLUG } from '@/lib/post-static-params';
import { STATIC_PARAMS_ROUTES, WARM_UP_SLUG, warmUpPath } from '../../e2e/static-params-routes';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

/** Every source file under `src/app`, outside `__tests__`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.(m?[jt]sx?|mdx)$/.test(entry.name) ? [path] : [];
  });
}

/** `src/app/work/[slug]/index.json/route.ts` → `/work/[slug]/index.json`; route groups dropped. */
function routePattern(file: string): string {
  const segments = relative(APP_DIR, dirname(file))
    .split(sep)
    .filter((segment) => segment !== '' && !/^\(.*\)$/.test(segment));
  return `/${segments.join('/')}`;
}

/**
 * A named export of `generateStaticParams` (declared, or in an `export { … }` list), at the start
 * of a line, so a comment does not count. `export *` and destructured exports are not recognised;
 * no route uses them.
 */
const EXPORTS_STATIC_PARAMS =
  /^[ \t]*export\s+(?:(?:async\s+)?function\s*\*?\s*generateStaticParams\b|(?:const|let|var)\s+generateStaticParams\b|\{[^}]*\bgenerateStaticParams\b[^}]*\})/m;

describe('the dev-server warm-up route list', () => {
  it('recognises the named export forms and ignores comments', () => {
    const exporting = [
      'export function generateStaticParams() {}',
      'export async function generateStaticParams() {}',
      'export const generateStaticParams = () => [];',
      'export { generateStaticParams };',
      "export { generateStaticParams } from '../page';",
      "export { params as generateStaticParams } from './params';",
    ];
    const notExporting = [
      '// export function generateStaticParams() {}',
      ' * export function generateStaticParams() {}',
      'function generateStaticParams() {}',
      'export function generateStaticParamsFor() {}',
    ];
    for (const source of exporting) expect(EXPORTS_STATIC_PARAMS.test(source), source).toBe(true);
    for (const source of notExporting)
      expect(EXPORTS_STATIC_PARAMS.test(source), source).toBe(false);
  });

  it('lists exactly the routes under src/app that export generateStaticParams', () => {
    // A set: a page and a sibling module it re-exports from both match, for one route.
    const exporting = [
      ...new Set(
        sourceFiles(APP_DIR)
          .filter((file) => EXPORTS_STATIC_PARAMS.test(readFileSync(file, 'utf8')))
          .map(routePattern),
      ),
    ].sort();
    expect(exporting.length, 'the scan found no route at all: is APP_DIR right?').toBeGreaterThan(
      0,
    );
    expect([...STATIC_PARAMS_ROUTES].sort()).toEqual(exporting);
  });

  it('holds only patterns with one dynamic segment, [slug], which warmUpPath fills', () => {
    for (const pattern of STATIC_PARAMS_ROUTES) {
      expect(pattern.match(/\[[^\]]*\]/g), pattern).toEqual(['[slug]']);
    }
  });

  it('requests each route at a slug of its own pattern that no case study or post has', () => {
    expect(STATIC_PARAMS_ROUTES.map(warmUpPath)).toEqual([
      '/work/does-not-exist',
      '/work/does-not-exist/og-image.png',
      '/work/does-not-exist/index.md',
      '/work/does-not-exist/index.json',
      '/blog/does-not-exist',
      '/blog/does-not-exist/og-image.png',
      '/blog/does-not-exist/index.md',
    ]);
    const taken = [
      ...caseStudies.map(({ slug }) => slug),
      ...posts.map(({ slug }) => slug),
      NO_PUBLISHED_POST_SLUG,
    ];
    expect(taken).not.toContain(WARM_UP_SLUG);
  });
});
