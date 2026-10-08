/**
 * The content-date manifest, `src/data/content-dates.json` (#191): for every route with a content
 * date, that date and a fingerprint of the text the route serves, page and Markdown twin, with the
 * route's own dates masked out (`src/test/content-fingerprint.ts` says what counts as served text).
 * The file is a file snapshot: a change to what a route says, or to its date, leaves it stale, and
 * this suite fails naming the route until it is regenerated with
 * `pnpm --filter web content-dates:update` in the same commit. In CI Vitest refuses to write a
 * snapshot, and elsewhere a missing manifest fails unless that script asked for it, so a stale or
 * missing manifest fails `pnpm test` and the required `quality` job.
 *
 * The clock is pinned before anything is imported. `/` and `/about` print the years of experience,
 * and their dates are the later of the recorded day and the day that figure took effect
 * (`static-routes.ts`), so on the live clock both would move every 1 January with no commit and the
 * committed manifest would go stale on `main`. Only `Date` is faked: fake timers could leave the
 * renderer's scheduling waiting on a clock that never moves. So the manifest fingerprints that text
 * as of the pinned day, not as the live site serves it after the next 1 January. The origin is
 * pinned too: every twin prints absolute URLs, so a `NEXT_PUBLIC_SITE_URL` left set in the shell
 * would otherwise move every fingerprint.
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
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { use } from 'react';
import type { MetadataRoute } from 'next';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { caseStudies } from '@/data/case-studies';
import { hasPublishedPosts, publishedPosts } from '@/data/posts';
import { STATIC_ROUTE_UPDATED, type StaticRoute } from '@/data/static-routes';
import { formatContentDate } from '@/lib/content-date';
import {
  contentRoutes,
  DATE_MASK,
  fingerprint,
  maskDates,
  readTwin,
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
  // Blank reads as unset: `siteOrigin()` and the sitemap fall back to the production origin.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  return { day };
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/**
 * For a test that renders every route, or imports every page afresh: a few hundred milliseconds on
 * an idle machine, but parallel sessions push the load past 150 on 12 CPUs, where the same work has
 * taken several seconds, beyond the 5 s default.
 */
const RENDERS_EVERY_ROUTE_MS = 60_000;

const MANIFEST_FILE = fileURLToPath(new URL('../content-dates.json', import.meta.url));

const story = vi.hoisted(() => ({ finished: false }));

vi.mock('@/hooks/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => story.finished,
}));

/** The `#` line every twin opens with, its Markdown escapes undone: the page's h1 (#58). */
const twinHeading = (twin: string) => /^# (.*)/.exec(twin)?.[1].replace(/\\(.)/g, '$1');

/** The route at `path`, failing with its name when there is none. */
function routeAt(routes: readonly ContentRoute[], path: string): ContentRoute {
  const route = routes.find((candidate) => candidate.path === path);
  expect(route, `${path} is a content route`).toBeDefined();
  return route!;
}

/** `day` (`YYYY-MM-DD`) moved `days` days on. */
const shiftDay = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The two forms a page or twin prints `day` in: ISO and `formatContentDate`'s. */
const formsOf = (day: string) => [day, formatContentDate(day) ?? day];

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

/** The helper's two functions a manifest is computed with: this module's, or a fresh import's. */
type Helper = Pick<typeof import('@/test/content-fingerprint'), 'contentRoutes' | 'renderRoute'>;

/** A manifest and the texts its fingerprints were taken of, by path. */
interface Computed {
  readonly manifest: Manifest;
  readonly texts: ReadonlyMap<string, { route: ContentRoute; pageText: string; twinText: string }>;
}

/**
 * Every route's manifest entry, keyed by path in code-unit order. One route at a time: the finished
 * render of a story route switches the reduced-motion hook for every render in flight.
 */
async function compute(helper: Helper = { contentRoutes, renderRoute }): Promise<Computed> {
  const entries: [string, Manifest[string]][] = [];
  const texts = new Map<string, { route: ContentRoute; pageText: string; twinText: string }>();
  for (const route of helper.contentRoutes()) {
    const { pageText, twinText } = await textOf(route, helper.renderRoute);
    texts.set(route.path, { route, pageText, twinText });
    entries.push([route.path, { updated: route.updated, text: fingerprint(pageText, twinText) }]);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { manifest: Object.fromEntries(entries), texts };
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
  let texts: Computed['texts'];
  beforeAll(async () => {
    ({ manifest: computed, texts } = await compute());
  }, RENDERS_EVERY_ROUTE_MS);

  it('runs on the pinned day', () => {
    expect(new Date().toISOString().slice(0, 10)).toBe(clock.day);
  });

  it('matches content-dates.json: regenerate it with content-dates:update when copy or a date changes', async () => {
    // Outside CI Vitest writes a missing file snapshot and passes: only the update script may.
    if (!process.env.CONTENT_DATES_UPDATE) {
      expect(existsSync(MANIFEST_FILE), 'content-dates.json is committed').toBe(true);
    }
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
    // And the other way: every route is in the sitemap, but /blog while no post is published.
    const listed = sitemap()
      .map(({ url }) => new URL(url).pathname)
      .sort();
    expect(listed).toEqual(expected.filter((path) => hasPublishedPosts || path !== '/blog'));
  });

  it(
    'fingerprints each route the same way twice',
    async () => {
      expect((await compute()).manifest).toEqual(computed);
    },
    RENDERS_EVERY_ROUTE_MS,
  );

  it("finds each route's h1 in its served text, as a block of its own", () => {
    for (const { route, pageText, twinText } of texts.values()) {
      // Each block element is a line of its own, so the h1 is one whole line of the page.
      expect(pageText.split('\n'), `${route.path}: the page`).toContain(route.heading);
      expect(twinHeading(twinText), `${route.path}: the twin`).toBe(route.heading);
    }
  });

  it("renders the home story's finished state as well as the served one", async () => {
    const served = servedText((await renderRoute('/')).html);
    const { pageText } = texts.get(routeAt(contentRoutes(), '/').path)!;
    // One of each kind of copy only a run sequence shows: the pipeline's deploy result
    // (GauntletPhase) and an event of the self-healing log (LoopPhase).
    for (const text of ['DEPLOYMENT SUCCESSFUL', 'Agent activated']) {
      expect(served, `the served render shows "${text}"`).not.toContain(text);
      expect(pageText, `the fingerprinted text lacks "${text}"`).toContain(text);
    }
  });
});

/**
 * The helper over fresh modules and the fixture posts, with every content date moved `days` days on
 * first: each case study's, each static route's and each fixture post's, in the records themselves,
 * before any page module is imported, so every page, twin and the sitemap read the moved days.
 */
async function overFixturePosts(days = 0) {
  vi.resetModules();
  vi.doMock('@/data/posts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/data/posts')>();
    const { fixturePosts } = await import('@/test/fixtures/posts');
    return { ...actual, posts: fixturePosts, ...actual.buildPostIndex(fixturePosts) };
  });
  if (days !== 0) {
    const { caseStudies: studies } = await import('@/data/case-studies');
    for (const study of studies) {
      study.publishedAt = shiftDay(study.publishedAt, days);
      study.updatedAt = shiftDay(study.updatedAt, days);
    }
    const { STATIC_ROUTE_UPDATED: own } = await import('@/data/static-routes');
    for (const path of Object.keys(own) as StaticRoute[]) {
      Object.assign(own, { [path]: shiftDay(own[path], days) });
    }
    const { posts } = await import('@/data/posts');
    for (const post of posts) {
      if (post.publishedAt && post.updatedAt) {
        Object.assign(post, {
          publishedAt: shiftDay(post.publishedAt, days),
          updatedAt: shiftDay(post.updatedAt, days),
        });
      }
    }
  }
  const helper = await import('@/test/content-fingerprint');
  const { publishedPosts: published } = await import('@/data/posts');
  return { helper, published };
}

describe('the manifest once a post is published (over the fixture posts)', () => {
  afterEach(() => {
    vi.doUnmock('@/data/posts');
    vi.resetModules();
  });

  it(
    'adds each published post, dates /blog by its sitemap entry and masks the posts on /blog',
    async () => {
      const { helper, published } = await overFixturePosts();
      expect(published.length, 'the fixture posts publish at least one post').toBeGreaterThan(0);
      const routes = helper.contentRoutes();
      const blog = routeAt(routes, '/blog');
      const latest = [STATIC_ROUTE_UPDATED['/blog'], ...published.map((p) => p.publishedAt)].sort();
      expect(blog.updated).toBe(latest.at(-1));
      expect(blog.dates).toEqual(expect.arrayContaining(published.map((p) => p.publishedAt)));

      for (const post of published) {
        const route = routeAt(routes, `/blog/${post.slug}`);
        const { pageText, twinText } = await textOf(route, helper.renderRoute);
        expect(pageText).toContain(post.title);
        expect(twinHeading(twinText)).toBe(post.title);
        for (const shown of [...formsOf(post.publishedAt), ...formsOf(post.updatedAt)]) {
          expect(pageText, `${route.path}: the page masks ${shown}`).not.toContain(shown);
          expect(twinText, `${route.path}: the twin masks ${shown}`).not.toContain(shown);
        }
      }
      const { pageText, twinText } = await textOf(blog, helper.renderRoute);
      for (const post of published) {
        expect(pageText, `/blog lists ${post.slug}`).toContain(post.title);
        for (const shown of formsOf(post.publishedAt)) {
          expect(pageText, `/blog: the page masks ${shown}`).not.toContain(shown);
          expect(twinText, `/blog: the twin masks ${shown}`).not.toContain(shown);
        }
      }
    },
    RENDERS_EVERY_ROUTE_MS,
  );

  it(
    'moves only `updated` when every content date moves, never `text`',
    async () => {
      const before = await compute((await overFixturePosts()).helper);
      // Forty days, so that the months and the lengths of the printed days change too.
      const after = await compute((await overFixturePosts(40)).helper);
      expect(Object.keys(after.manifest)).toEqual(Object.keys(before.manifest));
      for (const [path, entry] of Object.entries(before.manifest)) {
        expect(after.manifest[path]?.updated, `${path}: updated`).not.toBe(entry.updated);
        expect(after.texts.get(path)?.pageText, `${path}: the page`).toBe(
          before.texts.get(path)?.pageText,
        );
        expect(after.texts.get(path)?.twinText, `${path}: the twin`).toBe(
          before.texts.get(path)?.twinText,
        );
        expect(after.manifest[path]?.text, `${path}: text`).toBe(entry.text);
      }
    },
    RENDERS_EVERY_ROUTE_MS,
  );
});

describe('contentRoutes against the sitemap', () => {
  afterEach(() => {
    vi.doUnmock('@/app/sitemap');
    vi.resetModules();
  });

  /** The helper's `contentRoutes`, over the real sitemap's entries as `edit` leaves them. */
  async function withSitemap(edit: (entries: MetadataRoute.Sitemap) => MetadataRoute.Sitemap) {
    vi.resetModules();
    vi.doMock('@/app/sitemap', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/app/sitemap')>();
      return { default: () => edit(actual.default()) };
    });
    return (await import('@/test/content-fingerprint')).contentRoutes;
  }

  it(
    'refuses a route the sitemap leaves out, naming it, rather than use its own date',
    async () => {
      const without = (tail: string) =>
        withSitemap((entries) => entries.filter(({ url }) => !url.endsWith(tail)));
      expect(await without('/privacy')).toThrow(/no entry for \/privacy\b/);
      const study = `/work/${caseStudies[0].slug}`;
      expect(await without(study)).toThrow(new RegExp(`no entry for ${study}\\b`));
    },
    RENDERS_EVERY_ROUTE_MS,
  );

  it(
    'refuses a path the sitemap lists twice',
    async () => {
      const twice = await withSitemap((entries) => [...entries, entries[1]]);
      expect(twice).toThrow(/listed twice/);
    },
    RENDERS_EVERY_ROUTE_MS,
  );
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
    expect(after).toBe('Fixture\nOne plain sentence, then another.');
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

  it('reads each block element as a line and phrasing elements inside it, as a reader sees them', () => {
    const read = (html: string) => servedText(html);
    // A block split in two, or a word moved across a block boundary, is another text.
    expect(read('<ul><li>ab</li></ul>')).toBe('ab');
    expect(read('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
    expect(fingerprint(read('<h2>Fixture word</h2><p>One</p>'), '')).not.toBe(
      fingerprint(read('<h2>Fixture</h2><p>word One</p>'), ''),
    );
    expect(read('<h2>Title</h2>\n  <p>Body</p><div>a<br/>b</div>')).toBe('Title\nBody\na\nb');
    // Phrasing elements sit inside a line: wrapping a word in one changes nothing.
    expect(
      read('<p>One <strong>bo</strong>ld<span>.</span> <a href="/">Link</a><code>x</code></p>'),
    ).toBe('One bold. Linkx');
  });

  it('keeps a character reference that names no character as written', () => {
    expect(servedText('<p>&#1114112; &#x110000; &#65;&#x42;</p>')).toBe('&#1114112; &#x110000; AB');
  });

  it('fails a render that never finishes by its deadline, naming it', async () => {
    const never = new Promise<string>(() => {});
    function Stuck() {
      return <p>{use(never)}</p>;
    }
    await expect(
      renderHtml(<Stuck />, { label: 'the stuck fixture', timeoutMs: 50 }),
    ).rejects.toThrow(/the stuck fixture.*timeout/i);
  });

  it('fails a render that throws, naming it and keeping the error', async () => {
    function Broken(): never {
      throw new Error('the copy is missing');
    }
    const failure = renderHtml(<Broken />, { label: 'the broken fixture' });
    await expect(failure).rejects.toThrow(/the broken fixture.*the copy is missing/);
    await expect(failure).rejects.toMatchObject({ errors: [expect.any(Error)] });
  });

  it('refuses a twin that does not answer with Markdown, naming the route', async () => {
    const markdown = { 'content-type': 'text/markdown; charset=utf-8' };
    await expect(readTwin('/x', new Response('# X\n', { headers: markdown }))).resolves.toBe(
      '# X\n',
    );
    await expect(
      readTwin('/x', new Response('# Not found\n', { status: 404, headers: markdown })),
    ).rejects.toThrow(/\/x.*404/);
    await expect(
      readTwin('/x', new Response('<p>x</p>', { headers: { 'content-type': 'text/html' } })),
    ).rejects.toThrow(/\/x.*text\/html/);
  });

  it('reads text as textContent does, without scripts, styles, templates or comments', () => {
    const html =
      '<div><script type="application/ld+json">{"name":"x"}</script><style>p{}</style>' +
      '<template><p>later</p></template><p title="a &gt; b">Tom &amp; Jerry&#x27;s&nbsp;</p>' +
      '<!-- -->\n  <span>&lt;tag&gt; &quot;q&quot; &#169;</span></div>';
    expect(servedText(html)).toBe('Tom & Jerry\'s\n<tag> "q" ©');
  });
});
