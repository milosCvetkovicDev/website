/**
 * @vitest-environment node
 *
 * The /skills, /work, /blog and /privacy records (#59): what the pages map over and what their
 * Markdown twins will read. The pages' markup is pinned by the e2e gates; this file pins what the
 * data must hold for both readers to say the same thing: each record serialises, names its own
 * route, and keeps the values the page renders inside the range the page can show.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { linkKind } from '@/lib/links';
import { pageToMarkdown } from '@/lib/serialise';
import { blogRecord } from '../blog';
import { COLLECTED, privacyCopy, privacyRecord } from '../privacy';
import { coreSkills, skillCategories, skillsCopy, skillsRecord } from '../skills';
import type { InlineLink } from '../types';
import { workCopy, workRecord } from '../work';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../../../app');

const records = [
  ['/skills', skillsRecord],
  ['/work', workRecord],
  ['/blog', blogRecord],
  ['/privacy', privacyRecord],
] as const;

/** The paragraphs of a Markdown document, each as one line of text. */
function blocksOf(markdown: string): string[] {
  return markdown.split(/\n{2,}/).map((block) => block.trim());
}

describe.each(records)('the %s record', (route, record) => {
  it('names the route it is rendered by', () => {
    expect(record.path).toBe(route);
    expect(existsSync(join(APP, route, 'page.tsx'))).toBe(true);
  });

  it('serialises without a gap', () => {
    expect(() => pageToMarkdown(record)).not.toThrow();
  });

  it('gives each section a heading of its own', () => {
    const headings = record.sections.map(({ heading }) => heading);
    expect(new Set(headings).size).toBe(headings.length);
  });
});

describe('the /privacy twin', () => {
  it('reads the collected items as one sentence after the lead-in, in the page order', () => {
    const markdown = pageToMarkdown(privacyRecord);
    const blocks = blocksOf(markdown);

    // No item stands alone as a lowercase fragment of a paragraph.
    for (const item of COLLECTED) expect(blocks).not.toContain(item);

    const sentence = blocks.find((block) => block.startsWith(privacyCopy.statistics.lead));
    expect(sentence).toBe(`${privacyCopy.statistics.lead} ${COLLECTED.join('; ')}.`);
  });

  it('keys each note by a heading no other note uses', () => {
    const headings = privacyCopy.notes.map(({ heading }) => heading);
    expect(new Set(headings).size).toBe(headings.length);
  });
});

describe('the /work record', () => {
  it('names each study in the text of its link, so no two links read alike', () => {
    const links = workRecord.sections.flatMap((section) =>
      section.kind === 'prose'
        ? section.paragraphs.flatMap((paragraph) =>
            typeof paragraph === 'string'
              ? []
              : paragraph.filter((piece): piece is InlineLink => typeof piece !== 'string'),
          )
        : [],
    );
    const studyLinks = links.filter(({ href }) => href.startsWith('/work/'));

    expect(studyLinks.map(({ href }) => href)).toEqual(
      caseStudies.map(({ slug }) => `/work/${slug}`),
    );
    caseStudies.forEach(({ title }, index) => {
      expect(studyLinks[index].text).toBe(`${workCopy.readMore}: ${title}`);
    });
  });

  it('keys the stats bar by labels no other figure uses', () => {
    const labels = workCopy.stats.map(({ label }) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('points the external CTA at an external URL', () => {
    expect(linkKind(workCopy.cta.link.href)).toBe('external');
  });
});

describe('the /skills record', () => {
  // The bar's width, its aria-valuenow (min 0, max 100) and the twin's "Self-assessed proficiency:
  // N%" all read `level`, and the badge and the twin both print `${years} years`.
  it('names each core skill once, since the page keys its bars by name', () => {
    const names = coreSkills.map(({ name }) => name);
    expect(names.filter((name, at) => names.indexOf(name) !== at)).toEqual([]);
  });

  it.each(coreSkills.map((skill) => [skill.name, skill] as const))(
    '%s has a level the bar can show and years the badge can print',
    (_, { level, years }) => {
      expect(Number.isInteger(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(100);
      expect(years).toMatch(/^\d+\+$/);
    },
  );

  // The twin joins a category's skills with commas, as its chips would read aloud.
  it.each(skillCategories.map((category) => [category.name, category] as const))(
    '%s lists skills the twin can join with commas',
    (_, { skills }) => {
      expect(skills.length).toBeGreaterThan(0);
      for (const skill of skills) {
        expect(skill.trim()).not.toBe('');
        expect(skill).not.toContain(',');
      }
      expect(new Set(skills).size).toBe(skills.length);
    },
  );

  it('points the CTA buttons at the kind of link each renders as', () => {
    expect(linkKind(skillsCopy.cta.work.href)).toBe('site');
    expect(linkKind(skillsCopy.cta.linkedIn.href)).toBe('external');
  });
});
