import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import { workCopy } from '@/data/pages/work';
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
      const focusable = card.querySelectorAll(
        'a[href], button, input, select, textarea, summary, [contenteditable], [tabindex]:not([tabindex="-1"])',
      );
      expect([...focusable], slug).toEqual([link]);
      // The four corner brackets are the card's direct svg children, and decorative.
      const brackets = card.querySelectorAll(':scope > svg');
      expect(brackets, slug).toHaveLength(4);
      for (const bracket of brackets) expect(bracket).toHaveAttribute('aria-hidden', 'true');
      // The read-more row is a visual cue: the link already names the destination, and the text on
      // its own would be an instruction with nothing to activate.
      const readMore = within(card).getByText(workCopy.readMore, { exact: true });
      expect(readMore.closest('[aria-hidden="true"]'), slug).not.toBeNull();
    }
  });

  it('gives keyboard focus every affordance a pointer hover gets, and mouse focus none', () => {
    // A hover reveal with no focus twin leaves keyboard users without the card's affordance, which
    // the whole-card link used to give them for free. Every hover utility on the card has a twin
    // keyed on keyboard focus with the same effect: `group-has-[:focus-visible]:` for a
    // `group-hover:` inside the card, `has-[:focus-visible]:` for a `hover:` on the card itself.
    // The hover variant is found anywhere in a stacked chain (`lg:group-hover:`), and the twin keeps
    // the rest of the chain.
    //
    // Never focus-within: it also matches the focus a mouse click leaves on the link, so the card
    // would stay lit after a Cmd-click into a new tab (e2e/work-cards.spec.ts pins that in a
    // browser, which jsdom cannot, having no :focus-visible heuristic).
    const cardFor = renderCards();
    const missing: string[] = [];
    const focusWithin: string[] = [];
    for (const { slug } of caseStudies) {
      const { card } = cardFor(slug);
      const check = (element: Element, hover: string, focus: string) => {
        const classes = [...element.classList];
        for (const token of classes) {
          if (token.includes('focus-within')) focusWithin.push(`${slug}: ${token}`);
          // Where the hover variant starts: the whole token, or a segment after another variant.
          const at = token.startsWith(hover) ? 0 : token.indexOf(`:${hover}`) + 1;
          if (at === 0 && !token.startsWith(hover)) continue;
          const twin = token.slice(0, at) + focus + token.slice(at + hover.length);
          if (!classes.includes(twin)) missing.push(`${slug}: ${token} has no ${twin}`);
        }
      };
      check(card, 'hover:', 'has-[:focus-visible]:');
      for (const element of card.querySelectorAll('*')) {
        check(element, 'group-hover:', 'group-has-[:focus-visible]:');
      }
    }
    expect(missing).toEqual([]);
    expect(focusWithin).toEqual([]);
  });
});
