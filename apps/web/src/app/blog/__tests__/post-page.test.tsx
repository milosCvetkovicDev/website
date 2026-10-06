import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FOOTER_LINES, publishedPosts } from '@/data/posts';
import { formatContentDate } from '@/lib/content-date';
import { draftPost, everyBlockPost, hostileTitlePost } from '@/test/fixtures/posts';
import PostPage, { dynamicParams, generateMetadata, generateStaticParams } from '../[slug]/page';
import * as card from '../[slug]/og-image.png/route';

/**
 * `/blog/[slug]`, the post page, and its card (#61, 61b).
 *
 * The real `posts` array stays empty until the owner publishes the first post, so this file swaps
 * the module for one built over the fixtures with `buildPostIndex`, the same code the real exports
 * come from: the page's non-empty path is proven here, and `e2e/blog.spec.ts` checks the served
 * pages once a post exists. The fixtures hold a draft between two published posts, so every list
 * below has something to leave out.
 */
vi.mock('@/data/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/posts')>();
  const { everyBlockPost, fixturePosts } = await import('@/test/fixtures/posts');
  // One more published post, for the one field no fixture sets: a shorter title for results pages.
  const withMetaTitle = {
    ...everyBlockPost,
    slug: 'fixture-meta-title',
    title: 'Fixture: a title long enough to want a shorter one on a results page',
    metaTitle: 'Fixture: a shorter title',
  };
  const list = [...fixturePosts, withMetaTitle];
  // Two closing lines rather than the real one, so that the footer test can tell one paragraph per
  // line from the lines joined into one; `posts.test.ts` pins the real lines.
  const FOOTER_LINES: typeof actual.FOOTER_LINES = {
    own: [],
    jev: ['Fixture: the first closing line.', 'Fixture: the second closing line.'],
  };
  return { ...actual, FOOTER_LINES, posts: list, ...actual.buildPostIndex(list) };
});

// The card is a PNG drawn by `next/og`; what this file checks is what the handler asks it to draw.
const socialCard = vi.hoisted(() => vi.fn<(card: unknown) => Response>(() => new Response('card')));
vi.mock('@/lib/og-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/og-image')>()),
  socialCard,
}));

// `notFound()`'s own error is a Next internal (a digest string that has changed between releases),
// so the page's call is observed through a stand-in that throws an error of this file's own.
const notFound = vi.hoisted(() =>
  vi.fn<() => never>(() => {
    throw new Error('notFound() was called');
  }),
);
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound,
}));

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const paramsOf = (slug: string) => ({ params: Promise.resolve({ slug }) });

/** The `dd` a `dt` labels, and the `<time>` inside it. */
function dateLabelled(label: string): HTMLTimeElement {
  const term = screen.getByText(label, { selector: 'dt' });
  const time = term.nextElementSibling?.querySelector('time');
  if (term.nextElementSibling?.tagName !== 'DD' || !time) {
    throw new Error(`the ${label} term must be followed by a <dd> holding a <time>`);
  }
  return time;
}

describe('the post page', () => {
  it('has the published fixtures to render, and not the draft', () => {
    // The control: every assertion below walks `publishedPosts`, so an empty list would pass them all.
    expect(publishedPosts.map(({ slug }) => slug)).toEqual([
      hostileTitlePost.slug,
      everyBlockPost.slug,
      'fixture-meta-title',
    ]);
  });

  it.each(publishedPosts.map((post) => [post.slug, post] as const))(
    '%s renders one h1, its title, then both dates, labelled',
    async (_slug, post) => {
      render(await PostPage(paramsOf(post.slug)));

      const headings = screen.getAllByRole('heading', { level: 1 });
      expect(headings).toHaveLength(1);
      // As written: the hostile fixture's `&`, `<` and `"` are text, not markup.
      expect(headings[0].textContent).toBe(post.title);

      // Labelled, and machine-readable as the stored day (Google's publication-dates guidance).
      const published = dateLabelled('Published');
      expect(published).toHaveAttribute('dateTime', post.publishedAt);
      expect(published.textContent).toBe(formatContentDate(post.publishedAt));
      const updated = dateLabelled('Updated');
      expect(updated).toHaveAttribute('dateTime', post.updatedAt);
      expect(updated.textContent).toBe(formatContentDate(post.updatedAt));

      // The dates come after the title and before the body.
      const [h1] = headings;
      const body = document.querySelector('[data-post-body]');
      expect(body).not.toBeNull();
      expect(h1.compareDocumentPosition(published) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(
        published.compareDocumentPosition(body!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it('renders every block kind of the post, in its order', async () => {
    render(await PostPage(paramsOf(everyBlockPost.slug)));
    const body = document.querySelector('[data-post-body]')!;
    // One element per block: paragraph, h2, list, h3, numbered list, two code blocks, a quote.
    expect([...body.children].map((element) => element.tagName)).toEqual([
      'P',
      'H2',
      'UL',
      'H3',
      'OL',
      'FIGURE',
      'FIGURE',
      'BLOCKQUOTE',
    ]);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('A level-two heading');
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('A level-three heading');
    const code = [...body.querySelectorAll('pre')].map((pre) => pre.textContent);
    expect(code).toEqual(
      everyBlockPost.body.flatMap((block) => (block.kind === 'code' ? [block.code] : [])),
    );
  });

  it('keeps the way back out of the article, which holds the title, the dates and the body', async () => {
    const { container } = render(await PostPage(paramsOf(everyBlockPost.slug)));
    const articles = container.querySelectorAll('article');
    expect(articles).toHaveLength(1);
    const [article] = articles;
    expect(article.querySelector('h1')?.textContent).toBe(everyBlockPost.title);
    expect(article.querySelectorAll('time')).toHaveLength(2);
    expect(article.querySelector('[data-post-body]')).not.toBeNull();
    const back = screen.getByRole('link', { name: 'Back to Writing' });
    expect(back).toHaveAttribute('href', '/blog');
    expect(article.contains(back)).toBe(false);
  });

  it('ends a jev post with its footer lines, last inside the article, in --muted text', async () => {
    // The control: with one line, a footer that joined its lines into one paragraph would pass.
    expect(FOOTER_LINES.jev.length).toBeGreaterThan(1);
    render(await PostPage(paramsOf(hostileTitlePost.slug)));
    const footer = document.querySelector('article')!.lastElementChild!;
    expect(footer.tagName).toBe('FOOTER');
    expect([...footer.children].map((line) => [line.tagName, line.textContent])).toEqual(
      FOOTER_LINES.jev.map((line) => ['P', line]),
    );
    expect(footer.className).toContain('text-[var(--muted)]');
    for (const element of [footer, ...footer.children]) {
      expect(element.className).not.toMatch(/opacity-|text-\S+\/\d/);
    }
  });

  it('gives an own post no footer', async () => {
    render(await PostPage(paramsOf(everyBlockPost.slug)));
    expect(document.querySelector('article footer')).toBeNull();
  });

  it('puts no text under aria-hidden, which the axe gate would measure anyway', async () => {
    for (const post of publishedPosts) {
      const { container, unmount } = render(await PostPage(paramsOf(post.slug)));
      for (const hidden of container.querySelectorAll('[aria-hidden="true"]')) {
        expect(hidden.textContent?.trim(), post.slug).toBe('');
      }
      unmount();
    }
  });

  it('refuses a draft and an unknown slug rather than rendering them', async () => {
    // Unreachable in a build, where `dynamicParams = false` 404s any slug the static params lack,
    // but the lookup it rests on must find nothing for a draft either.
    for (const slug of [draftPost.slug, 'does-not-exist']) {
      notFound.mockClear();
      // notFound()'s own error, not any throw on the way to rendering.
      await expect(PostPage(paramsOf(slug)), slug).rejects.toThrow('notFound() was called');
      expect(notFound, slug).toHaveBeenCalledOnce();
      expect(await generateMetadata(paramsOf(slug)), slug).toEqual({ title: 'Not Found' });
    }
  });
});

describe('its static params', () => {
  it('prerender every published post and nothing else, so another slug is a routing 404', async () => {
    // ADR 0015: an unknown slug never reaches a render-time notFound().
    expect(dynamicParams).toBe(false);
    const slugs = (await generateStaticParams()).map(({ slug }) => slug);
    expect(slugs).toEqual(publishedPosts.map(({ slug }) => slug));
    expect(slugs).not.toContain(draftPost.slug);
  });
});

describe('its metadata', () => {
  it.each(publishedPosts.map((post) => [post.slug, post] as const))(
    '%s is an article at its own path, with its card',
    async (_slug, post) => {
      const metadata = await generateMetadata(paramsOf(post.slug));
      expect(metadata.title).toBe(post.metaTitle ?? post.title);
      expect(metadata.description).toBe(post.summary);
      expect(metadata.alternates?.canonical).toBe(`/blog/${post.slug}`);
      expect(metadata.openGraph).toMatchObject({
        type: 'article',
        url: `/blog/${post.slug}`,
        title: post.title,
        images: [
          {
            url: `/blog/${post.slug}/og-image.png`,
            alt: `Writing: ${post.title} — Milos Cvetkovic`,
          },
        ],
      });
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
    },
  );

  it('uses a metaTitle for the results page and keeps the whole title for link previews', async () => {
    const post = publishedPosts.find(({ metaTitle }) => metaTitle !== undefined);
    if (!post?.metaTitle) throw new Error('the mocked index must hold a post with a metaTitle');
    const metadata = await generateMetadata(paramsOf(post.slug));
    expect(metadata.title).toBe(post.metaTitle);
    expect(metadata.openGraph?.title).toBe(post.title);
    expect(metadata.twitter?.title).toBe(post.title);
  });
});

describe('its card', () => {
  it('is prerendered, for published posts only', () => {
    // A GET handler is dynamic by default since Next 15 and would deploy as a function.
    expect(card.dynamic).toBe('force-static');
    expect(card.dynamicParams).toBe(false);
    expect(card.generateStaticParams()).toEqual(publishedPosts.map(({ slug }) => ({ slug })));
  });

  it('draws the post under the Writing eyebrow', async () => {
    for (const post of publishedPosts) {
      socialCard.mockClear();
      const response = await card.GET(new Request('http://localhost/'), paramsOf(post.slug));
      expect(response).toBeInstanceOf(Response);
      expect(socialCard).toHaveBeenCalledExactlyOnceWith({
        eyebrow: 'Writing',
        title: post.title,
        description: post.summary,
        tags: post.tags,
      });
    }
  });

  it('names the slug when asked for a post it does not have', async () => {
    await expect(
      card.GET(new Request('http://localhost/'), paramsOf(draftPost.slug)),
    ).rejects.toThrow(JSON.stringify(draftPost.slug));
  });
});

describe('the post modules', () => {
  // Server components with no client state: nothing on a post needs the browser, and a
  // per-character AnimatedText heading reads one letter at a time to an extractor (#47).
  it.each([
    ['app/blog/[slug]/page.tsx'],
    ['app/blog/[slug]/og-image.png/route.ts'],
    ['components/post-body.tsx'],
  ])('%s is server-only', (file) => {
    const source = readFileSync(join(APP, '..', file), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use client['"]/m);
    // Imports, static, side-effect or dynamic, rather than any mention: the comments name what is
    // kept out. `AnimatedText` lives in `animated-hero/animated-text.tsx`; either name is refused.
    expect(source).not.toMatch(
      /(?:from\s+|import\s+|import\s*\(\s*)['"][^'"]*(?:gsap|animated-hero|animated-text)/,
    );
  });
});
