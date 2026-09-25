import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { caseStudies } from '@/data/case-studies';
import WorkPage from '../page';

describe('/work', () => {
  it('shows each study status on its card, pulsing only while the project runs', () => {
    render(<WorkPage />);
    const links = screen.getAllByRole('link');
    for (const { slug, highlight } of caseStudies) {
      const card = links.find((link) => link.getAttribute('href') === `/work/${slug}`);
      if (!card) throw new Error(`/work must have a card linking to ${slug}`);
      const status = within(card).getByText(highlight.status, { exact: true });
      const dot = status.previousElementSibling;
      if (highlight.status === 'RETIRED') {
        expect(status, slug).toHaveClass('text-[var(--muted)]');
        expect(dot, slug).not.toHaveClass('animate-pulse');
      } else {
        expect(status, slug).toHaveClass('text-[var(--status-ok)]');
        expect(dot, slug).toHaveClass('animate-pulse');
      }
    }
  });
});
