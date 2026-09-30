/**
 * The text a Markdown reader sees: CommonMark drops the backslash before ASCII punctuation. One copy
 * for the unit tests and `e2e/markdown-twins.spec.ts`, so both agree on what a twin says. No
 * imports, so the Playwright runtime can load it without the app's path aliases.
 */
export const visible = (markdown: string) => markdown.replace(/\\([!-/:-@[-`{-~])/g, '$1');
