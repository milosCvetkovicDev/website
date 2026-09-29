/**
 * @vitest-environment node
 *
 * `@/data/pages`, the list of static-route records the Markdown twins render (#59 AC 13), and the
 * handlers that serve them.
 *
 * Three things are pinned here. Every static route has a record at its own path, with a summary
 * and at least one section. The entries moved out of the `/about`, `/skills` and `/contact` page
 * modules are all still there and all reach the twin: the four timeline entries, the three beliefs,
 * the four quick facts, every core skill and toolkit category, the three differentiators and the
 * three profile links. And each twin handler is the three-line shape the rule describes: static,
 * reading its record from this list and handing it to the serialiser, with no Markdown of its own.
 *
 * `e2e/markdown-twins.spec.ts` checks the served twins against the served pages; this file is the
 * fast half that names the record or the handler that went missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pages } from '@/data/pages';
import { beliefs, facts, timeline } from '@/data/pages/about';
import { socialLinks } from '@/data/pages/contact';
import { coreSkills, differentiators, skillCategories } from '@/data/pages/skills';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { pageToMarkdown } from '@/lib/serialise';

const APP = join(dirname(fileURLToPath(import.meta.url)), '../../app');

/** The text a Markdown reader sees: CommonMark drops the backslash before ASCII punctuation. */
const visible = (markdown: string) => markdown.replace(/\\([!-/:-@[-`{-~])/g, '$1');

/** A route's twin, as a reader sees it. */
const twin = (route: keyof typeof pages) => visible(pageToMarkdown(pages[route]));

const records = Object.entries(pages);

/** The handler file that serves a route's twin: `app/index.md/route.ts` for `/`. */
const handlerFile = (route: string) =>
  join(APP, ...route.split('/').filter(Boolean), 'index.md', 'route.ts');

/** A source file without its comments, so a quote in a comment cannot read as a string. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Every string and template literal in `source`'s code. */
const literals = (source: string) =>
  [...code(source).matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(([whole]) => whole);

// Markdown a handler could only be writing itself: a heading, emphasis, a link, a table cell, a list
// item or a line break. Every string the twin handlers hold is an import, a route or a config value.
const MARKDOWN = /#|\*\*|\]\(|\s\|\s|\\n|^['"`]\s*[-+*]\s/;

describe('the page records', () => {
  it('has one record for every static route, each at its own path', () => {
    expect(Object.keys(pages).sort()).toEqual(Object.keys(STATIC_ROUTE_UPDATED).sort());
    for (const [route, record] of records) expect(record.path, route).toBe(route);
  });

  it.each(records)('%s has a summary and at least one section', (_route, record) => {
    expect(record.summary.trim()).not.toBe('');
    expect(record.sections.length).toBeGreaterThan(0);
    for (const section of record.sections) expect(section.heading.trim()).not.toBe('');
  });

  it.each(records)(
    '%s opens its twin with the summary its page describes itself by',
    (_, record) => {
      // The second block of every twin is the summary paragraph, the page's meta description.
      expect(visible(pageToMarkdown(record)).split('\n\n')[1]).toBe(record.summary);
    },
  );
});

describe('the entries moved out of the page modules', () => {
  it('keeps the four timeline entries, three beliefs and four quick facts in the /about twin', () => {
    expect(timeline).toHaveLength(4);
    expect(beliefs).toHaveLength(3);
    expect(facts).toHaveLength(4);
    const about = twin('/about');
    for (const { year, role, company, highlight, description } of timeline) {
      expect(about).toContain(`| ${year} | ${role} | ${company} | ${highlight} | ${description} |`);
    }
    for (const { title, description } of beliefs) {
      expect(about).toContain(`- **${title}**: ${description}`);
    }
    for (const { label, value } of facts) expect(about).toContain(`- **${label}**: ${value}`);
  });

  it('keeps every core skill, the three differentiators and every toolkit category in /skills', () => {
    expect(differentiators).toHaveLength(3);
    expect(coreSkills.length).toBeGreaterThan(0);
    expect(skillCategories.length).toBeGreaterThan(0);
    const skills = twin('/skills');
    for (const { name, years, level, context } of coreSkills) {
      expect(skills).toContain(`- **${name}**: ${years} years. Proficiency: ${level}%. ${context}`);
    }
    for (const { title, description } of differentiators) {
      expect(skills).toContain(`- **${title}**: ${description}`);
    }
    for (const { name, description, skills: list } of skillCategories) {
      expect(skills).toContain(`- **${name}**: ${description}: ${list.join(', ')}`);
    }
  });

  it('keeps the three profile links in the /contact twin', () => {
    expect(socialLinks).toHaveLength(3);
    const contact = twin('/contact');
    for (const { name, description, cta, href } of socialLinks) {
      expect(contact).toContain(`## ${name}\n\n${description}\n\n[${cta}](${href})`);
    }
  });
});

describe('the twin handlers', () => {
  it.each(records.map(([route]) => [route]))(
    '%s has one, static, that renders its record',
    (route) => {
      const file = handlerFile(route);
      expect(existsSync(file), `${route} needs its twin at app/${relative(APP, file)}`).toBe(true);
      const source = readFileSync(file, 'utf8');
      expect(source).toContain("export const dynamic = 'force-static';");
      expect(code(source)).toContain(`markdownResponse(pageToMarkdown(pages['${route}']))`);
    },
  );

  it('serves every case study from one static handler that 404s any other slug', () => {
    const source = readFileSync(join(APP, 'work', '[slug]', 'index.md', 'route.ts'), 'utf8');
    expect(source).toContain("export const dynamic = 'force-static';");
    expect(source).toContain('export const dynamicParams = false;');
    expect(source).toContain('caseStudies.map(({ slug }) => ({ slug }))');
    expect(code(source)).toContain('markdownResponse(caseStudyToMarkdown(study))');
  });

  it.each(
    [...records.map(([route]) => handlerFile(route)), handlerFile('/work/[slug]')].map((file) => [
      relative(APP, file),
      file,
    ]),
  )('app/%s writes no Markdown of its own', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    expect(literals(source).filter((literal) => MARKDOWN.test(literal))).toEqual([]);
    // Every body goes through the serialiser: a handler never hands the response a string.
    for (const [, argument] of code(source).matchAll(/markdownResponse\(\s*(\w+)\(/g)) {
      expect(['pageToMarkdown', 'caseStudyToMarkdown']).toContain(argument);
    }
    expect(code(source).match(/markdownResponse\(/g) ?? []).toHaveLength(1);
  });
});
