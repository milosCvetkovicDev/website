import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AboutPage from '../about/page';
import ContactPage from '../contact/page';
import {
  aboutCopy,
  beliefs,
  credentials,
  facts,
  questions,
  shownFacts,
  timeline,
  type StoryParagraph,
} from '@/data/pages/about';
import { contactCopy, socialLinks } from '@/data/pages/contact';
import { asSentence } from '@/data/pages/table';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';
import { formatContentDate } from '@/lib/content-date';

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
      ...questions.flatMap(({ question, answer }) => [question, answer]),
      ...timeline.flatMap(({ year, role, company, highlight, description }) => [
        year,
        role,
        company,
        // The timeline's last cell leads with the highlight, ended as a sentence (#58).
        asSentence(highlight),
        description,
      ]),
      ...beliefs.flatMap(({ title, description, icon }) => [title, description, icon]),
      ...shownFacts.flatMap(({ label, value, basis }) => [label, value, basis]),
      ...credentials.map(({ icon, text }) => `${icon} ${text}`),
    ]) {
      expect(main, `/about must render "${text}"`).toContain(text);
    }

    // A quick fact whose basis the owner has not supplied yet is left out whole, label and figure
    // with it, rather than shown without its basis (#58). Which facts those are is pinned in
    // data/__tests__/pages.test.ts, against the marker and the register.
    const hidden = facts.filter((fact) => !shownFacts.includes(fact));
    for (const { label } of hidden) {
      expect(main, `/about must not render "${label}" before its basis is filled`).not.toContain(
        label,
      );
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

  it('answers each question in the paragraph after its h2, and heads the facts with their own h2', () => {
    // #58: a question-shaped h2 whose next element is the whole answer is the unit an extractor
    // lifts, and the facts grid after the questions needs a heading of its own, or the outline
    // files it under the last question.
    const { container } = render(<AboutPage />);
    const headings = Array.from(container.querySelectorAll('h2'));
    const asked = headings.filter((heading) => heading.textContent?.endsWith('?'));
    expect(asked.map((heading) => heading.textContent)).toEqual(
      questions.map(({ question }) => question),
    );
    asked.forEach((heading, index) => {
      const next = heading.nextElementSibling;
      expect(next?.tagName, `${heading.textContent} is followed by a paragraph`).toBe('P');
      expect(next?.textContent).toBe(questions[index].answer);
    });

    const factsHeading = headings.find((heading) => heading.textContent === aboutCopy.factsHeading);
    expect(factsHeading, 'the facts grid has an h2').toBeDefined();
    const lastQuestion = asked.at(-1);
    if (!factsHeading || !lastQuestion) throw new Error('both headings must render');
    expect(
      lastQuestion.compareDocumentPosition(factsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the facts heading comes after the last question',
    ).toBeTruthy();
    for (const { value, basis } of shownFacts) {
      expect(factsHeading.nextElementSibling?.textContent).toContain(value);
      expect(factsHeading.nextElementSibling?.textContent).toContain(basis);
    }
    // The years' basis counts "from the first role in the timeline below": the timeline follows.
    const timelineHeading = headings.find(
      (heading) => heading.textContent === aboutCopy.timelineHeading,
    );
    if (!timelineHeading) throw new Error('the timeline has an h2');
    expect(
      factsHeading.compareDocumentPosition(timelineHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the timeline comes after the quick facts',
    ).toBeTruthy();
  });

  it('writes its "Last updated" day as the case studies write theirs, the stored day in dateTime (#57)', () => {
    render(<AboutPage />);
    const updated = STATIC_ROUTE_UPDATED['/about'];
    const line = screen.getByText((_, element) =>
      Boolean(element?.matches('p') && element.textContent?.startsWith('Last updated')),
    );
    const time = line.querySelector('time');
    expect(time, 'the "Last updated" line dates itself with a <time>').not.toBeNull();
    expect(time?.textContent).toBe(formatContentDate(updated));
    // Spelled out here rather than read from the month table, so the two cannot share a mistake.
    expect(time?.textContent).toMatch(
      /^\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/,
    );
    expect(time).toHaveAttribute('dateTime', updated);
    expect(line.textContent).toBe(`Last updated ${time?.textContent}.`);
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

  it('names the person and exactly the profiles the page links in its h1 (#58)', () => {
    render(<ContactPage />);
    const heading = screen.getByRole('heading', { level: 1 }).textContent ?? '';
    expect(heading).toContain('Milos Cvetkovic');
    // The h1 lists the channels as "on A, B or C", by the name before any " / " (`X / Twitter` is
    // X), so a profile added to or dropped from `socialLinks` fails here until the line follows.
    const [, channels = ''] = heading.split(' on ');
    expect(channels.split(/, | or /)).toEqual(socialLinks.map(({ name }) => name.split(' / ')[0]));
  });
});
