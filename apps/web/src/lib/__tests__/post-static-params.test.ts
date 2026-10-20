/**
 * `postStaticParams`, the `generateStaticParams` of `/blog/[slug]` and its card: the published
 * posts, plus one placeholder for `next dev` while nothing is published (see the function).
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { NO_PUBLISHED_POST_SLUG, postStaticParams } from '../post-static-params';

const twoPosts = [{ slug: 'first-post' }, { slug: 'second-post' }];

describe('postStaticParams', () => {
  it('lists every published post and nothing else, in every environment', () => {
    for (const environment of ['production', 'test', 'development', undefined]) {
      expect(postStaticParams(twoPosts, environment), String(environment)).toEqual(twoPosts);
    }
  });

  it('is empty with nothing published, for a build and for the tests', () => {
    expect(postStaticParams([], 'production')).toEqual([]);
    expect(postStaticParams([], 'test')).toEqual([]);
    expect(postStaticParams([], undefined)).toEqual([]);
  });

  it('gives the development server one placeholder with nothing published', () => {
    // Next's dev server enforces `dynamicParams = false` only for a non-empty list.
    expect(postStaticParams([], 'development')).toEqual([{ slug: NO_PUBLISHED_POST_SLUG }]);
  });

  it('reads NODE_ENV when no environment is passed', () => {
    // Vitest runs with NODE_ENV=test, which a build's empty list matches.
    expect(process.env.NODE_ENV).toBe('test');
    expect(postStaticParams([])).toEqual([]);
  });
});
