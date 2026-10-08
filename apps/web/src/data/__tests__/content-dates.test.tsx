/**
 * The content-date manifest, `src/data/content-dates.json` (#191): for every route with a content
 * date, that date and a fingerprint of the text the route serves, page and Markdown twin, with the
 * route's own dates masked out (`src/test/content-fingerprint.ts` says what counts as served text).
 * The file is a file snapshot: a change to what a route says, or to its date, leaves it stale, and
 * this suite fails naming the route until it is regenerated with
 * `pnpm --filter web content-dates:update` in the same commit. In CI Vitest refuses to write a
 * snapshot, so a stale or missing manifest fails the required `quality` job.
 *
 * The clock is pinned before anything is imported. `/` and `/about` print the years of experience,
 * and their dates are the later of the recorded day and the day that figure took effect
 * (`static-routes.ts`), so on the live clock both would move every 1 January with no commit and the
 * committed manifest would go stale on `main`. Only `Date` is faked: fake timers could leave the
 * renderer's scheduling waiting on a clock that never moves.
 *
 * The home story's server render leaves out what its animation reveals: the self-healing log's
 * events (`loop-phase.tsx`) and the pipeline's deploy result (`gauntlet-phase.tsx`) appear only once
 * a sequence has run. So `/` is rendered twice, as served and as finished (the reduced-motion
 * render, which shows every phase complete), and both count. Strings shown only mid-animation, such
 * as the log's `Processing...` and the pipeline's deploying label, are in neither, and so are not
 * fingerprinted.
 *
 * @vitest-environment node
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { caseStudies } from '@/data/case-studies';
import { publishedPosts } from '@/data/posts';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import {
  contentRoutes,
  DATE_MASK,
  fingerprint,
  maskDates,
  renderHtml,
  renderRoute,
  servedText,
  type ContentRoute,
} from '@/test/content-fingerprint';

// The day the manifest is computed on, whatever day the suite runs. Mid-year, so the years figure
// took effect on 1 January and every date recorded for `/` and /about is later. Moving it can
// change that figure, and with it the text of both routes: regenerate the manifest if it does.
const clock = vi.hoisted(() => {
  const day = '2026-07-01';
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${day}T12:00:00Z`) });
  return { day };
});

const story = vi.hoisted(() => ({ finished: false }));

vi.mock('@/hooks/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => story.finished,
}));

/** The `#` line every twin opens with, its Markdown escapes undone: the page's h1 (#58). */
const twinHeading = (twin: string) => /^# (.*)/.exec(twin)?.[1].replace(/\\(.)/g, '$1');

/** The routes whose server render leaves copy to an animation: each is rendered finished as well. */
const STORY_ROUTES: ReadonlySet<string> = new Set(['/']);

/** `route`'s page text (both renders for a story route) and twin text, its own dates masked. */
async function textOf(
  route: ContentRoute,
  render: typeof renderRoute = renderRoute,
): Promise<{ pageText: string; twinText: string }> {
  const { html, twin } = await render(route.path);
  const pageTexts = [servedText(html)];
  if (STORY_ROUTES.has(route.path)) {
    story.finished = true;
    try {
      pageTexts.push(servedText((await render(route.path)).html));
    } finally {
      story.finished = false;
    }
  }
  return {
    pageText: maskDates(pageTexts.join('\n'), route.dates),
    twinText: maskDates(twin, route.dates),
  };
}

/** The manifest: each route's content date and the fingerprint of its served text, by path. */
type Manifest = Record<string, { updated: string; text: string }>;

/**
 * Every route's manifest entry, keyed by path in code-unit order. One route at a time: the finished
 * render of a story route switches the reduced-motion hook for every render in flight.
 */
async function manifest(): Promise<Manifest> {
  const entries: [string, Manifest[string]][] = [];
  for (const route of contentRoutes()) {
    const { pageText, twinText } = await textOf(route);
    entries.push([route.path, { updated: route.updated, text: fingerprint(pageText, twinText) }]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

/**
 * The manifest as committed: JSON with one route per line, so two pull requests that change routes
 * apart from each other touch different lines. Adjacent lines still conflict in a three-way merge;
 * a conflicted manifest is regenerated, never merged by hand.
 */
const serialise = (entries: Manifest) =>
  `{\n${Object.entries(entries)
    .map(([path, entry]) => `  ${JSON.stringify(path)}: ${JSON.stringify(entry)}`)
    .join(',\n')}\n}\n`;

describe('the content-date manifest', () => {
  let computed: Manifest;
  beforeAll(async () => {
    computed = await manifest();
  });

  it('runs on the pinned day', () => {
    expect(new Date().toISOString().slice(0, 10)).toBe(clock.day);
  });

  it('matches content-dates.json: regenerate it with content-dates:update when copy or a date changes', async () => {
    const committed = serialise(computed);
    // What a reader of the file gets back with JSON.parse, which is how it is meant to be read.
    expect(JSON.parse(committed)).toEqual(computed);
    await expect(committed).toMatchFileSnapshot('../content-dates.json');
  });

  it('covers every static route, case study and published post, and every sitemap entry', () => {
    const expected = [
      ...Object.keys(STATIC_ROUTE_UPDATED),
      ...caseStudies.map(({ slug }) => `/work/${slug}`),
      ...publishedPosts.map(({ slug }) => `/blog/${slug}`),
    ].sort();
    expect(Object.keys(computed)).toEqual(expected);
    // /blog is in it while the sitemap leaves it out, so its Coming Soon copy is covered too.
    expect(expected).toContain('/blog');
    for (const { url, lastModified } of sitemap()) {
      const path = new URL(url).pathname;
      expect(computed[path], `${url} is in the sitemap and not in the manifest`).toBeDefined();
      expect(computed[path]?.updated, `${url}: the manifest's date is its lastmod`).toBe(
        lastModified,
      );
    }
  });

  it('fingerprints each route the same way twice', async () => {
    expect(await manifest()).toEqual(computed);
  });

  it("finds each route's h1 in its served text", async () => {
    for (const route of contentRoutes()) {
      const { pageText, twinText } = await textOf(route);
      expect(pageText, `${route.path}: the page`).toContain(route.heading);
      expect(twinHeading(twinText), `${route.path}: the twin`).toBe(route.heading);
    }
  });

  it("renders the home story's finished state as well as the served one", async () => {
    const home = contentRoutes().find(({ path }) => path === '/')!;
    const served = servedText((await renderRoute('/')).html);
    const { pageText } = await textOf(home);
    // One of each kind of copy only a run sequence shows: the pipeline's deploy result
    // (GauntletPhase) and an event of the self-healing log (LoopPhase).
    for (const text of ['DEPLOYMENT SUCCESSFUL', 'Agent activated']) {
      expect(served, `the served render shows "${text}"`).not.toContain(text);
      expect(pageText, `the fingerprinted text lacks "${text}"`).toContain(text);
    }
  });
});

describe('the manifest once a post is published (over the fixture posts)', () => {
  afterEach(() => {
    vi.doUnmock('@/data/posts');
    vi.resetModules();
  });

  it('adds each published post, dates /blog by its sitemap entry and masks the posts on /blog', async () => {
    vi.resetModules();
    vi.doMock('@/data/posts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/data/posts')>();
      const { fixturePosts } = await import('@/test/fixtures/posts');
      return { ...actual, posts: fixturePosts, ...actual.buildPostIndex(fixturePosts) };
    });
    const helper = await import('@/test/content-fingerprint');
    const { publishedPosts: published } = await import('@/data/posts');
    const routes = helper.contentRoutes();
    const blog = routes.find(({ path }) => path === '/blog')!;
    const latest = [STATIC_ROUTE_UPDATED['/blog'], ...published.map((p) => p.publishedAt)].sort();
    expect(blog.updated).toBe(latest.at(-1));
    expect(blog.dates).toEqual(expect.arrayContaining(published.map((p) => p.publishedAt)));

    for (const post of published) {
      const route = routes.find(({ path }) => path === `/blog/${post.slug}`);
      expect(route, `/blog/${post.slug}`).toBeDefined();
      const { pageText, twinText } = await textOf(route!, helper.renderRoute);
      expect(pageText).toContain(post.title);
      expect(twinHeading(twinText)).toBe(post.title);
      expect(twinText).not.toContain(post.updatedAt);
    }
    const { twinText } = await textOf(blog, helper.renderRoute);
    for (const post of published) expect(twinText).not.toContain(post.publishedAt);
  });
});

/** A fixture as it might first be written. */
function Before({ word }: { word: string }) {
  return (
    <section>
      <h2>Fixture</h2>
      <p>One {word} sentence, then another.</p>
    </section>
  );
}

/**
 * The same fixture after an edit that changes none of its served text: a JSX comment, a type
 * annotation and other line breaks. Prettier would undo the line breaks, hence the directive.
 */
// prettier-ignore
function After(props: Readonly<{ word: string }>) {
  const word: string = props.word;
  return <section>
    {/* A comment the served page never shows. */}
    <h2>Fixture</h2><p>
      One {word} sentence, then another.</p></section>;
}

/** A served line with a content date in it, as /about and /privacy print one. */
const Dated = ({ day }: { day: string }) => (
  <p>
    Last updated <time dateTime={day}>{day}</time>.
  </p>
);

describe('servedText, maskDates and fingerprint', () => {
  it('gives an edit to comments, types and line breaks the same fingerprint (AC 2)', async () => {
    const before = servedText(await renderHtml(<Before word="plain" />));
    const after = servedText(await renderHtml(<After word="plain" />));
    expect(after).toBe('FixtureOne plain sentence, then another.');
    expect(fingerprint(after, '')).toBe(fingerprint(before, ''));
  });

  it('gives one changed word another fingerprint', async () => {
    const before = servedText(await renderHtml(<Before word="plain" />));
    const changed = servedText(await renderHtml(<Before word="changed" />));
    expect(fingerprint(changed, '')).not.toBe(fingerprint(before, ''));
    expect(fingerprint(before, 'a twin')).not.toBe(fingerprint(before, 'another twin'));
    // The page and the twin are kept apart: text cannot move from one to the other unnoticed.
    expect(fingerprint('ab', 'c')).not.toBe(fingerprint('a', 'bc'));
  });

  it("ignores a changed <time> on the page and the route's own date in its twin", async () => {
    const page = (day: string) => renderHtml(<Dated day={day} />).then(servedText);
    expect(await page('2026-09-27')).toBe('Last updated .');
    expect(await page('2026-10-08')).toBe(await page('2026-09-27'));

    const twin = (day: string, shown: string) => `- Updated: ${day}\n\nUpdated on ${shown}.\n`;
    const before = maskDates(twin('2026-10-03', '3 October 2026'), ['2026-10-03']);
    const after = maskDates(twin('2026-11-04', '4 November 2026'), ['2026-11-04']);
    expect(before).toBe(`- Updated: ${DATE_MASK}\n\nUpdated on ${DATE_MASK}.\n`);
    expect(fingerprint('', after)).toBe(fingerprint('', before));
  });

  it("masks only the route's own dates, each whole", () => {
    expect(maskDates('2026-01-01 and 13 October 2026', ['2026-10-03'])).toBe(
      '2026-01-01 and 13 October 2026',
    );
    expect(maskDates('3 October 2026, 2026-10-03', ['2026-10-03'])).toBe(
      `${DATE_MASK}, ${DATE_MASK}`,
    );
    expect(() => maskDates('', ['2026-02-30'])).toThrow(/not a real/);
  });

  it('reads text as textContent does, without scripts, styles, templates or comments', () => {
    const html =
      '<div><script type="application/ld+json">{"name":"x"}</script><style>p{}</style>' +
      '<template><p>later</p></template><p title="a &gt; b">Tom &amp; Jerry&#x27;s&nbsp;</p>' +
      '<!-- -->\n  <span>&lt;tag&gt; &quot;q&quot; &#169;</span></div>';
    expect(servedText(html)).toBe('Tom & Jerry\'s <tag> "q" ©');
  });
});
