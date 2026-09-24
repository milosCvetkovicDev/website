/**
 * @vitest-environment node
 *
 * The title and description each route actually declares, against what a results page shows.
 *
 * Google cuts a title at about 600 px, some 60 characters, and a description at about 155; past
 * that, the words that tell a searcher what the page is are the ones that get cut. `Work | Milos
 * Cvetkovic` fitted easily and said nothing, so the titles now carry what each page is about, and
 * this pins them inside the space they have. The root template appends ` | Milos Cvetkovic` to
 * every title but the home page's, which is absolute.
 */
import type { Metadata } from 'next';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { metadata as home } from '../page';
import { metadata as about } from '../about/page';
import { metadata as blog } from '../blog/page';
import { metadata as contact } from '../contact/page';
import { metadata as skills } from '../skills/page';
import { metadata as work } from '../work/page';
import { generateMetadata } from '../work/[slug]/page';

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;

/** The `<title>` the root template turns a page's title into. */
function served(title: Metadata['title']): string {
  if (typeof title === 'string') return `${title} | Milos Cvetkovic`;
  if (title && 'absolute' in title) return title.absolute;
  throw new Error(`unexpected title shape: ${JSON.stringify(title)}`);
}

const routes: [string, Metadata][] = [
  ['/', home],
  ['/about', about],
  ['/blog', blog],
  ['/contact', contact],
  ['/skills', skills],
  ['/work', work],
];

describe('page titles and descriptions', () => {
  it.each(routes)('%s fits a results page', (_, metadata) => {
    const title = served(metadata.title);
    expect([...title].length, title).toBeLessThanOrEqual(TITLE_MAX);
    const description = String(metadata.description);
    expect([...description].length, description).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it.each(caseStudies.map((study) => [study.slug]))(
    '/work/%s fits a results page',
    async (slug) => {
      const metadata = await generateMetadata({ params: Promise.resolve({ slug }) });
      const title = served(metadata.title);
      expect([...title].length, title).toBeLessThanOrEqual(TITLE_MAX);
      // `<title> — <tagline>`: the name of the project and what it is.
      expect(title).toMatch(/^.+ — .+ \| Milos Cvetkovic$/);
      expect([...String(metadata.description)].length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    },
  );

  it('no two routes share a title', () => {
    const titles = routes.map(([, metadata]) => served(metadata.title));
    expect(new Set(titles).size).toBe(titles.length);
  });
});
