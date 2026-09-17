import { defineConfig } from '@playwright/test';

import base from './playwright.config';

// The configuration `scripts/flake-hunt.sh` runs the suite with: `playwright.config.ts` unchanged,
// plus the evidence a failure needs to be investigated after the fact. A trace is kept for every
// failed attempt and a screenshot is taken when a test fails; a passing test keeps neither.
// Recording a trace for every test costs time (about 7% per run, measured in PR #89), so a hunt's
// timing-sensitive failures may be somewhat more frequent than an ordinary run's.
export default defineConfig({
  ...base,
  use: { ...base.use, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
