import config from '@repo/prettier-config';

/** @type {import('prettier').Config} */
export default {
  ...config,
  tailwindStylesheet: './src/app/globals.css',
};
