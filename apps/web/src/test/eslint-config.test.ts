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
  const [result] = await eslint.lintText(layout(specifier), {
    filePath: path.join(appDir, filePath),
  });
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
    ['@/components/index', 'src/app/layout.tsx'],
    ['../components', 'src/app/layout.tsx'],
    ['../components/index', 'src/app/layout.tsx'],
    ['../../components', 'src/app/skills/layout.tsx'],
  ])('rejects %j in %s', async (specifier, filePath) => {
    const messages = await restrictedImportMessages(specifier, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain('ADR 0009');
  });

  it('allows a component imported from its own module, which is the compliant spelling', async () => {
    expect(await restrictedImportMessages('@/components/navigation', 'src/app/layout.tsx')).toEqual(
      [],
    );
  });

  // The rule is scoped to layouts. A page may import the barrel: it ships to that route only.
  it('leaves pages alone', async () => {
    expect(await restrictedImportMessages('@/components', 'src/app/page.tsx')).toEqual([]);
  });
});
