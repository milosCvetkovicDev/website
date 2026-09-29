/**
 * The post model's rules as one checker, `problemsIn(posts, today)`, run against the real `posts`
 * array and the fixtures, and shown to name each defect it exists for. The real array is empty
 * until the owner publishes, so it passes trivially; what proves the rules is the defect table,
 * where each broken copy of a fixture has to produce exactly one problem, the one it was broken for.
 *
 * Pure data with no DOM, so no jsdom window: building one costs about two seconds per worker.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { formatContentDate, isPublishableContentDate } from '@/lib/content-date';
import { draftPost, everyBlockPost, fixturePosts, hostileTitlePost } from '@/test/fixtures/posts';
import {
  buildPostIndex,
  getPost,
  hasPublishedPosts,
  posts,
  publishedPosts,
  type Inline,
  type Post,
  type PostBlock,
  type PublishedPost,
} from '../posts';

/** What the root layout's title template, `%s | Milos Cvetkovic`, adds to a page's title. */
const TITLE_SUFFIX = ' | Milos Cvetkovic';
/** Google cuts a title at about 600 px, some 60 characters, as page-metadata.test.ts holds. */
const TITLE_MAX = 60;
const SUMMARY_MIN = 50;
const SUMMARY_MAX = 300;
/** Lowercase letters and digits in words joined by single hyphens: the `<slug>` in `/blog/<slug>`. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * An https URL with a host, or a path on this site. Not `//host` or `/\host`, which a browser
 * resolves to another site, and nothing with whitespace or a backslash in it.
 */
const HREF = /^(?:https:\/\/[^\s/?#\\]+|\/(?![/\\]))[^\s\\]*$/;

const characters = (value: string) => [...value].length;

/** Problems with a run of inline pieces: a paragraph, a quote or one list item. */
function inlineProblems(pieces: readonly Inline[] | undefined, where: string): string[] {
  if (!Array.isArray(pieces) || pieces.length === 0) return [`${where} is empty`];
  const problems: string[] = [];
  let text = '';
  pieces.forEach((piece: unknown, index) => {
    const at = `${where}, piece ${index + 1}`;
    if (typeof piece === 'string') {
      text += piece;
    } else if (piece && typeof piece === 'object' && 'code' in piece) {
      const { code } = piece as { code: unknown };
      if (typeof code !== 'string' || !code.trim())
        problems.push(`${at}: the inline code is empty`);
      else text += code;
    } else if (piece && typeof piece === 'object' && 'href' in piece) {
      const { text: label, href } = piece as { text: unknown; href: unknown };
      if (typeof label !== 'string' || !label.trim()) problems.push(`${at}: the link has no text`);
      else text += label;
      if (typeof href !== 'string' || !HREF.test(href)) {
        problems.push(
          `${at}: the link goes to ${JSON.stringify(href)}, which is neither an https URL nor a path on this site`,
        );
      }
    } else {
      problems.push(`${at} is not text, code or a link`);
    }
  });
  if (problems.length === 0 && !text.trim()) problems.push(`${where} is empty`);
  return problems;
}

function blockProblems(block: PostBlock, where: string): string[] {
  switch (block.kind) {
    case 'heading': {
      const problems: string[] = [];
      if (block.level !== 2 && block.level !== 3) {
        problems.push(`${where}: heading level ${String(block.level)} is not 2 or 3`);
      }
      if (typeof block.text !== 'string' || !block.text.trim()) {
        problems.push(`${where}: the heading is empty`);
      }
      return problems;
    }
    case 'paragraph':
      return inlineProblems(block.content, `${where} (paragraph)`);
    case 'quote':
      return inlineProblems(block.content, `${where} (quote)`);
    case 'list':
      if (!Array.isArray(block.items) || block.items.length === 0) {
        return [`${where}: the list has no items`];
      }
      return block.items.flatMap((item, index) =>
        inlineProblems(item, `${where} (list item ${index + 1})`),
      );
    case 'code':
      return typeof block.code === 'string' && block.code.trim()
        ? []
        : [`${where}: the code block is empty`];
    default: {
      const { kind } = block as { kind?: unknown };
      return [`${where}: unknown block kind ${JSON.stringify(kind)}`];
    }
  }
}

/**
 * A post's dates, drafts included: a date a draft gives must already be a real day, so publishing
 * it cannot surprise anyone. Only a published post must have both, and only a published post is
 * held to "not in the future", which counts a day as begun once UTC+14 has reached it
 * (`isPublishableContentDate`).
 */
function dateProblems(post: Post, today: Date): string[] {
  const problems: string[] = [];
  const published = post.draft === false;
  const valid: Partial<Record<'publishedAt' | 'updatedAt', string>> = {};
  for (const field of ['publishedAt', 'updatedAt'] as const) {
    const value: unknown = post[field];
    if (value === undefined) {
      if (published) problems.push(`${post.slug}: a published post needs ${field}`);
    } else if (typeof value !== 'string' || formatContentDate(value) === null) {
      problems.push(
        `${post.slug}: ${field} ${JSON.stringify(value)} is not a real YYYY-MM-DD day from 2000 on`,
      );
    } else {
      valid[field] = value;
      if (published && !isPublishableContentDate(value, today)) {
        problems.push(`${post.slug}: ${field} ${value} is in the future`);
      }
    }
  }
  if (valid.publishedAt && valid.updatedAt && valid.updatedAt < valid.publishedAt) {
    problems.push(
      `${post.slug}: updatedAt ${valid.updatedAt} is before publishedAt ${valid.publishedAt}`,
    );
  }
  return problems;
}

/** What a published post must hold before anything renders it. */
function contentProblems(post: PublishedPost): string[] {
  const problems: string[] = [];
  const name = post.slug;
  if (!post.title.trim()) problems.push(`${name}: the title is empty`);
  if (post.metaTitle !== undefined && !post.metaTitle.trim()) {
    problems.push(`${name}: metaTitle is empty; leave it out to use the title`);
  }
  const served = `${post.metaTitle ?? post.title}${TITLE_SUFFIX}`;
  if (characters(served) > TITLE_MAX) {
    problems.push(
      `${name}: the served title "${served}" is ${characters(served)} characters, over ${TITLE_MAX}: shorten the title or set a metaTitle`,
    );
  }
  const summary = characters(post.summary.trim());
  if (summary < SUMMARY_MIN || summary > SUMMARY_MAX) {
    problems.push(
      `${name}: the summary is ${summary} characters, outside ${SUMMARY_MIN}-${SUMMARY_MAX}`,
    );
  }
  if (!Array.isArray(post.body) || post.body.length === 0) {
    problems.push(`${name}: the body has no blocks`);
    return problems;
  }
  // The page's one h1 is the title, so the body's headings start at 2, and a 3 needs a 2 above it:
  // a skipped level is an axe `heading-order` finding on the post page.
  let underLevelTwo = false;
  post.body.forEach((block, index) => {
    const where = `${name}: block ${index + 1}`;
    problems.push(...blockProblems(block, where));
    if (block.kind === 'heading' && block.level === 2) underLevelTwo = true;
    if (block.kind === 'heading' && block.level === 3 && !underLevelTwo) {
      problems.push(`${where}: a level-3 heading comes before any level-2 heading`);
    }
  });
  return problems;
}

/**
 * Every problem with `list` as of `today`, one message each, or none. A slug is checked on every
 * post, since a draft keeps its slug when it is published. A draft is otherwise held only to the
 * dates it gives: it renders nowhere, so its title, summary and body are checked once it is
 * published, in the commit that sets `draft: false`.
 */
function problemsIn(list: readonly Post[], today: Date): string[] {
  const problems: string[] = [];
  const counts = new Map<string, number>();
  for (const { slug } of list) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  for (const [slug, count] of counts) {
    if (count > 1) problems.push(`slug "${slug}" is used by ${count} posts`);
  }
  for (const post of list) {
    if (typeof post.slug !== 'string' || !SLUG.test(post.slug)) {
      problems.push(
        `${post.slug}: slug ${JSON.stringify(post.slug)} is not lowercase words joined by single hyphens`,
      );
    }
    const { draft }: { draft: unknown } = post;
    if (draft !== true && draft !== false) {
      problems.push(`${post.slug}: draft must be true or false, not ${JSON.stringify(draft)}`);
    }
    problems.push(...dateProblems(post, today));
    if (post.draft === false) problems.push(...contentProblems(post));
  }
  return problems;
}

/** A fixed day for the defect table, so "in the future" does not depend on when the suite runs. */
const TODAY = new Date('2026-09-28T12:00:00Z');

/** The every-block fixture with some fields replaced, cast so a test can break the types too. */
const published = (fields: Record<string, unknown>): Post =>
  ({ ...everyBlockPost, ...fields }) as unknown as Post;
const withBody = (...body: unknown[]): Post => published({ body });
const paragraph = (...content: unknown[]) => ({ kind: 'paragraph', content });
const heading = (level: unknown, text = 'A heading') => ({ kind: 'heading', level, text });
const withLink = (href: string) => withBody(paragraph('See ', { text: 'this', href }, '.'));
const withTitle = (title: string, metaTitle?: string) =>
  published(metaTitle === undefined ? { title } : { title, metaTitle });
const summaryOf = (length: number) => published({ summary: 'x'.repeat(length) });

const defects: [string, Post[], RegExp][] = [
  [
    'a slug used twice',
    [everyBlockPost, { ...hostileTitlePost, slug: everyBlockPost.slug }],
    /^slug "fixture-every-block" is used by 2 posts$/,
  ],
  ...[
    'Fixture-post',
    'fixture--post',
    '-fixture',
    'fixture-',
    'fixture post',
    'fixture/post',
    'fixture_post',
    '',
  ].map((slug): [string, Post[], RegExp] => [
    `the slug ${JSON.stringify(slug)}`,
    [published({ slug })],
    /: slug ".*" is not lowercase words joined by single hyphens$/,
  ]),
  [
    'a draft flag that is neither true nor false',
    [published({ draft: undefined })],
    /: draft must be true or false, not undefined$/,
  ],
  [
    'a published post with no publishedAt',
    [published({ publishedAt: undefined })],
    /: a published post needs publishedAt$/,
  ],
  [
    'a published post with no updatedAt',
    [published({ updatedAt: undefined })],
    /: a published post needs updatedAt$/,
  ],
  [
    'a date that is not YYYY-MM-DD',
    [published({ publishedAt: '2026-8-03' })],
    /: publishedAt "2026-8-03" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a date that is not a real day',
    [published({ updatedAt: '2026-02-30' })],
    /: updatedAt "2026-02-30" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a date before 2000',
    [published({ publishedAt: '0026-08-03' })],
    /: publishedAt "0026-08-03" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a timestamp in place of a day',
    [published({ updatedAt: '2026-08-20T10:00:00Z' })],
    /: updatedAt "2026-08-20T10:00:00Z" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'an update before publication',
    [published({ publishedAt: '2026-08-20', updatedAt: '2026-08-03' })],
    /: updatedAt 2026-08-03 is before publishedAt 2026-08-20$/,
  ],
  [
    'an update in the future',
    [published({ updatedAt: '2026-10-05' })],
    /: updatedAt 2026-10-05 is in the future$/,
  ],
  [
    'a draft with a date that is not a real day',
    [{ ...draftPost, publishedAt: '2026-13-01' }],
    /^fixture-draft: publishedAt "2026-13-01" is not a real YYYY-MM-DD day from 2000 on$/,
  ],
  [
    'a draft updated before it was published',
    [{ ...draftPost, publishedAt: '2026-09-02', updatedAt: '2026-09-01' }],
    /^fixture-draft: updatedAt 2026-09-01 is before publishedAt 2026-09-02$/,
  ],
  [
    'a summary one character too short',
    [summaryOf(SUMMARY_MIN - 1)],
    /: the summary is 49 characters, outside 50-300$/,
  ],
  [
    'a summary one character too long',
    [summaryOf(SUMMARY_MAX + 1)],
    /: the summary is 301 characters, outside 50-300$/,
  ],
  ['an empty title', [withTitle('  ')], /: the title is empty$/],
  [
    'an empty metaTitle',
    [withTitle('A title', '')],
    /: metaTitle is empty; leave it out to use the title$/,
  ],
  [
    'a served title one character too long',
    [withTitle('x'.repeat(TITLE_MAX - characters(TITLE_SUFFIX) + 1))],
    /: the served title ".*" is 61 characters, over 60: shorten the title or set a metaTitle$/,
  ],
  [
    'a metaTitle that is itself too long',
    [withTitle('Short', 'y'.repeat(TITLE_MAX))],
    /: the served title ".*" is 78 characters, over 60/,
  ],
  ['an empty body', [withBody()], /: the body has no blocks$/],
  [
    'a level-1 heading',
    [withBody(heading(1), paragraph('Text.'))],
    /: block 1: heading level 1 is not 2 or 3$/,
  ],
  [
    'a level-4 heading',
    [withBody(heading(2), heading(4))],
    /: block 2: heading level 4 is not 2 or 3$/,
  ],
  [
    'a level-3 heading before any level-2 heading',
    [withBody(paragraph('Text.'), heading(3), heading(2))],
    /: block 2: a level-3 heading comes before any level-2 heading$/,
  ],
  ['an empty heading', [withBody(heading(2, ' '))], /: block 1: the heading is empty$/],
  ['a paragraph with no pieces', [withBody(paragraph())], /: block 1 \(paragraph\) is empty$/],
  [
    'a paragraph of blank text',
    [withBody(paragraph(' ', ''))],
    /: block 1 \(paragraph\) is empty$/,
  ],
  [
    'a quote with no pieces',
    [withBody({ kind: 'quote', content: [] })],
    /: block 1 \(quote\) is empty$/,
  ],
  [
    'a list with no items',
    [withBody({ kind: 'list', items: [] })],
    /: block 1: the list has no items$/,
  ],
  [
    'an empty list item',
    [withBody({ kind: 'list', items: [['One.'], []] })],
    /: block 1 \(list item 2\) is empty$/,
  ],
  [
    'an empty code block',
    [withBody({ kind: 'code', language: 'ts', code: '\n' })],
    /: block 1: the code block is empty$/,
  ],
  [
    'an empty piece of inline code',
    [withBody(paragraph('Run ', { code: '' }, '.'))],
    /: block 1 \(paragraph\), piece 2: the inline code is empty$/,
  ],
  [
    'a link with no text',
    [withBody(paragraph('See ', { text: ' ', href: '/work' }, '.'))],
    /: block 1 \(paragraph\), piece 2: the link has no text$/,
  ],
  [
    'an inline piece of no known kind',
    [withBody(paragraph({ bold: 'Text' }))],
    /: block 1 \(paragraph\), piece 1 is not text, code or a link$/,
  ],
  [
    'a block of no known kind',
    [withBody({ kind: 'table', rows: [] })],
    /: block 1: unknown block kind "table"$/,
  ],
  ...[
    'http://example.com',
    'example.com',
    'work',
    '#section',
    '//example.com',
    '/\\example.com',
    'javascript:alert(1)',
    'mailto:someone@example.com',
    'https://',
    'https:///path',
    'https://exa mple.com',
    '/work page',
    '',
  ].map((href): [string, Post[], RegExp] => [
    `a link to ${JSON.stringify(href)}`,
    [withLink(href)],
    /, piece 2: the link goes to ".*", which is neither an https URL nor a path on this site$/,
  ]),
];

const accepted: [string, Post[]][] = [
  ['a draft with no dates and no body', [draftPost]],
  [
    'a draft dated in the future',
    [{ ...draftPost, publishedAt: '2027-01-04', updatedAt: '2027-01-04' }],
  ],
  // At 12:00 UTC on the 28th it is already the 29th in UTC+14, so a post may carry that date.
  ['a date that has begun in UTC+14', [published({ updatedAt: '2026-09-29' })]],
  ['a summary of exactly 50 characters', [summaryOf(SUMMARY_MIN)]],
  ['a summary of exactly 300 characters', [summaryOf(SUMMARY_MAX)]],
  [
    'a served title of exactly 60 characters',
    [withTitle('x'.repeat(TITLE_MAX - characters(TITLE_SUFFIX)))],
  ],
  ['a long title with a short metaTitle', [withTitle('x'.repeat(TITLE_MAX), 'Short')]],
  ...[
    '/',
    '/work/self-healing-agent',
    '/blog#top',
    'https://example.com',
    'https://a.b/c?d=e#f',
  ].map((href): [string, Post[]] => [`a link to ${href}`, [withLink(href)]]),
];

describe('posts', () => {
  it('pass the post checker', () => {
    // The live clock is deliberate: "not in the future" is a statement about the day the suite runs.
    expect(problemsIn(posts, new Date())).toEqual([]);
  });

  it('publish exactly what buildPostIndex selects from them', () => {
    const index = buildPostIndex(posts);
    expect(publishedPosts).toEqual(index.publishedPosts);
    expect(hasPublishedPosts).toBe(index.hasPublishedPosts);
    expect(hasPublishedPosts).toBe(publishedPosts.length > 0);
    expect(publishedPosts.every((post) => post.draft === false)).toBe(true);
  });

  it('find every published post by its slug, and nothing at an unknown one', () => {
    for (const post of publishedPosts) expect(getPost(post.slug)).toBe(post);
    expect(getPost('does-not-exist')).toBeUndefined();
    for (const post of posts.filter((candidate) => candidate.draft)) {
      expect(getPost(post.slug), post.slug).toBeUndefined();
    }
  });
});

describe('buildPostIndex', () => {
  const index = buildPostIndex(fixturePosts);

  it('lists the published posts newest first and leaves the draft out', () => {
    expect(index.publishedPosts.map(({ slug }) => slug)).toEqual([
      'fixture-hostile-title',
      'fixture-every-block',
    ]);
    expect(index.hasPublishedPosts).toBe(true);
  });

  it('finds a published post, and nothing for a draft or an unknown slug', () => {
    expect(index.getPost('fixture-every-block')).toBe(everyBlockPost);
    expect(index.getPost('fixture-draft')).toBeUndefined();
    expect(index.getPost('does-not-exist')).toBeUndefined();
  });

  it('orders posts published on one day by the newer update, then by slug', () => {
    const day = { publishedAt: '2026-09-01', updatedAt: '2026-09-01' };
    const a = { ...everyBlockPost, ...day, slug: 'a' };
    const b = { ...everyBlockPost, ...day, slug: 'b' };
    const c = { ...everyBlockPost, ...day, slug: 'c', updatedAt: '2026-09-03' };
    expect(buildPostIndex([b, a, c]).publishedPosts.map(({ slug }) => slug)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not reorder the list it is given', () => {
    const list = [...fixturePosts];
    buildPostIndex(list);
    expect(list).toEqual(fixturePosts);
  });

  it('has nothing published when there are no posts, or only drafts', () => {
    for (const list of [[], [draftPost]]) {
      const empty = buildPostIndex(list);
      expect(empty.publishedPosts).toEqual([]);
      expect(empty.hasPublishedPosts).toBe(false);
      expect(empty.getPost('fixture-draft')).toBeUndefined();
    }
  });
});

describe('the post fixtures', () => {
  const publishedFixtures = fixturePosts.filter((post) => post.draft === false);
  const blocks = publishedFixtures.flatMap(({ body }) => body);

  it('pass the post checker', () => {
    expect(problemsIn(fixturePosts, new Date())).toEqual([]);
  });

  it('hold every block kind, both heading levels, both list styles and both code forms', () => {
    // `satisfies` fails typecheck when a kind is added to PostBlock without being added here.
    const kinds = {
      heading: true,
      paragraph: true,
      list: true,
      code: true,
      quote: true,
    } satisfies Record<PostBlock['kind'], true>;
    expect(new Set(blocks.map(({ kind }) => kind))).toEqual(new Set(Object.keys(kinds)));
    const headings = blocks.filter((block) => block.kind === 'heading');
    expect(new Set(headings.map(({ level }) => level))).toEqual(new Set([2, 3]));
    const lists = blocks.filter((block) => block.kind === 'list');
    expect(new Set(lists.map(({ ordered }) => Boolean(ordered)))).toEqual(new Set([true, false]));
    const code = blocks.filter((block) => block.kind === 'code');
    expect(new Set(code.map(({ language }) => language === undefined))).toEqual(
      new Set([true, false]),
    );
  });

  it('hold every inline kind, and links of both allowed forms', () => {
    function inlineKind(piece: Inline): 'text' | 'code' | 'link' {
      if (typeof piece === 'string') return 'text';
      if ('code' in piece) return 'code';
      if ('href' in piece) return 'link';
      // Fails typecheck when a kind is added to Inline without being named above.
      return piece satisfies never;
    }
    const pieces = blocks.flatMap((block) => {
      if (block.kind === 'paragraph' || block.kind === 'quote') return block.content;
      if (block.kind === 'list') return block.items.flat();
      return [];
    });
    expect(new Set(pieces.map(inlineKind))).toEqual(new Set(['text', 'code', 'link']));
    const hrefs = pieces.flatMap((piece) =>
      typeof piece === 'object' && 'href' in piece ? [piece.href] : [],
    );
    expect(hrefs.some((href) => href.startsWith('/'))).toBe(true);
    expect(hrefs.some((href) => href.startsWith('https://'))).toBe(true);
  });

  it('hold a published title with &, < and ", a draft, and two published posts oldest first', () => {
    expect(publishedFixtures.map(({ title }) => title)).toContainEqual(
      expect.stringMatching(/&.*<.*"/),
    );
    expect(fixturePosts.filter((post) => post.draft)).toHaveLength(1);
    expect(publishedFixtures).toHaveLength(2);
    const [older, newer] = publishedFixtures;
    expect(older.publishedAt < newer.publishedAt).toBe(true);
  });
});

describe('problemsIn', () => {
  it.each(defects)('names %s, and nothing else', (_, list, pattern) => {
    const problems = problemsIn(list, TODAY);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
  });

  it.each(accepted)('accepts %s', (_, list) => {
    expect(problemsIn(list, TODAY)).toEqual([]);
  });

  it('names every defect in one post, not only the first', () => {
    const problems = problemsIn(
      [published({ slug: 'Bad', summary: 'Short.', body: [], updatedAt: '2026-02-30' })],
      TODAY,
    );
    expect(problems).toHaveLength(4);
  });
});
