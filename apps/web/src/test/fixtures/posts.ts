/**
 * Posts for tests, never for the site. The real `posts` array in `src/data/posts.ts` stays empty
 * until the owner publishes the first post, so the code that renders posts proves its non-empty
 * path against these instead, through `vi.mock('@/data/posts')` or `buildPostIndex(fixturePosts)`.
 *
 * Between them they hold every block kind and every inline kind, both heading levels, both list
 * styles, a code block with a language and one without, a table of three columns with | and * in a
 * cell, links of both allowed forms, a title with `&`, `<` and `"` in it, a draft, and two
 * published posts with different dates, one of each kind, listed oldest first so that a
 * newest-first sort has something to do.
 * `src/data/__tests__/posts.test.ts` fails when a kind is missing here, and when any of these stops
 * passing the post checker.
 *
 * The copy describes the fixtures themselves. None of it is a post, and none of it is the owner's.
 */
import type { DraftPost, Post, PublishedPost } from '@/data/posts';

/** The older published post: every block kind, every inline kind, both heading levels. */
export const everyBlockPost: PublishedPost = {
  slug: 'fixture-every-block',
  draft: false,
  kind: 'own',
  title: 'Fixture: every block and inline kind',
  summary:
    'A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.',
  tags: ['Fixture', 'Testing'],
  publishedAt: '2026-08-03',
  updatedAt: '2026-08-20',
  body: [
    {
      kind: 'paragraph',
      content: [
        'A paragraph of plain text, then inline code: ',
        { code: 'buildPostIndex(posts)' },
        ', then a link to ',
        { text: 'the work page', href: '/work' },
        ' and one to ',
        { text: 'an external page', href: 'https://example.com/fixture?kind=link#inline' },
        '.',
      ],
    },
    { kind: 'heading', level: 2, text: 'A level-two heading' },
    {
      kind: 'list',
      items: [
        ['A bullet item of plain text.'],
        ['A bullet item with ', { code: 'inline code' }, ' in it.'],
        [{ text: 'A bullet item that is a link', href: '/blog' }],
      ],
    },
    { kind: 'heading', level: 3, text: 'A level-three heading' },
    {
      kind: 'list',
      ordered: true,
      items: [['The first numbered item.'], ['The second numbered item.']],
    },
    {
      kind: 'code',
      language: 'ts',
      code: "const greeting = 'fixture';\nconsole.log(greeting);",
    },
    { kind: 'code', code: 'A code block with no language.' },
    {
      kind: 'quote',
      content: ['A quotation, with ', { code: 'code' }, ' and plain text in it.'],
    },
    {
      kind: 'table',
      caption: 'Fixture: a table of three columns',
      columns: ['Fixture run', 'Blocks', 'Result'],
      rows: [
        ['First run', '9', 'Every block rendered'],
        ['Second run', '9', 'The same, with | and * in a cell'],
      ],
    },
  ],
};

/**
 * The newer published post, whose title carries the three characters that break unescaped HTML and
 * XML, and whose copy carries characters that Markdown would read as syntax.
 */
export const hostileTitlePost: PublishedPost = {
  slug: 'fixture-hostile-title',
  draft: false,
  kind: 'jev',
  title: 'Fixture: & <tags> and "quotes"',
  summary:
    'A test fixture whose title holds &, < and " and whose text holds *stars*, _underscores_ and <b>tags</b>, all of it plain text.',
  tags: ['Fixture'],
  publishedAt: '2026-09-07',
  updatedAt: '2026-09-07',
  body: [
    {
      kind: 'paragraph',
      content: ['# Not a heading, *not emphasis*, [not a link](/nowhere) & <em>not markup</em>.'],
    },
  ],
};

/** A draft: no dates yet, and a body still in progress. Nothing may render it. */
export const draftPost: DraftPost = {
  slug: 'fixture-draft',
  draft: true,
  kind: 'own',
  title: 'Fixture: a draft',
  summary: 'A test fixture that is still a draft, so no page, feed, sitemap or twin may show it.',
  tags: [],
  body: [],
};

/** In data order: oldest first, the draft between the two published posts. */
export const fixturePosts: readonly Post[] = [everyBlockPost, draftPost, hostileTitlePost];
