/**
 * @vitest-environment node
 *
 * The `/about` and `/contact` page records (#59), checked as data. The Markdown twin route that
 * will read them is 59e's, so until it lands this file is what runs them through the serialiser:
 * its guards (an empty paragraph, a row with the wrong cell count, a link that is neither on-site
 * nor http(s)) throw here rather than first at the twin's build. It also pins the invariants the
 * pages rely on and TypeScript cannot see: unique React keys, one filled button, and the metric
 * the timeline reads from the case study.
 */
import { describe, expect, it } from 'vitest';
import { formatMetric, getCaseStudy } from '@/data/case-studies';
import { pageToMarkdown } from '@/lib/serialise';
import { aboutCopy, aboutRecord, beliefs, credentials, facts, timeline } from '@/data/pages/about';
import { contactCopy, contactRecord, socialLinks } from '@/data/pages/contact';

/** The values that appear more than once in `values`. */
const repeats = (values: readonly string[]) =>
  values.filter((value, index) => values.indexOf(value) !== index);

describe('page records', () => {
  it.each([
    ['/about', aboutRecord],
    ['/contact', contactRecord],
  ])('%s serialises to a twin at its own path', (path, record) => {
    expect(record.path).toBe(path);
    const markdown = pageToMarkdown(record);
    for (const section of record.sections) {
      expect(markdown, `${path} twin must carry "${section.heading}"`).toContain(
        `## ${section.heading}`,
      );
    }
  });

  it('writes the About story as plain text, one paragraph per story paragraph', () => {
    const markdown = pageToMarkdown(aboutRecord);
    // The emphasised runs lose their marks and keep their words, joined to the text around them.
    expect(markdown).toContain("\n\nThat's my favorite kind of project.\n\n");
    expect(markdown).toContain('and opened PRs with fixes—without waking anyone up.\n\n');
    expect(markdown).not.toMatch(/\*\*That's|_without/);
    expect(markdown).toContain(`\n\n${aboutCopy.storyClose}\n\n`);
  });

  it('writes each link as an absolute URL', () => {
    const contact = pageToMarkdown(contactRecord);
    expect(contact).toMatch(/\[View My Work\]\(https?:\/\/[^)]+\/work\)/);
    for (const { cta, href } of socialLinks) expect(contact).toContain(`[${cta}](${href})`);
    const about = pageToMarkdown(aboutRecord);
    for (const { name, href } of aboutCopy.connect.links) {
      expect(about).toContain(`[${name}](${href})`);
    }
  });

  it("quotes the self-healing agent's metric from its case study", () => {
    const study = getCaseStudy('self-healing-agent');
    if (!study) throw new Error('the About timeline quotes the "self-healing-agent" case study');
    const entry = timeline.find(({ year }) => year === '2025');
    expect(entry?.description).toContain(
      `${formatMetric(study.highlight.metric)} ${study.highlight.metric.label}`,
    );
  });

  it('keys every list the pages render by a value no other entry shares', () => {
    expect(repeats(timeline.map(({ year }) => year)), 'timeline years').toEqual([]);
    expect(repeats(beliefs.map(({ title }) => title)), 'belief titles').toEqual([]);
    expect(repeats(facts.map(({ label }) => label)), 'fact labels').toEqual([]);
    expect(repeats(credentials.map(({ text }) => text)), 'credentials').toEqual([]);
    expect(repeats(aboutCopy.connect.links.map(({ href }) => href)), 'about links').toEqual([]);
    expect(repeats(socialLinks.map(({ name }) => name)), 'contact profiles').toEqual([]);
  });

  it('fills exactly one profile button on each page', () => {
    expect(aboutCopy.connect.links.filter(({ primary }) => primary)).toHaveLength(1);
    expect(socialLinks.filter(({ primary }) => primary)).toHaveLength(1);
  });

  it('links the closing call to action to a page on this site', () => {
    expect(contactCopy.closing.link.href).toMatch(/^\/[a-z]/);
  });
});
