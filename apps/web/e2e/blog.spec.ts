import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { blogCopy } from '../src/data/pages/blog';
import { hasPublishedPosts, posts, publishedPosts } from '../src/data/posts';
import { formatContentDate } from '../src/lib/content-date';
import { UNKNOWN_POST_ROUTE, postRoute } from './routes';
import { fetchHead } from './support/served-head';

/**
 * The blog (#61): `/blog` (61c) and the post pages (61b), as served: `request.get(path)` and the
 * browser's `DOMParser` over the response, never the hydrated DOM, so what is checked is what a
 * crawler or an extractor reads without running a script. A `DOMParser` document runs none of its
 * scripts, and the RSC flight payload's copies of the title and the dates sit inside scripts, where
 * they are never elements.
 *
 * The tests follow the data the pages read, so a published post is checked the moment it lands.
 * None is published yet: until then `/blog` is checked as the Coming Soon placeholder, the
 * unknown-slug test runs, and `src/app/blog/__tests__/` renders both pages over the fixture posts.
 */

/** One item of `/blog`'s post list as served: its element, its title link and its labelled days. */
interface ServedItem {
  tag: string;
  headings: string[];
  links: { text: string; href: string | null }[];
  dates: { label: string; datetime: string; text: string }[];
  text: string;
}

/**
 * `/blog` as served: its status, the whole response, its `h2`s, the text of its `main`, every link's
 * `href` on the page, and each post list with its items.
 */
async function servedBlog(request: APIRequestContext, page: Page) {
  const response = await request.get('/blog');
  const markup = await response.text();
  const parsed = await page.evaluate(
    (
      html,
    ): {
      lists: { tag: string; items: ServedItem[] }[];
      subheadings: string[];
      mainText: string;
      hrefs: (string | null)[];
    } => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return {
        subheadings: [...doc.body.querySelectorAll('main h2')].map((h2) => h2.textContent ?? ''),
        mainText: doc.body.querySelector('main')?.textContent ?? '',
        hrefs: [...doc.querySelectorAll('a')].map((link) => link.getAttribute('href')),
        lists: [...doc.body.querySelectorAll('[data-post-list]')].map((list) => ({
          tag: list.localName,
          items: [...list.children].map((item) => ({
            tag: item.localName,
            headings: [...item.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(
              (heading) => heading.localName,
            ),
            links: [...item.querySelectorAll('a')].map((link) => ({
              text: link.textContent ?? '',
              href: link.getAttribute('href'),
            })),
            // A label is read by structure: a `<dt>` followed by a `<dd>` holding a `<time>`.
            dates: [...item.querySelectorAll('dt')].flatMap((dt) => {
              const dd = dt.nextElementSibling;
              const time = dd?.localName === 'dd' ? dd.querySelector(':scope > time') : null;
              return time
                ? [
                    {
                      label: (dt.textContent ?? '').trim(),
                      datetime: time.getAttribute('datetime') ?? '',
                      text: time.textContent ?? '',
                    },
                  ]
                : [];
            }),
            text: item.textContent ?? '',
          })),
        })),
      };
    },
    markup,
  );
  return { status: response.status(), markup, ...parsed };
}

/**
 * Whether `markup` names `route` as a whole path: the route not followed by a slug character, so a
 * draft's `/blog/a` is not found inside a published post's `/blog/a-b`. Followed by anything else,
 * `/`, a quote or `?` among them, it is the route itself, or a path under it such as its card.
 */
function mentionsRoute(markup: string, route: string): boolean {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}(?![a-z0-9-])`).test(markup);
}

// AC 3, by data: the first published post replaces the placeholder with the list, and no code
// changes.
if (hasPublishedPosts) {
  test('/blog lists every published post, newest first, with its title and labelled day', async ({
    page,
    request,
  }) => {
    const { status, markup, lists, subheadings, mainText, hrefs } = await servedBlog(request, page);
    expect(status).toBe(200);
    expect(
      lists.map(({ tag }) => tag),
      'one ordered post list',
    ).toEqual(['ol']);

    const [{ items }] = lists;
    expect(
      items.map(({ tag }) => tag),
      'one list item per published post',
    ).toEqual(publishedPosts.map(() => 'li'));
    items.forEach((item, index) => {
      const { slug, title, summary, publishedAt } = publishedPosts[index];
      expect(item.headings, `${slug}: its title is the item's one heading`).toEqual(['h2']);
      expect(item.links, `${slug}: one link, its title, to the post`).toEqual([
        { text: title, href: postRoute(slug) },
      ]);
      expect(item.dates, `${slug}: its day, labelled, as a <dt> with its <dd><time>`).toEqual([
        { label: 'Published', datetime: publishedAt, text: formatContentDate(publishedAt) },
      ]);
      expect(item.text, `${slug}: its summary`).toContain(summary);
    });

    // No draft is linked, or named anywhere else in the response, the flight payload included.
    // Whole routes, not substrings: a draft's slug may be the start of a published one's.
    for (const draft of posts.filter((post) => post.draft)) {
      const route = postRoute(draft.slug);
      expect(hrefs, `${draft.slug} is a draft, and linked`).not.toContain(route);
      expect(mentionsRoute(markup, route), `${draft.slug} is a draft, and named in /blog`).toBe(
        false,
      );
    }
    // The placeholder is gone: its heading and its paragraphs, by the copy the page renders it from.
    expect(subheadings).not.toContain(blogCopy.comingSoon.heading);
    for (const paragraph of blogCopy.comingSoon.paragraphs) {
      expect(mainText).not.toContain(paragraph);
    }
  });
} else {
  test('/blog keeps its Coming Soon placeholder and noindex while no post is published', async ({
    page,
    request,
  }) => {
    const { status, lists, subheadings, mainText } = await servedBlog(request, page);
    expect(status).toBe(200);
    expect(subheadings).toEqual([blogCopy.comingSoon.heading]);
    for (const paragraph of blogCopy.comingSoon.paragraphs) {
      expect(mainText).toContain(paragraph);
    }
    expect(lists, 'no post list while nothing is published').toEqual([]);

    const robots = (await fetchHead(request, '/blog')).meta.get('robots') ?? [];
    expect(robots).toHaveLength(1);
    expect(robots[0]).toContain('noindex');
  });
}

// The nav link stays in both states (the owner decision of 2026-09-11, ADR 0028 decision 4).
test('/ still serves the main navigation link to /blog', async ({ page, request }) => {
  const response = await request.get('/');
  expect(response.status()).toBe(200);
  const hrefs = await page.evaluate(
    (html) =>
      [
        ...new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelectorAll('header nav[aria-label="Main"] a'),
      ].map((link) => link.getAttribute('href')),
    await response.text(),
  );
  expect(hrefs).toContain('/blog');
});

/** A post as served: its status, its `<h1>` texts, and the labelled `<dt>`/`<dd><time>` dates. */
async function servedPost(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path);
  const { headings, dates } = await page.evaluate(
    (markup) => {
      const doc = new DOMParser().parseFromString(markup, 'text/html');
      return {
        headings: [...doc.body.querySelectorAll('h1')].map((h1) => h1.textContent ?? ''),
        // A label is read by structure: a `<dt>` whose next sibling is a `<dd>` holding a `<time>`.
        dates: [...doc.body.querySelectorAll('dt')].flatMap((dt) => {
          const dd = dt.nextElementSibling;
          const time = dd?.localName === 'dd' ? dd.querySelector(':scope > time') : null;
          return time
            ? [
                {
                  label: (dt.textContent ?? '').trim(),
                  datetime: time.getAttribute('datetime') ?? '',
                  text: time.textContent ?? '',
                },
              ]
            : [];
        }),
      };
    },
    await response.text(),
  );
  return { status: response.status(), headings, dates };
}

for (const { slug, title, publishedAt, updatedAt } of publishedPosts) {
  const path = postRoute(slug);

  test(`${path}: serves its title as the one h1, then its dates, labelled`, async ({
    page,
    request,
  }) => {
    const { status, headings, dates } = await servedPost(request, page, path);
    expect(status, `${path} should answer 200`).toBe(200);
    expect(headings, `${path}: exactly one h1, the post's title`).toEqual([title]);
    expect(dates, `${path}: Published then Updated, each a <dt> with its <dd><time>`).toEqual([
      { label: 'Published', datetime: publishedAt, text: formatContentDate(publishedAt) },
      { label: 'Updated', datetime: updatedAt, text: formatContentDate(updatedAt) },
    ]);
  });
}

// A draft has no page: `publishedPosts` leaves it out of `generateStaticParams`, and
// `dynamicParams = false` makes its slug the same routing-level 404 as any other (ADR 0015, 0028).
for (const { slug } of posts.filter((post) => post.draft)) {
  const path = postRoute(slug);

  test(`${path}: a draft is not served, and has no card`, async ({ request }) => {
    expect((await request.get(path)).status(), `${path} is a draft`).toBe(404);
    // The card handler keeps a list of its own (`og-image.png/route.ts`), so it is checked apart.
    const card = `${path}/og-image.png`;
    expect((await request.get(card)).status(), `${card} is a draft's card`).toBe(404);
  });
}

// A published post's card is fetched, and held to 200 and an image type, by `seo-surface.spec.ts`,
// which follows every route's og:image; what is left here is the card a post does not have.
test('an unknown post slug is a 404, page and card', async ({ request }) => {
  // `not-found-shell.spec.ts` checks that this 404 renders through the root layout, with the theme
  // init script; this is the status alone. These run while no post is published, too.
  expect((await request.get(UNKNOWN_POST_ROUTE)).status()).toBe(404);
  // A routing 404 from the handler's `dynamicParams = false`, never its throw, which would be a 500.
  expect((await request.get(`${UNKNOWN_POST_ROUTE}/og-image.png`)).status()).toBe(404);
});
