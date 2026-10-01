/**
 * @vitest-environment node
 *
 * `@/data/pages`, the list of static-route records the Markdown twins render (#59 AC 13), and the
 * handlers that serve them.
 *
 * Four things are pinned here. Every static route has a record at its own path, with a summary
 * and at least one section. The entries moved out of the `/about`, `/skills` and `/contact` page
 * modules all reach the twin: every timeline entry, belief and quick fact, every core skill,
 * differentiator and toolkit category, and every profile link. Every folder with a `page.tsx` has
 * its twin handler beside it, since `buildMetadata()` advertises a twin for every route that calls
 * it. And each handler is static and answers with exactly what the serialiser renders from its
 * record: the handlers are imported and called, so a handler that adds Markdown of its own, or
 * reads another route's record, fails on the body it serves.
 *
 * `e2e/markdown-twins.spec.ts` checks the served twins against the served pages; this file is the
 * fast half that names the record or the handler that went missing.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { pages } from '@/data/pages';
import { beliefs, facts, timeline } from '@/data/pages/about';
import { socialLinks } from '@/data/pages/contact';
import { coreSkills, differentiators, skillCategories } from '@/data/pages/skills';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { caseStudyToMarkdown, pageToMarkdown } from '@/lib/serialise';
import { visible } from '@/test/markdown';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = join(SRC, 'app');

/** A route's twin, as a reader sees it. */
const twin = (route: keyof typeof pages) => visible(pageToMarkdown(pages[route]));

const records = Object.entries(pages);

/** Every file under `dir`, as absolute paths. */
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

/** The handler file that serves a route's twin: `app/index.md/route.ts` for `/`. */
const handlerFile = (route: string) =>
  join(APP, ...route.split('/').filter(Boolean), 'index.md', 'route.ts');

interface StaticHandler {
  dynamic?: string;
  GET: () => Response | Promise<Response>;
}

interface CaseStudyHandler {
  dynamic?: string;
  dynamicParams?: boolean;
  generateStaticParams: () => { slug: string }[];
  GET: (request: Request, context: { params: Promise<{ slug: string }> }) => Promise<Response>;
}

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

  // The pages pass `record.summary` to `buildMetadata()` as their description; the e2e spec checks
  // the served meta description against the served twin.
  it.each(records)('%s opens its twin with its summary as the second block', (_, record) => {
    const [heading, summary] = visible(pageToMarkdown(record)).split(/\n{2,}/);
    expect(heading).toMatch(/^# \S/);
    expect(summary).toBe(record.summary);
  });
});

describe('the entries moved out of the page modules', () => {
  it('keeps every timeline entry, belief and quick fact in the /about twin', () => {
    for (const list of [timeline, beliefs, facts]) expect(list.length).toBeGreaterThan(0);
    const about = twin('/about');
    for (const { year, role, company, highlight, description } of timeline) {
      expect(about).toContain(`| ${year} | ${role} | ${company} | ${highlight} | ${description} |`);
    }
    for (const { title, description } of beliefs) {
      expect(about).toContain(`- **${title}**: ${description}`);
    }
    for (const { label, value } of facts) expect(about).toContain(`- **${label}**: ${value}`);
  });

  it('keeps every core skill, differentiator and toolkit category in the /skills twin', () => {
    for (const list of [coreSkills, differentiators, skillCategories]) {
      expect(list.length).toBeGreaterThan(0);
    }
    const skills = twin('/skills');
    for (const { name, years, level, context } of coreSkills) {
      expect(skills).toContain(
        `- **${name}**: ${years} years. Self-assessed proficiency: ${level}%. ${context}`,
      );
    }
    for (const { title, description } of differentiators) {
      expect(skills).toContain(`- **${title}**: ${description}`);
    }
    for (const { name, description, skills: list } of skillCategories) {
      expect(skills).toContain(`- **${name}**: ${description}: ${list.join(', ')}`);
    }
  });

  it('keeps every profile link in the /contact twin', () => {
    expect(socialLinks.length).toBeGreaterThan(0);
    const contact = twin('/contact');
    for (const { name, description, cta, href } of socialLinks) {
      expect(contact).toContain(`## ${name}\n\n${description}\n\n[${cta}](${href})`);
    }
  });

  // The whole list in one module is for server code: a client component that imported it would
  // carry every record, and the case studies the work record reads, into its chunk.
  it('is not imported whole by any client module', () => {
    const offenders = filesUnder(SRC)
      .filter((file) => /\.tsx?$/.test(file) && !file.includes(`${sep}__tests__${sep}`))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return (
          /^\s*['"]use client['"]/.test(source) &&
          /from\s+['"]@\/data\/pages(?:\/index)?['"]/.test(source)
        );
      })
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});

describe('the twin handlers', () => {
  // `buildMetadata()` advertises a twin for every route that calls it, so every page folder, the
  // dynamic ones included, needs a handler beside it or its head links a 404.
  it('sits beside every page.tsx', () => {
    const pageFolders = filesUnder(APP)
      .filter((file) => file.endsWith(`${sep}page.tsx`))
      .map((file) => dirname(file));
    expect(pageFolders.length).toBeGreaterThan(0);
    const missing = pageFolders
      .filter((folder) => !existsSync(join(folder, 'index.md', 'route.ts')))
      .map((folder) => relative(APP, folder) || '(root)');
    expect(missing, 'each needs an index.md/route.ts').toEqual([]);
  });

  it.each(records.map(([route]) => [route]))(
    '%s has one, static, that serves exactly its record as Markdown',
    async (route) => {
      const handler = (await import(handlerFile(route))) as StaticHandler;
      expect(handler.dynamic).toBe('force-static');
      const response = await handler.GET();
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(await response.text()).toBe(pageToMarkdown(pages[route as keyof typeof pages]));
    },
  );

  it('serves every case study, and only those, from one static handler', async () => {
    const handler = (await import(handlerFile('/work/[slug]'))) as CaseStudyHandler;
    expect(handler.dynamic).toBe('force-static');
    // An unknown slug is a routing-level 404, as the page's is (ADR 0015).
    expect(handler.dynamicParams).toBe(false);
    expect(handler.generateStaticParams()).toEqual(caseStudies.map(({ slug }) => ({ slug })));

    for (const study of caseStudies) {
      const response = await handler.GET(new Request('http://localhost/'), {
        params: Promise.resolve({ slug: study.slug }),
      });
      expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
      expect(await response.text(), study.slug).toBe(caseStudyToMarkdown(study));
    }
  });

  it('names the slug when asked for a study it does not have', async () => {
    const handler = (await import(handlerFile('/work/[slug]'))) as CaseStudyHandler;
    await expect(
      handler.GET(new Request('http://localhost/'), {
        params: Promise.resolve({ slug: 'no-such-study' }),
      }),
    ).rejects.toThrow('"no-such-study"');
  });
});
