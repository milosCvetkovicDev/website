/**
 * How the /about question-and-answer block (#58) is measured, shared by the unit test on its data
 * (`src/data/pages/__tests__/records.test.ts`) and the e2e row on the served page
 * (`e2e/seo-surface.spec.ts`), so both count words and find figures the same way.
 *
 * A word is what a reader counts: a run of text between spaces or dashes that holds a letter or a
 * digit, so `Next.js` is one word, `control—agent` is two and a dash standing alone is none.
 *
 * A restated metric is a case-study headline figure written as a number: its `formatMetric()`
 * rendering, or its value, not part of a longer number, followed by a unit in any common spelling
 * (`73 %`, `73 percent`, `5x`, `5 ×`, `5 times`, `5-fold`). Its limit: a figure spelled out in words
 * ("seventy-three percent") is not caught, and a bare number with no unit is not a metric here.
 */
import { formatMetric, type CaseStudyFigure } from '@/data/case-studies';

/** The words in `text`, as a reader counts them. */
export function wordCount(text: string): number {
  return text.split(/[\s–—]+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

// The units a headline figure is written with, in the spellings a sentence might use.
const UNIT = String.raw`\s*(?:%|per ?cent\b|×|x\b|times\b|-?fold\b)`;

const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The metrics `text` restates, each as `formatMetric()` renders it; empty for none. */
export function restatedMetrics(text: string, metrics: readonly CaseStudyFigure[]): string[] {
  return metrics
    .filter((metric) => {
      if (!Number.isFinite(metric.value)) return false;
      // Neither form counts inside a longer number: `173%` does not restate `73%`.
      const alone = (figure: string) => String.raw`(?<![\d.,])${escaped(figure)}`;
      return (
        new RegExp(String.raw`${alone(formatMetric(metric))}(?!\d)`, 'u').test(text) ||
        new RegExp(alone(String(metric.value)) + UNIT, 'iu').test(text)
      );
    })
    .map(formatMetric);
}
