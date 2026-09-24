import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // GSAP loads after hydration, through the `import()` in load-gsap.ts, so that it stays out of
    // the home page's initial chunk. A static import of it, or of the module that wraps it, from
    // anything the page reaches puts ~44 KB gzip back in, and nothing else would notice. Type
    // imports are erased and allowed, and a dynamic `import()` is not an import declaration, so it
    // passes. The typescript-eslint rule rather than the core one, for `allowTypeImports`; being a
    // different rule, it also applies to layouts without replacing the barrel rule below.
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      // The one module that imports GSAP, fetched lazily by load-gsap.ts.
      'src/components/animated-hero/gsap-runtime.ts',
      // Rendered by no route, and deleted by #47 (hero-6). Rendering it would ship GSAP and two
      // plugins with the page, so it would have to load through load-gsap.ts first.
      'src/components/animated-hero/circuit-background.tsx',
      // Tests import GSAP directly to drive and inspect it; they ship nowhere.
      'src/**/__tests__/**',
      'src/test/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['gsap', 'gsap/*'],
              allowTypeImports: true,
              message:
                'GSAP loads after hydration: run GSAP work through runWithGsap or useWithGsap (animated-hero/load-gsap.ts).',
            },
            {
              regex: '(^|/)gsap-runtime(\\.[jt]sx?)?$',
              allowTypeImports: true,
              message:
                'Only load-gsap.ts may reach gsap-runtime, and only through import(): a static import ships GSAP in the initial chunk.',
            },
          ],
        },
      ],
    },
  },
  {
    // Every client module reachable from a layout's imports ships to every route, so layouts import
    // components from their own modules, never through the barrel (ADR 0009).
    files: ['src/app/**/layout.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // A pattern, not a `paths` entry: `paths` matches the specifier character for character,
          // so it caught `@/components` and missed `@/components/index`, `../components` and
          // `../components/index`, all of which resolve to the same src/components/index.ts. The
          // trailing `/?` covers the directory spelling and `(\.\./)+` reaches a nested layout.
          // The extension may be `.ts` or `.tsx`, or a `.js` or `.jsx` that resolves to them.
          patterns: [
            {
              regex: '^(@/|(\\.\\./)+)components(/index(\\.[jt]sx?)?)?/?$',
              message:
                'Import layout components from their own modules; the barrel pulls every client component into the layout chunk (ADR 0009).',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    // The build directory of the dev server Playwright starts locally (NEXT_DIST_DIR).
    '.next-e2e/**',
    // Playwright's own output. `CI=true pnpm --filter web test:e2e`, which CLAUDE.md and the deploy
    // runbook both tell you to run locally, writes a bundled HTML report here; linting it reports
    // thousands of problems in minified vendor code and fails `pnpm lint` under --max-warnings 0.
    'playwright-report/**',
    'test-results/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
