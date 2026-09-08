import react from './react.js';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...react,
  {
    rules: {
      // Next.js specific rules
      'react/no-unknown-property': ['error', { ignore: ['jsx', 'global'] }],
    },
  },
  {
    ignores: ['.next/**', 'out/**', 'build/**'],
  },
];
