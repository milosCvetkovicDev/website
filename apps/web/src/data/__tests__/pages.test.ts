/**
 * @vitest-environment node
 *
 * `@/data/pages`, the list of static-route records the Markdown twins render (#59 AC 13), and the
 * handlers that serve them.
 *
 * Four things are pinned here. Every static route has a record at its own path, with a title, a
 * heading, a summary and at least one section. The entries moved out of the `/about`, `/skills`
 * and `/contact` page modules all reach the twin: every timeline entry, belief and quick fact,
 * every core skill, differentiator and toolkit category, and every profile link. Every folder with
 * a `page.tsx` has its twin handler beside it, since `buildMetadata()` advertises a twin for every
 * route that calls it. And each handler is static and answers with exactly what the serialiser
 * renders from its record: the handlers are imported and called, so a handler that adds Markdown
 * of its own, or reads another route's record, fails on the body it serves.
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
import { publishedPosts } from '@/data/posts';
import { aboutCopy, beliefs, credentials, facts, shownFacts, timeline } from '@/data/pages/about';
import { OWNER_TODO, unfilledOwnerFields } from '@/data/owner-todo';
import { asSentence } from '@/data/pages/table';
import { socialLinks } from '@/data/pages/contact';
import { coreSkills, differentiators, skillCategories } from '@/data/pages/skills';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { blogToMarkdown, caseStudyToMarkdown, pageToMarkdown } from '@/lib/serialise';
import { visible } from '@/test/markdown';
import { isOnlyEmoji, pictographsIn } from '@/test/pictographs';

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

  // The twin reads the heading, not the title, so its refusal of a blank one no longer covers the
  // title the page hands `buildMetadata()`: this does (#58).
  it.each(records)('%s has a title, a heading, a summary and a section', (_route, record) => {
    const title = typeof record.title === 'string' ? record.title : record.title.absolute;
    expect(title.trim()).not.toBe('');
    expect(record.heading.trim()).not.toBe('');
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
    // The timeline and the quick facts are tables on the page (#58), with the same columns here;
    // the timeline's last cell leads with the highlight, ended as a sentence, as the page sets it.
    // Each table named by its caption, as the page's <caption> names it: the timeline's sits under
    // a heading that says something else, the quick facts' heading already says it.
    expect(about).toContain(
      `## ${aboutCopy.timelineHeading}\n\nTable: Career timeline\n\n| Year | Role | Company | What changed |`,
    );
    expect(about).toContain(`## Quick facts\n\n| Fact | Figure | Basis |`);
    for (const { year, role, company, highlight, description } of timeline) {
      expect(about).toContain(
        `| ${year} | ${role} | ${company} | ${asSentence(highlight)} ${description} |`,
      );
    }
    for (const { title, description } of beliefs) {
      expect(about).toContain(`- **${title}**: ${description}`);
    }
    expect(about).toContain('| Fact | Figure | Basis |');
    // Each fact with its basis (#58), less any whose basis is still the owner's placeholder: the
    // page leaves that row out, and so does the twin.
    expect(shownFacts.length).toBeGreaterThan(0);
    for (const { label, value, basis } of shownFacts) {
      expect(about).toContain(`| ${label} | ${value} | ${basis} |`);
    }
    for (const fact of facts.filter((entry) => !shownFacts.includes(entry))) {
      expect(about).not.toContain(fact.label);
    }
    // The basis of the years counts "from the first role in the timeline below": the quick facts
    // come before the timeline here, as on the page (`about-contact-pages.test.tsx`).
    expect(about.indexOf('## Quick facts')).toBeGreaterThan(-1);
    expect(about.indexOf('## Quick facts')).toBeLessThan(about.indexOf('Table: Career timeline'));
  });

  it("leaves out exactly the quick facts whose basis is the owner's placeholder, and no other", () => {
    // shownFacts' rule, pinned rather than restated: hidden are the facts with a marker in their
    // basis, each with a register row (owner-todo.test.ts), and every shown fact states a basis
    // with a letter or digit in it and holds no marker in its label, figure or basis.
    const hidden = facts.filter((fact) => !shownFacts.includes(fact));
    expect(hidden).toEqual(facts.filter(({ basis }) => basis.includes(OWNER_TODO)));
    const rows = unfilledOwnerFields.filter(({ field }) => field.startsWith('about.facts.'));
    expect(hidden.length, 'one hidden fact per register row').toBe(rows.length);
    expect(shownFacts.length).toBeGreaterThan(0);
    for (const { label, value, basis } of shownFacts) {
      expect(basis, label).toMatch(/[\p{L}\p{N}]/u);
      expect(`${label} ${value} ${basis}`, label).not.toContain(OWNER_TODO);
    }
    for (const { label, value } of hidden) {
      expect(`${label} ${value}`, `${label}: only its basis waits for the owner`).not.toContain(
        OWNER_TODO,
      );
    }
  });

  it("names, in each quick fact's register row, the figure and label of the fact the row points at", () => {
    // The gate keys a row by the fact's index, so an inserted or reordered fact would leave a row
    // whose text describes another fact. Its figure and label in the row's text pin it, as each
    // metric definition's row is pinned in case-studies.test.ts.
    const rows = unfilledOwnerFields.filter(({ field }) => field.startsWith('about.facts.'));
    for (const { field, why } of rows) {
      const index = /^about\.facts\.(\d+)\.basis#/.exec(field)?.[1];
      const fact = index === undefined ? undefined : facts[Number(index)];
      expect(fact, `${field} points at no fact's basis`).toBeDefined();
      if (!fact) continue;
      expect(fact.basis, field).toContain(OWNER_TODO);
      expect(why, `${field} (${fact.label})`).toContain(
        `${fact.value} ${fact.label.toLowerCase()}`,
      );
    }
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
    // The toolkit is a table on the page (#58), with the same columns here, its icon left out.
    expect(skills).toContain('Table: Skills by category\n\n| Category | What it covers | Skills |');
    for (const { name, description, skills: list } of skillCategories) {
      expect(skills).toContain(`| ${name} | ${description} | ${list.join(', ')} |`);
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
      // `/blog`'s twin lists the published posts once there are any, as its page does.
      const expected =
        route === '/blog'
          ? blogToMarkdown(pages['/blog'], publishedPosts)
          : pageToMarkdown(pages[route as keyof typeof pages]);
      expect(await response.text()).toBe(expected);
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

// `/about` and `/skills` draw each belief's, credential's and toolkit category's emoji in an
// `aria-hidden` span, and the twins leave the `icon` field out (#46, pages-20). Both rest on the
// emoji staying in that field: one put inside a title or a description would be read aloud on the
// page and written into the twin. `e2e/pages.spec.ts` checks the served pages.
describe('the decorative icons', () => {
  const iconed = [
    ...beliefs.map(({ icon, title, description }) => ({ icon, texts: [title, description] })),
    ...credentials.map(({ icon, text }) => ({ icon, texts: [text] })),
    ...skillCategories.map(({ icon, name, description, skills }) => ({
      icon,
      texts: [name, description, ...skills],
    })),
  ];

  it('keeps each icon one emoji, in a field of its own', () => {
    expect(iconed.length).toBeGreaterThan(0);
    for (const { icon, texts } of iconed) {
      expect(isOnlyEmoji(icon), `the icon beside "${texts[0]}" is ${JSON.stringify(icon)}`).toBe(
        true,
      );
    }
  });

  it('keeps every emoji out of the text beside the icons and of the core skills', () => {
    const texts = [
      ...iconed.flatMap(({ texts }) => texts),
      ...coreSkills.flatMap(({ name, years, context }) => [name, years, context]),
    ];
    for (const text of texts) expect(pictographsIn(text), text).toEqual([]);
  });

  it.each(records)('leaves every emoji out of the %s twin', (_route, record) => {
    expect(pictographsIn(pageToMarkdown(record))).toEqual([]);
  });
});

// The bar is a `meter` from 0 to 100 whose fill is `level`% wide: a level outside that range, or
// not a whole number, is an invalid meter and a fill wider than its track.
it('gives every core skill a whole-number level from 0 to 100', () => {
  expect(coreSkills.length).toBeGreaterThan(0);
  for (const { name, level } of coreSkills) {
    expect(Number.isInteger(level) && level >= 0 && level <= 100, `${name}: ${level}`).toBe(true);
  }
});
