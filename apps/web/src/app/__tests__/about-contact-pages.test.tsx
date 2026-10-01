import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutPage from '../about/page';
import ContactPage from '../contact/page';
import {
  aboutCopy,
  beliefs,
  credentials,
  facts,
  timeline,
  type StoryParagraph,
} from '@/data/pages/about';
import { RUN_IN_TERMINAL, connectorSnippets } from '@/data/mcp-server';
import { contactCopy, socialLinks } from '@/data/pages/contact';

/**
 * `/about` and `/contact` map over their page records (#59), so a page and its Markdown twin read
 * one source. These tests pin the page half of that promise: every string the record holds for the
 * page reaches it, the story's emphasis renders as `strong` and `em`, and the lists render without
 * React complaining. The twin half is `src/data/pages/__tests__/records.test.ts`; the served markup
 * and its console are the e2e gates'.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@/data/pages/about');
  vi.resetModules();
});

/** A story paragraph as the text it reads as, which is what `textContent` gives back. */
const readAs = (paragraph: StoryParagraph) =>
  typeof paragraph === 'string'
    ? paragraph
    : paragraph.map((run) => (typeof run === 'string' ? run : run.text)).join('');

describe('/about', () => {
  it('renders every string of its record, with the story emphasis the record marks', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<AboutPage />);
    const main = container.textContent ?? '';

    for (const text of [
      aboutCopy.eyebrow,
      aboutCopy.lede,
      aboutCopy.storyClose,
      aboutCopy.timelineHeading,
      aboutCopy.beliefsHeading,
      aboutCopy.credentialsHeading,
      aboutCopy.connect.heading,
      aboutCopy.connect.text,
      ...aboutCopy.story.map(readAs),
      ...timeline.flatMap(({ year, role, company, highlight, description }) => [
        year,
        role,
        company,
        `"${highlight}"`,
        description,
      ]),
      ...beliefs.flatMap(({ title, description, icon }) => [title, description, icon]),
      ...facts.flatMap(({ label, value }) => [label, value]),
      ...credentials.map(({ icon, text }) => `${icon} ${text}`),
    ]) {
      expect(main, `/about must render "${text}"`).toContain(text);
    }

    // Each emphasised run of the story is its own element, of the kind the record names.
    const runs = aboutCopy.story.flatMap((paragraph) =>
      typeof paragraph === 'string' ? [] : paragraph.filter((run) => typeof run !== 'string'),
    );
    expect(runs, 'the story must mark some emphasis for this test to check').not.toHaveLength(0);
    for (const run of runs) {
      expect(screen.getByText(run.text).tagName, run.text).toBe(run.emphasis.toUpperCase());
    }

    // The call to action: one link per profile, in record order, the primary one filled.
    const cta = screen.getByRole('heading', { name: aboutCopy.connect.heading }).parentElement;
    if (!cta) throw new Error('the connect heading must sit in its section');
    const links = within(cta).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      aboutCopy.connect.links.map(({ name, href }) => [name, href]),
    );
    links.forEach((link, index) => {
      expect(link.classList.contains('bg-[var(--accent)]'), link.textContent ?? '').toBe(
        aboutCopy.connect.links[index].primary,
      );
    });

    expect(errors, 'rendering /about must not log an error').not.toHaveBeenCalled();
  });

  it('renders two emphasised runs with the same text in one paragraph without a key clash', async () => {
    // A paragraph may repeat an emphasised word ("never ... never"); the runs are keyed by their
    // place, so the repeat is neither dropped nor reported as a duplicate key.
    const actual = await vi.importActual<typeof import('@/data/pages/about')>('@/data/pages/about');
    vi.doMock('@/data/pages/about', () => ({
      ...actual,
      aboutCopy: {
        ...actual.aboutCopy,
        story: [
          [
            { text: 'never', emphasis: 'strong' },
            ' guess, ',
            { text: 'never', emphasis: 'strong' },
            ' assume.',
          ],
        ],
      },
    }));
    const { default: Page } = await import('../about/page');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(<Page />);

    expect(errors, 'a repeated run must not produce a React key warning').not.toHaveBeenCalled();
    const strong = Array.from(container.querySelectorAll('strong'), (node) => node.textContent);
    expect(strong).toEqual(['never', 'never']);
    expect(container.textContent).toContain('never guess, never assume.');
  });
});

describe('/contact', () => {
  it('renders every string of its record, one card per profile', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<ContactPage />);
    const main = container.textContent ?? '';

    for (const text of [
      contactCopy.eyebrow,
      contactCopy.intro,
      contactCopy.closing.lead,
      contactCopy.closing.text,
      contactCopy.closing.link.text,
      contactCopy.agents.heading,
      contactCopy.agents.intro,
      contactCopy.agents.endpoint,
      contactCopy.agents.paste,
    ]) {
      expect(main, `/contact must render "${text}"`).toContain(text);
    }

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      ...socialLinks.map(({ href }) => href),
      contactCopy.closing.link.href,
    ]);
    socialLinks.forEach(({ name, description, cta }, index) => {
      const card = within(links[index]);
      expect(card.getByRole('heading', { level: 2 }).textContent).toBe(name);
      expect(card.getByText(description)).toBeInTheDocument();
      expect(card.getByText(cta)).toBeInTheDocument();
      // Every profile has its mark, keyed by name.
      expect(links[index].querySelector('svg'), name).not.toBeNull();
    });

    expect(errors, 'rendering /contact must not log an error').not.toHaveBeenCalled();
  });

  // #62: the snippets are text to copy, so each is a plain `pre` holding exactly what
  // `data/mcp-server.ts` renders. It scrolls sideways on a phone, so the keyboard has to reach it,
  // and a focusable element needs a role and a name: its caption, which starts with the client.
  it('renders each connector snippet as a named region the keyboard can reach', () => {
    render(<ContactPage />);
    const heading = screen.getByRole('heading', { level: 2, name: contactCopy.agents.heading });
    const section = heading.closest('section');
    expect(section, 'the heading opens its own section').not.toBeNull();

    // The endpoint is code, not the end of a sentence: nothing after it for a selection to take.
    const endpoint = within(section!).getByText(contactCopy.agents.endpoint);
    expect(endpoint.tagName).toBe('CODE');
    expect(endpoint.nextSibling).toBeNull();

    const regions = within(section!).getAllByRole('region');
    expect(regions).toHaveLength(connectorSnippets.length);
    const ids = new Set<string | null>();
    connectorSnippets.forEach(({ client, files, code }, index) => {
      const region = regions[index];
      expect(region.tagName, client).toBe('PRE');
      expect(region, client).toHaveAttribute('tabindex', '0');
      ids.add(region.getAttribute('aria-labelledby'));
      // The caption, read without its decorative separator.
      const where = files.length > 0 ? files.join(' or ') : RUN_IN_TERMINAL;
      expect(region, client).toHaveAccessibleName(`${client} ${where}`);
      expect(region.textContent, client).toBe(code);
    });
    expect(ids.size, 'each region is named by its own caption').toBe(connectorSnippets.length);
  });
});
