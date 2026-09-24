/**
 * These assertions run ESLint over strings, with no DOM in them, and building a jsdom window is the
 * most expensive thing in a test file that does not need one -- importing the module alone costs
 * about two seconds in every worker.
 *
 * @vitest-environment node
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const RULE = 'no-restricted-imports';

/**
 * A layout module importing `specifier`. The body has to reference the import, so that an unused
 * binding does not turn the case into a test of a different rule.
 */
const layout = (specifier: string) => `import { Navigation } from '${specifier}';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Navigation />
      {children}
    </div>
  );
}
`;

let eslint: ESLint;

/**
 * `lintText` needs no file on disk, so each case is a path the rule's `src/app/**\/layout.tsx` glob
 * has to match rather than a fixture that has to exist. That keeps the nested case working when
 * `src/app/skills/layout.tsx` is folded into its page: any nested layout path proves the relative
 * spelling.
 */
async function restrictedImportMessages(specifier: string, filePath: string) {
  return lintedMessages(layout(specifier), filePath);
}

/**
 * The rule's messages for `source` linted as `filePath`, or an error when ESLint did not lint it. A
 * parse error or an ignore pattern also yields no rule message, so without this the cases that
 * expect none would pass having tested nothing.
 */
async function lintedMessages(source: string, filePath: string) {
  const [result] = await eslint.lintText(source, { filePath: path.join(appDir, filePath) });
  const unlinted = result.messages.filter((message) => message.ruleId === null);
  if (result.fatalErrorCount > 0 || unlinted.length > 0) {
    const reasons = unlinted.map((message) => message.message).join('; ');
    throw new Error(`ESLint did not lint ${filePath}: ${reasons}`);
  }
  return result.messages.filter((message) => message.ruleId === RULE);
}

describe('the layout barrel-import rule (ADR 0009)', () => {
  // ESLint loads its configuration lazily, on the first lint, and this configuration is
  // eslint-config-next with typescript-eslint and five plugins behind it. Measured on an idle
  // machine: importing that graph takes 1.7 s and the first lint 0.3 s; every lint after it takes
  // about 9 ms. Under a full `pnpm test`, with a jsdom window building in every other worker, the
  // same load was measured past 15 s when it sat inside the first case.
  //
  // So the load is paid once, here, under one explicit timeout that says what it is for, and each
  // case below runs on the 5 s default and measures only the rule. The ceiling is generous because
  // contention, not this file, sets the cost; a configuration that genuinely fails to load still
  // fails here rather than hanging.
  beforeAll(async () => {
    eslint = new ESLint({ cwd: appDir });
    await eslint.lintText(layout('@/components/navigation'), {
      filePath: path.join(appDir, 'src/app/layout.tsx'),
    });
  }, 60_000);

  // Every one of these resolves to src/components/index.ts, so every one of them ships the barrel --
  // and therefore FeaturedWork and the rest of the client components -- into the layout chunk. The
  // rule matched only the first spelling until it moved from `paths` to a `patterns` regex.
  it.each([
    ['@/components', 'src/app/layout.tsx'],
    ['@/components/', 'src/app/layout.tsx'],
    ['@/components/index', 'src/app/layout.tsx'],
    ['@/components/index.ts', 'src/app/layout.tsx'],
    ['@/components/index.tsx', 'src/app/layout.tsx'],
    ['@/components/index.js', 'src/app/layout.tsx'],
    ['@/components/index.jsx', 'src/app/layout.tsx'],
    ['../components', 'src/app/layout.tsx'],
    ['../components/', 'src/app/layout.tsx'],
    ['../components/index', 'src/app/layout.tsx'],
    ['../../components', 'src/app/skills/layout.tsx'],
    ['../../components/index.ts', 'src/app/skills/layout.tsx'],
  ])('rejects %j in %s', async (specifier, filePath) => {
    const messages = await restrictedImportMessages(specifier, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('ADR 0009');
  });

  // The compliant spelling, and near misses that the regex's anchors and its `/index` group have to
  // let through: none of them is the barrel.
  it.each([
    '@/components/navigation',
    '../components/navigation',
    '@/components/index/navigation',
    '@/components-legacy',
    '@/componentsX',
    '@/components/index.css',
  ])('allows %j in a layout', async (specifier) => {
    expect(await restrictedImportMessages(specifier, 'src/app/layout.tsx')).toEqual([]);
  });

  // The negative cases above are only evidence if ESLint actually linted the file.
  it('refuses to report no messages for a file ESLint ignored or could not parse', async () => {
    await expect(restrictedImportMessages('@/components', '.next/app/layout.tsx')).rejects.toThrow(
      /did not lint/,
    );
    await expect(lintedMessages('import {', 'src/app/layout.tsx')).rejects.toThrow(/did not lint/);
  });

  // The rule is scoped to layouts. A page may import the barrel: it ships to that route only.
  it('leaves pages alone', async () => {
    expect(await restrictedImportMessages('@/components', 'src/app/page.tsx')).toEqual([]);
  });
});

describe('the lazy GSAP import rule', () => {
  const GSAP_RULE = '@typescript-eslint/no-restricted-imports';

  /** The GSAP rule's messages for `source` linted as `filePath`; throws if it was not linted. */
  async function gsapImportMessages(source: string, filePath: string) {
    const [result] = await eslint.lintText(source, { filePath: path.join(appDir, filePath) });
    const unlinted = result.messages.filter((message) => message.ruleId === null);
    if (result.fatalErrorCount > 0 || unlinted.length > 0) {
      const reasons = unlinted.map((message) => message.message).join('; ');
      throw new Error(`ESLint did not lint ${filePath}: ${reasons}`);
    }
    return result.messages.filter((message) => message.ruleId === GSAP_RULE);
  }

  // The barrel-rule block above loads the configuration first when the whole file runs; this one
  // does not rely on it, for a run filtered to these cases alone.
  beforeAll(async () => {
    eslint ??= new ESLint({ cwd: appDir });
    await eslint.lintText('export {};\n', {
      filePath: path.join(appDir, 'src/components/animated-hero/index.tsx'),
    });
  }, 60_000);

  // Each of these, anywhere `/` reaches, puts GSAP back into the home page's initial chunk.
  it.each([
    ["import gsap from 'gsap';", 'src/components/animated-hero/discovery-phase.tsx'],
    ["import { gsap } from 'gsap';", 'src/components/featured-work.tsx'],
    ["import { ScrollTrigger } from 'gsap/ScrollTrigger';", 'src/hooks/use-scroll.ts'],
    ["import { gsap } from './gsap-runtime';", 'src/components/animated-hero/strategy-phase.tsx'],
    ["import * as runtime from './gsap-runtime.ts';", 'src/components/animated-hero/x.tsx'],
    ["export { gsap } from './gsap-runtime';", 'src/components/animated-hero/x.ts'],
    ["import { gsap } from '@/components/animated-hero/gsap-runtime';", 'src/app/page.tsx'],
    ["import { gsap } from '../components/animated-hero/gsap-runtime';", 'src/app/layout.tsx'],
  ])('rejects %j in %s', async (source, filePath) => {
    const messages = await gsapImportMessages(`${source}\nexport const used = 1;\n`, filePath);
    expect(messages).toHaveLength(1);
  });

  it.each([
    // Types are erased, so they ship nothing.
    [
      "import type * as GsapRuntimeModule from './gsap-runtime';",
      'src/components/animated-hero/load-gsap.ts',
    ],
    ["import type { gsap } from 'gsap';", 'src/components/animated-hero/x.ts'],
    // The one sanctioned way in, and the module it loads.
    [
      "export const load = () => import('./gsap-runtime');",
      'src/components/animated-hero/load-gsap.ts',
    ],
    ["import gsap from 'gsap';", 'src/components/animated-hero/gsap-runtime.ts'],
    // Tests drive GSAP directly and ship nowhere.
    [
      "import { gsap } from '../gsap-runtime';",
      'src/components/animated-hero/__tests__/x.test.tsx',
    ],
    // Near misses.
    ["import { runWithGsap } from './load-gsap';", 'src/components/animated-hero/x.tsx'],
    ["import { thing } from './gsap-runtime-notes';", 'src/components/animated-hero/x.tsx'],
    ["import { thing } from 'gsapx';", 'src/components/x.tsx'],
  ])('allows %j in %s', async (source, filePath) => {
    expect(await gsapImportMessages(`${source}\nexport const used = 1;\n`, filePath)).toEqual([]);
  });

  // A different rule from the layout barrel rule, so a layout gets both instead of the later block
  // replacing the earlier one's options, which is what two `no-restricted-imports` blocks would do.
  it('applies to layouts alongside the barrel rule', async () => {
    const source = `import { gsap } from 'gsap';\n${layout('@/components')}`;
    const [result] = await eslint.lintText(source, {
      filePath: path.join(appDir, 'src/app/layout.tsx'),
    });
    const rules = result.messages.map((message) => message.ruleId);
    expect(rules).toContain('no-restricted-imports');
    expect(rules).toContain(GSAP_RULE);
  });
});
