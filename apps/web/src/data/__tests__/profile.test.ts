/**
 * The years of experience, derived from one constant (#49, pages-9 and live-14).
 *
 * The site used to state the figure by hand in four places, as two different numbers: a fixed count
 * in the Person JSON-LD and the hero's player card, and `10+` in the About description and quick
 * facts. A fixed count also goes stale every January. `profile.ts` holds the year the career starts
 * and derives the total from it, and every page reads the total from there.
 *
 * Pure data with no DOM in it, so it runs in node rather than paying for a jsdom window.
 *
 * @vitest-environment node
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { facts, timeline } from '../pages/about';
import {
  CAREER_START_YEAR,
  experienceFact,
  experienceFigureSince,
  yearsOfExperience,
} from '../profile';

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('yearsOfExperience', () => {
  it('counts the calendar years since the career started in 2013', () => {
    expect(CAREER_START_YEAR).toBe(2013);
    expect(yearsOfExperience(new Date('2026-09-28T12:00:00Z'))).toBe(13);
  });

  it('reads the clock when it is given no date, so the figure moves on by itself each January', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    expect(yearsOfExperience()).toBe(18);
  });

  it('turns over at midnight UTC on 1 January, whatever time zone the build runs in', () => {
    expect(yearsOfExperience(new Date('2026-12-31T23:59:59.999Z'))).toBe(13);
    expect(yearsOfExperience(new Date('2027-01-01T00:00:00.000Z'))).toBe(14);
  });

  it('refuses a date that would print "NaN years", "0 years" or fewer into a prerendered page', () => {
    expect(() => yearsOfExperience(new Date('not a date'))).toThrow(RangeError);
    expect(() => yearsOfExperience(new Date('2013-06-01T00:00:00Z'))).toThrow(/gives 0 years/);
    expect(() => yearsOfExperience(new Date('2010-06-01T00:00:00Z'))).toThrow(RangeError);
    expect(yearsOfExperience(new Date('2014-01-01T00:00:00Z'))).toBe(1);
  });

  it('starts where the /about timeline starts', () => {
    // The count is only as true as its start. The About page shows the career from its first role,
    // so a start year that disagreed with that row would contradict the page it is printed on.
    const years = timeline.map(({ year }) => {
      const leading = /^\d{4}/.exec(year)?.[0];
      expect(leading, `a timeline row's year, "${year}", starts with four digits`).toBeDefined();
      return Number(leading);
    });
    expect(years.length).toBeGreaterThan(0);
    expect(Math.min(...years)).toBe(CAREER_START_YEAR);
  });
});

describe('the day the printed figure took effect', () => {
  it('is 1 January of the year the figure is counted in', () => {
    expect(experienceFigureSince(new Date('2026-09-28T12:00:00Z'))).toBe('2026-01-01');
    expect(experienceFigureSince(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01-01');
  });

  it('moves the content dates of the two routes that print the figure, and only those', async () => {
    // `/` and /about change what they say every January with no commit, so their sitemap lastmod
    // has to move with the figure; the other routes keep the dates recorded by hand.
    const today = (await import('../static-routes')).STATIC_ROUTE_UPDATED;
    expect(today['/']).toBe('2026-09-25');
    expect(today['/about']).toBe('2026-09-30');

    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    const later = (await import('../static-routes')).STATIC_ROUTE_UPDATED;
    expect(later).toEqual({ ...today, '/': '2031-01-01', '/about': '2031-01-01' });
  });
});

describe('the quick fact that states it', () => {
  it('prints the derived figure', () => {
    expect(experienceFact(new Date('2026-09-28T12:00:00Z'))).toEqual({
      label: 'Years shipping code',
      value: '13',
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2031-06-15T12:00:00Z'));
    expect(experienceFact().value).toBe('18');
  });

  it('is the fact the /about record lists, whole', () => {
    expect(facts).toContainEqual(experienceFact());
  });
});

describe('who may read it', () => {
  // The figure is computed where the module runs. A server module computes it once, at build time,
  // and the page ships that text. A client module would compute it again in the visitor's browser,
  // so a page built in December and hydrated in January would disagree with its own markup: a
  // hydration mismatch in the console. `'use client'` makes every module it imports a client module
  // too, so the walk follows value imports from each client entry, not only its direct ones.
  const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const PROFILE = join(SRC, 'data/profile.ts');

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === '__tests__' || path === join(SRC, 'test') ? [] : sourceFiles(path);
      }
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  /** Whether the first statement, after any whitespace and comments, is the `'use client'` directive. */
  const isClientEntry = (source: string): boolean => {
    // A loop rather than one regex over `(?:\s|//…|/*…*/)*`: CodeQL flags that as exponential
    // backtracking (js/redos), because its alternatives can match the same text more than one way.
    let rest = source;
    for (;;) {
      rest = rest.trimStart();
      if (rest.startsWith('//')) {
        const end = rest.indexOf('\n');
        rest = end === -1 ? '' : rest.slice(end + 1);
      } else if (rest.startsWith('/*')) {
        const end = rest.indexOf('*/', 2);
        if (end === -1) return false;
        rest = rest.slice(end + 2);
      } else {
        return /^['"]use client['"]/.test(rest);
      }
    }
  };

  /** Value imports and re-exports, static or dynamic; `import type` and `export type` bring no code. */
  const specifiers = (source: string) =>
    [
      ...source.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^'";]*?\bfrom\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map(([, specifier]) => specifier);

  const resolveLocal = (from: string, specifier: string): string | undefined => {
    const base = specifier.startsWith('@/')
      ? join(SRC, specifier.slice(2))
      : specifier.startsWith('.')
        ? resolve(dirname(from), specifier)
        : undefined;
    if (base === undefined) return undefined;
    return ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
      .map((suffix) => base + suffix)
      .find((path) => existsSync(path) && statSync(path).isFile());
  };

  /** The import chain from `entry` to profile.ts, or undefined when there is none. */
  const chainToProfile = (entry: string): string[] | undefined => {
    const seen = new Set<string>([entry]);
    const queue: string[][] = [[entry]];
    while (queue.length > 0) {
      const chain = queue.shift()!;
      const file = chain[chain.length - 1];
      for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
        const target = resolveLocal(file, specifier);
        if (target === undefined || seen.has(target)) continue;
        if (target === PROFILE) return [...chain, target];
        seen.add(target);
        queue.push([...chain, target]);
      }
    }
    return undefined;
  };

  it('finds the client modules and the imports it walks', () => {
    // The walk is only as good as its parsing, so prove it on the tree: there are client entries,
    // and the server modules that print the figure do reach profile.ts.
    const clients = sourceFiles(SRC).filter((file) => isClientEntry(readFileSync(file, 'utf8')));
    expect(clients.length).toBeGreaterThan(10);
    for (const reader of [
      'components/json-ld.tsx',
      'components/animated-hero/hero-content.tsx',
      'app/about/page.tsx',
      'app/sitemap.ts',
    ]) {
      expect(chainToProfile(join(SRC, reader)), reader).toBeDefined();
    }
  });

  it('no client module reaches data/profile.ts', () => {
    const chains = sourceFiles(SRC)
      .filter((file) => isClientEntry(readFileSync(file, 'utf8')))
      .map(chainToProfile)
      .filter((chain) => chain !== undefined)
      .map((chain) => chain.map((file) => relative(SRC, file)).join(' -> '));
    expect(
      chains,
      'a client module computes the years again in the browser: pass the figure down as a prop ' +
        'from a server component instead',
    ).toEqual([]);
  });
});
