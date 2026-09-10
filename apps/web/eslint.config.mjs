import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Every client module reachable from a layout's imports ships to every route, so layouts import
    // components from their own modules, never through the barrel (ADR 0009).
    files: ['src/app/**/layout.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/components',
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
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
