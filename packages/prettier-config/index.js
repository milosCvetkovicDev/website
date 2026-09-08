import { fileURLToPath } from 'node:url';

/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  // Resolved from this package so consumers do not need their own dependency on the plugin.
  plugins: [fileURLToPath(import.meta.resolve('prettier-plugin-tailwindcss'))],
};

export default config;
