import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMetric, getCaseStudy, type CaseStudy } from '@/data/case-studies';
import AboutPage from '../page';

/**
 * The figures `/about` quotes, as the page renders them (#49, pages-3). The page and its record
 * (`data/pages/about.ts`) may state no case-study figure of their own: the self-healing agent's
 * comes from its study through `formatMetric()` and the study's label, and the 2021 entry's `40%`,
 * which no study established, is gone. `single-source-metrics.test.ts` (R33) reads the same two
 * modules as source; this file renders them, so a figure assembled from pieces, which a source
 * scan cannot see, is caught too.
 */
afterEach(() => {
  vi.doUnmock('@/data/case-studies');
  vi.resetModules();
});

const AGENT = 'self-healing-agent';

function agentMetric(study: CaseStudy | undefined = getCaseStudy(AGENT)) {
  if (!study) throw new Error(`/about quotes the "${AGENT}" case study`);
  return study.highlight.metric;
}

/**
 * The 2025 timeline entry's "What changed" cell (#58): its row is headed by the year, and the cell,
 * the row's last, leads with the highlight on a line of its own, then the description. Each step
 * is checked, so a markup change fails here by name instead of reading some other cell. The whole
 * cell is returned: the lead states no figure either, so the checks below hold for both.
 */
function agentEntryText(): string {
  const year = screen.getByRole('rowheader', { name: '2025' });
  const row = year.parentElement;
  if (row?.localName !== 'tr') throw new Error('the 2025 entry must be a row headed by its year');
  if (row.children[1]?.textContent !== 'AI-Native Engineer') {
    throw new Error('the 2025 row must name its role, AI-Native Engineer, in its second cell');
  }
  const cell = row.lastElementChild;
  if (cell?.localName !== 'td' || row.children.length !== 4) {
    throw new Error('the 2025 entry must end with its "What changed" cell, the fourth');
  }
  return cell.textContent ?? '';
}

describe('/about, the figures it quotes', () => {
  it("states the agent's figure as formatMetric() and the study's label, and nothing else", () => {
    render(<AboutPage />);
    const metric = agentMetric();
    const sentence = agentEntryText();

    expect(sentence).toContain(`${formatMetric(metric)} ${metric.label}`);
    // The figure appears once, in that phrase, and never with the label it used to carry.
    expect(sentence.split(formatMetric(metric))).toHaveLength(2);
    expect(sentence).not.toContain('faster resolution');
  });

  it('claims no unattended operation and states no 40% of its own', () => {
    const { container } = render(<AboutPage />);
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/no human intervention/i);
    expect(text).not.toContain('40%');
  });

  it('follows the study when its figure changes, so no 73% is written into the page', async () => {
    // The strongest form of "no literal": give the study another figure and label, render the page
    // again from a fresh module graph, and the old figure must be gone from every part of it.
    const changed = { value: 61, suffix: '%', label: 'errors seen twice', basis: 'A test basis.' };
    vi.resetModules();
    vi.doMock('@/data/case-studies', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/data/case-studies')>();
      return {
        ...actual,
        getCaseStudy: (slug: string) => {
          const study = actual.getCaseStudy(slug);
          if (slug !== AGENT || !study) return study;
          return { ...study, highlight: { ...study.highlight, metric: changed } };
        },
      };
    });
    const { default: Page } = await import('../page');

    const { container } = render(<Page />);
    const text = container.textContent ?? '';

    expect(agentEntryText()).toContain('61% errors seen twice');
    expect(text).not.toContain(formatMetric(agentMetric()));
    expect(text).not.toContain(agentMetric().label);
  });
});
