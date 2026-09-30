import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import WorkPage from '../page';

/**
 * Each card's link holds only the title (the stretched title-link pattern in
 * `components/card-link.ts`), so everything else on the card is found through the card itself: the
 * `group` element the hover and focus variants key off, which is the link's nearest `.group`
 * ancestor.
 */
function renderCards() {
  render(<WorkPage />);
  const links = screen.getAllByRole('link');
  return (slug: string) => {
    const link = links.find((candidate) => candidate.getAttribute('href') === `/work/${slug}`);
    if (!link) throw new Error(`/work must have a card linking to ${slug}`);
    const card = link.closest<HTMLElement>('.group');
    if (!card) throw new Error(`the ${slug} link must sit inside its card`);
    return { link, card };
  };
}

describe('/work', () => {
  it('shows each study status on its card, pulsing only while the project runs', () => {
    const cardFor = renderCards();
    for (const { slug, highlight } of caseStudies) {
      const { card } = cardFor(slug);
      const status = within(card).getByText(highlight.status, { exact: true });
      const dot = status.previousElementSibling;
      expect(dot, slug).toHaveAttribute('aria-hidden', 'true');
      if (highlight.status === 'RETIRED') {
        expect(status, slug).toHaveClass('text-[var(--muted)]');
        expect(dot, slug).not.toHaveClass('animate-pulse');
      } else {
        expect(status, slug).toHaveClass('text-[var(--status-ok)]');
        expect(dot, slug).toHaveClass('animate-pulse');
      }
    }
  });

  it('names each card link by its title alone, with the description attached', () => {
    // WCAG 2.5.3 (Label in Name), and the fix for a link whose name used to be the whole card: the
    // card is one click target through the link's ::after overlay, so the link holds only the title.
    render(<WorkPage />);
    for (const { slug, title, description } of caseStudies) {
      const link = screen.getByRole('link', { name: title });
      expect(link).toHaveAttribute('href', `/work/${slug}`);
      expect(link).toHaveAccessibleName(title);
      expect(link.textContent).toBe(title);
      expect(link).not.toHaveAttribute('aria-labelledby');
      expect(link).not.toHaveAttribute('aria-label');
      expect(link).toHaveAccessibleDescription(description);
    }
  });

  it('keeps every other element of a card out of the link and its decoration out of the tree', () => {
    const cardFor = renderCards();
    for (const { slug } of caseStudies) {
      const { link, card } = cardFor(slug);
      // The card holds no other interactive element: the overlay covers it, so a second one could
      // not be reached by pointer.
      expect(within(card).getAllByRole('link'), slug).toEqual([link]);
      // The four corner brackets are the card's direct svg children, and decorative.
      const brackets = card.querySelectorAll(':scope > svg');
      expect(brackets, slug).toHaveLength(4);
      for (const bracket of brackets) expect(bracket).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('gives keyboard focus every affordance a pointer hover gets', () => {
    // A hover reveal with no focus twin leaves keyboard users without the card's affordance, which
    // the whole-card link used to give them for free. Every `group-hover:` utility on the card has
    // a `group-focus-within:` twin with the same effect, and every `hover:` on the card element
    // itself a `focus-within:` twin.
    const cardFor = renderCards();
    const missing: string[] = [];
    for (const { slug } of caseStudies) {
      const { card } = cardFor(slug);
      const check = (element: Element, hover: string, focus: string) => {
        const classes = [...element.classList];
        for (const token of classes.filter((name) => name.startsWith(hover))) {
          const twin = focus + token.slice(hover.length);
          if (!classes.includes(twin)) missing.push(`${slug}: ${token} has no ${twin}`);
        }
      };
      check(card, 'hover:', 'focus-within:');
      for (const element of card.querySelectorAll('*')) {
        check(element, 'group-hover:', 'group-focus-within:');
      }
    }
    expect(missing).toEqual([]);
  });
});
