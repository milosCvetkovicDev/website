import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blogCopy } from '@/data/pages/blog';
import type { Post } from '@/data/posts';
import { formatContentDate } from '@/lib/content-date';
import { draftPost, everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';

/**
 * `/blog`, the list of posts (#61, 61c).
 *
 * `hasPublishedPosts` is the one switch (ADR 0028, decision 4): with a post published the page
 * lists the published posts, newest first, and is indexable; with none it keeps today's Coming
 * Soon placeholder and its `noindex`. The real `posts` array is empty until the owner publishes
 * the first post, so each test loads the page over a list of its own, built with `buildPostIndex`,
 * the same code the real exports come from. `e2e/blog.spec.ts` checks the served page in whichever
 * state the real data is in.
 */

afterEach(() => {
  vi.doUnmock('@/data/posts');
  vi.resetModules();
});

/** The page module, with `@/data/posts` built over `list` in place of the real posts. */
async function pageOver(list: readonly Post[]) {
  vi.resetModules();
  vi.doMock('@/data/posts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/data/posts')>();
    return { ...actual, posts: list, ...actual.buildPostIndex(list) };
  });
  return import('../page');
}

/** The `<time>` in the `<dd>` that the `<dt>` with `label` labels, inside `scope`. */
function timeLabelled(scope: HTMLElement, label: string): HTMLTimeElement {
  const term = within(scope).getByText(label, { selector: 'dt' });
  const time = term.nextElementSibling?.querySelector(':scope > time');
  if (term.nextElementSibling?.tagName !== 'DD' || !(time instanceof HTMLTimeElement)) {
    throw new Error(`the ${label} term must be followed by a <dd> holding a <time>`);
  }
  return time;
}

describe('/blog with posts published', () => {
  it('lists each published post, newest first: title linked, day and summary', async () => {
    const { default: BlogPage } = await pageOver(fixturePosts);
    const { container } = render(<BlogPage />);

    // The page's own heading stays, and each post's title is a heading under it.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h1) => h1.textContent)).toEqual([
      'Writing',
    ]);

    const lists = container.querySelectorAll('[data-post-list]');
    expect(lists).toHaveLength(1);
    const [list] = lists;
    expect(list.tagName, 'an ordered list: the order, newest first, is part of what it says').toBe(
      'OL',
    );
    // Safari drops list semantics from a list styled without markers, so the role is stated on the
    // element: jsdom would report `list` from the tag alone, which is why the attribute is pinned.
    expect(list).toHaveAttribute('role', 'list');
    expect(screen.getByRole('list')).toBe(list);

    // The fixtures are in data order, oldest first, with the draft between the two.
    const expected = [hostileTitlePost, everyBlockPost];
    const items = [...list.children];
    expect(items.map((item) => item.tagName)).toEqual(expected.map(() => 'LI'));
    expect(within(list as HTMLElement).getAllByRole('listitem')).toEqual(items);

    items.forEach((item, index) => {
      const post = expected[index];
      const scope = item as HTMLElement;

      const headings = within(scope).getAllByRole('heading');
      expect(headings.map((heading) => heading.tagName)).toEqual(['H2']);
      const links = within(headings[0]).getAllByRole('link');
      expect(links).toHaveLength(1);
      // As written: the hostile fixture's `&`, `<` and `"` are text, not markup.
      expect(links[0].textContent).toBe(post.title);
      expect(links[0]).toHaveAttribute('href', `/blog/${post.slug}`);

      // Labelled and machine-readable, as on the post's own page: the stored day, written out.
      const published = timeLabelled(scope, 'Published');
      expect(published).toHaveAttribute('dateTime', post.publishedAt);
      expect(published.textContent).toBe(formatContentDate(post.publishedAt));

      expect(within(scope).getByText(post.summary, { selector: 'p' })).toBeInTheDocument();
    });
  });

  it('gives keyboard focus the colour a pointer hover gives each title link', async () => {
    // A hover style with no focus twin leaves keyboard users without the affordance, as on /work.
    const { default: BlogPage } = await pageOver(fixturePosts);
    const { container } = render(<BlogPage />);
    const links = [...container.querySelectorAll('[data-post-list] a')];
    expect(links).toHaveLength(2);
    for (const link of links) {
      const classes = [...link.classList];
      const hovers = classes.filter((token) => token.startsWith('hover:'));
      expect(hovers).not.toEqual([]);
      for (const hover of hovers) {
        expect(classes, `${hover} needs a focus-visible twin`).toContain(
          `focus-visible:${hover.slice('hover:'.length)}`,
        );
      }
    }
  });

  it('never dims text, and never uses --accent as a text colour', async () => {
    // ADR 0011 and 0010. The axe gate renders /blog only as the placeholder until a post is
    // published, so a dimmed or --accent class in the list would first fail in the commit that
    // publishes a post; this guards the list over fixtures, as post-body.test.tsx guards the body.
    const { default: BlogPage } = await pageOver(fixturePosts);
    const { container } = render(<BlogPage />);
    // The list element too: a dim on the <ol> would dim every post.
    const bases = [...container.querySelectorAll('[data-post-list], [data-post-list] *')]
      .flatMap((element) => [...element.classList])
      .map((name) => name.split(':').at(-1) ?? name);
    expect(bases).not.toEqual([]);
    const step = String.raw`(?:\d+(?:\.\d+)?|\[[^\]]+\])`;
    const dimmed = new RegExp(String.raw`^(?:text-.*\/${step}|opacity-${step})$`);
    expect(bases.filter((name) => dimmed.test(name) && name !== 'opacity-100')).toEqual([]);
    // Every spelling Tailwind v4 accepts for --accent as a text colour (`--color-accent` in the theme).
    const accentText = /^text-(?:\[var\(--accent\)\]|\(--accent\)|accent)$/;
    expect(bases.filter((name) => accentText.test(name))).toEqual([]);
  });

  it('wraps a long title or summary inside its card instead of widening the page', async () => {
    // Either is free text; an unbroken URL in it would overflow a phone-width card.
    const { default: BlogPage } = await pageOver(fixturePosts);
    const { container } = render(<BlogPage />);
    const items = [...container.querySelectorAll('[data-post-list] > li')];
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.querySelector('h2')).toHaveClass('wrap-break-word');
      expect(item.querySelector(':scope > p')).toHaveClass('wrap-break-word');
    }
  });

  it('shows no draft, and no placeholder', async () => {
    const { default: BlogPage } = await pageOver(fixturePosts);
    const { container } = render(<BlogPage />);
    const text = container.textContent ?? '';

    expect(text).not.toContain(draftPost.title);
    expect(text).not.toContain(draftPost.summary);
    expect(container.querySelector(`a[href="/blog/${draftPost.slug}"]`)).toBeNull();

    expect(text).not.toContain('Coming Soon');
    expect(text).not.toContain(blogCopy.comingSoon.heading);
    for (const paragraph of blogCopy.comingSoon.paragraphs) {
      expect(text).not.toContain(paragraph);
    }
  });

  it('is indexable', async () => {
    const { metadata } = await pageOver(fixturePosts);
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});

describe.each([
  ['no post at all', [] as readonly Post[]],
  ['only a draft', [draftPost] as readonly Post[]],
])('/blog with %s', (_, list) => {
  it('keeps the Coming Soon placeholder, and lists nothing', async () => {
    const { default: BlogPage } = await pageOver(list);
    const { container } = render(<BlogPage />);

    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(blogCopy.comingSoon.heading);
    for (const paragraph of blogCopy.comingSoon.paragraphs) {
      expect(screen.getByText(paragraph, { selector: 'p' })).toBeInTheDocument();
    }
    expect(container.querySelector('[data-post-list]')).toBeNull();
    expect(container.querySelector('ol, li, time')).toBeNull();
    expect(container.textContent).not.toContain(draftPost.title);
  });

  it('hides the decorative pen icon from assistive technology', async () => {
    const { default: BlogPage } = await pageOver(list);
    const { container } = render(<BlogPage />);
    const icons = [...container.querySelectorAll('svg')];
    expect(icons).toHaveLength(1);
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('stays out of search', async () => {
    const { metadata } = await pageOver(list);
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
