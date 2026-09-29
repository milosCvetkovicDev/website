/**
 * A minimal robots.txt matcher: the part of RFC 9309 a crawler uses to decide whether it may fetch
 * a URL, and nothing else.
 *
 * What it covers:
 *
 * - **Groups.** A group is one or more `User-agent` lines followed by its rules; a `User-agent` line
 *   that comes after a rule starts the next group, so consecutive `User-agent` lines share one
 *   (§2.1). A rule before the first `User-agent` line belongs to no group and is ignored.
 * - **Group selection.** A crawler obeys the groups whose `User-agent` value matches its product
 *   token, compared case-insensitively, with every matching group's rules combined into one
 *   (§2.2.1). Only when no group names it does it fall back to the `*` groups, and with neither
 *   everything is allowed. So a `Googlebot` group *replaces* `*` for Googlebot rather than adding to
 *   it. A crawler may document tokens it falls back to before `*`: Applebot obeys the Googlebot
 *   groups when no group names Applebot (support.apple.com/en-us/119829), so `decidingRule` takes
 *   an ordered list of tokens, and the first one that names a group decides.
 *   A `User-agent` line with an empty value still opens a group, which no crawler matches, so the
 *   rules under it apply to nobody rather than to the group before it.
 * - **Rules.** `Allow` and `Disallow`, matched from the start of the path and query. The longest
 *   matching rule wins, counted in characters of the rule's own path, and an `Allow` wins a tie with
 *   an equally long `Disallow` (§2.2.2). A rule with an empty path (`Disallow:`) matches nothing.
 * - **Wildcards.** `*` matches any run of characters, and a trailing `$` anchors the rule to the end
 *   of the URL (§2.2.3); every other character is literal. A run of `*` counts as one.
 * - **Encoding.** RFC 9309 §2.2.2 compares paths percent-encoded. The URL side is encoded by `URL`,
 *   so the rule side has its non-ASCII characters encoded as UTF-8 to match: `Disallow: /café`
 *   blocks `/caf%C3%A9`.
 * - `/robots.txt` itself is always allowed (§2.2.2), and `#` starts a comment (§2.2.3).
 *
 * What it deliberately ignores, as records outside any group's rules (§2.2.4): `Sitemap`,
 * `Crawl-delay`, and the `Content-Signal` line some CDNs emit, which no crawler is documented to
 * read ("None of the crawlers / llms use the content-signal robots.txt directives … It was made up
 * by a CDN", John Mueller, 2026-07-06). `ai.txt` and TDMRep are separate files and are not read at
 * all: `ai.txt`'s IETF incarnation is an unadopted individual submission, and TDMRep is a W3C
 * Community Group report, explicitly not a standard (#55). The gate asserts RFC 9309 constructs
 * only, because those are the ones a rendering crawler obeys.
 *
 * Also out of scope, because this site cannot produce them: the rest of percent-encoding
 * normalisation (the case of a `%xx` escape, reserved characters written raw in a rule), key
 * spellings outside RFC 9309 such as `useragent` or `dissallow` (the served file comes from Next's
 * serialiser of `MetadataRoute.Robots`, which writes only `User-Agent`, `Allow` and `Disallow`),
 * product tokens carrying a version (`Googlebot/2.1`), and the 500 KiB parsing limit.
 */

export interface RobotsRule {
  allow: boolean;
  /** The rule's path pattern as written, `*` and `$` included. */
  path: string;
}

export interface RobotsGroup {
  /** The group's `User-agent` values, lower-cased. */
  userAgents: string[];
  rules: RobotsRule[];
}

/** The groups of a robots.txt body, in file order. */
export function parseRobots(body: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | undefined;
  let ruleSeen = false;

  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || ruleSeen) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
        ruleSeen = false;
      }
      current.userAgents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) continue;
      ruleSeen = true;
      if (value !== '') current.rules.push({ allow: key === 'allow', path: value });
    }
  }
  return groups;
}

/**
 * The combined rules a crawler obeys. `userAgents` is its product token, then the tokens it falls
 * back to, in order: the first token that names a group decides, then `*`. `'*'` means any crawler
 * without a group of its own.
 */
function rulesFor(groups: RobotsGroup[], userAgents: readonly string[]): RobotsRule[] {
  for (const token of [...userAgents.map((agent) => agent.toLowerCase()), '*']) {
    const named = groups.filter((group) => group.userAgents.includes(token));
    if (named.length > 0) return named.flatMap((group) => group.rules);
  }
  return [];
}

const escapeRegExp = (text: string) => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** A rule's path as RFC 9309 compares it: non-ASCII characters percent-encoded as UTF-8. */
const encodeRulePath = (path: string) =>
  path.replace(/[\u0080-\u{10FFFF}]+/gu, (characters) => encodeURIComponent(characters));

/** Whether a rule's path pattern matches `target` (a path plus its query), from the start. */
function matches(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = encodeRulePath(anchored ? pattern.slice(0, -1) : pattern).replace(/\*+/g, '*');
  const source = body.split('*').map(escapeRegExp).join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(target);
}

/**
 * The rule that decides `url` for a crawler, or `undefined` when none matches, which means allowed.
 * `userAgent` is the crawler's product token, or its tokens in fallback order (see `rulesFor`).
 * `url` may be absolute or a path; only its path and query are compared.
 */
export function decidingRule(
  groups: RobotsGroup[],
  userAgent: string | readonly string[],
  url: string,
): RobotsRule | undefined {
  const { pathname, search } = new URL(url, 'http://robots.invalid');
  if (pathname === '/robots.txt') return undefined;
  const target = `${pathname}${search}`;

  let best: RobotsRule | undefined;
  for (const rule of rulesFor(groups, typeof userAgent === 'string' ? [userAgent] : userAgent)) {
    if (!matches(rule.path, target)) continue;
    const longer = !best || rule.path.length > best.path.length;
    const allowWinsTie = best && rule.path.length === best.path.length && rule.allow;
    if (longer || allowWinsTie) best = rule;
  }
  return best;
}
