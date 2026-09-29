/**
 * What kind of link an `InlineLink` href is, for a page that renders one: an on-site path goes
 * through `next/link`, an external URL is a plain `<a>`. Anything else throws at build time rather
 * than render a link the page never meant to have.
 */

// A leading slash that a browser does not read as the start of another origin: `//host` is
// protocol-relative, and `/\host` is too, because the URL parser reads a backslash as a slash.
const SITE_PATH = /^\/(?![/\\])/;

// The absolute URLs `serialise.ts` accepts in a twin: a web page or a mail address.
const EXTERNAL_URL = /^(?:https?:\/\/[^\s/?#]|mailto:\S)/i;

export function linkKind(href: string): 'site' | 'external' {
  if (SITE_PATH.test(href)) return 'site';
  if (EXTERNAL_URL.test(href)) return 'external';
  throw new Error(
    `linkKind: "${href}" is neither a path on this site nor an http(s) or mailto URL`,
  );
}
