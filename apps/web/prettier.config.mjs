import config from '@repo/prettier-config';

/** @type {import('prettier').Config} */
const webConfig = {
  ...config,
  // Tailwind v4 entry point so the class sorter knows the project's theme and custom variants.
  tailwindStylesheet: './src/app/globals.css',
};

export default webConfig;
