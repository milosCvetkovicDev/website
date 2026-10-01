import type { APIResponse } from '@playwright/test';

/**
 * The `Accept` values and the `Vary` reader that the negotiation specs share (#59, ADR 0030):
 * `e2e/markdown-negotiation.spec.ts` against the server the suite starts, and
 * `e2e-live/markdown-negotiation.spec.ts` against the deployed site.
 */

/** RFC 7763's type with the charset it requires, as `markdownResponse()` writes it. */
export const MARKDOWN = 'text/markdown; charset=utf-8';

/** What Claude Code and the other clients acceptmarkdown.com lists send. */
export const ASKS_FOR_MARKDOWN = 'text/markdown, */*';

/** Chromium's `Accept` for a navigation. */
export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

/** Every token of every `Vary` header on a response, lower-cased: the header may come twice. */
export const varyOf = (response: APIResponse): string[] =>
  response
    .headersArray()
    .filter(({ name }) => name.toLowerCase() === 'vary')
    .flatMap(({ value }) => value.split(','))
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
