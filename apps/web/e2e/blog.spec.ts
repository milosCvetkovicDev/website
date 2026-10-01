import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { posts, publishedPosts } from '../src/data/posts';
import { formatContentDate } from '../src/lib/content-date';
import { UNKNOWN_POST_ROUTE, postRoute } from './routes';

/**
 * The post pages (#61, 61b), as served: `request.get(path)` and the browser's `DOMParser` over the
 * response, never the hydrated DOM, so what is checked is what a crawler or an extractor reads
 * without running a script. A `DOMParser` document runs none of its scripts, and the RSC flight
 * payload's copies of the title and the dates sit inside scripts, where they are never elements.
 *
 * One test per published post, generated from the index the page reads, so a published post is
 * checked the moment it lands. None is published yet: until then the unknown-slug test is what runs
 * here, and `src/app/blog/__tests__/post-page.test.tsx` renders the page over the fixture posts.
 */

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
