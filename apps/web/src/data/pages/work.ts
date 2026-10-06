import { caseStudies, formatMetric } from '@/data/case-studies';
import { OCCUPATION } from '@/data/profile';
import { social } from '@/data/social';
import { productionFigure } from '@/data/work-stats';
import type { InlineLink, PageRecord, ProseSection } from './types';

/**
 * /work: the copy `app/work/page.tsx` renders around its cards, and the record its Markdown twin
 * reads (#59). The cards themselves read `caseStudies`, and so does the record, so neither restates
 * a study's title, description or metric. The `h1` and the hook under it stay in the page (#58).
 */

/**
 * A figure in the stats bar and the label under it, which the page renders as two elements: the
 * figure large, the label small and uppercase. Keep them apart rather than one string.
 */
export interface WorkStat {
  value: string;
  label: string;
}

/** The copy the page renders around its `h1`, the hook under it and its cards, in page order. */
export const workCopy = {
  eyebrow: `Case studies · Milos Cvetkovic, ${OCCUPATION}`,
  intro:
    'Real projects with real constraints: AI agents, legacy modernization and developer tooling. Each one pushed boundaries—and delivered results.',
  // Both figures are counted from `caseStudies` when the page is built, never written down (#58).
  // The bar once claimed 100% in production, which went false when a study was retired, and a count
  // of projects left unfinished with no denominator, which stays out until the owner supplies one.
  stats: [
    { value: String(caseStudies.length), label: 'Projects' },
    { value: productionFigure(caseStudies), label: 'Running in production' },
  ],
  /** The line at the foot of every card, which the whole card links from. */
  readMore: 'Read full case study',
  cta: {
    heading: 'Like what you see?',
    text: 'I share engineering deep dives, project updates, and lessons learned. Connect with me to follow along.',
    link: { text: 'Connect on LinkedIn', href: social.linkedin.href },
  },
} satisfies {
  eyebrow: string;
  intro: string;
  stats: readonly WorkStat[];
  readMore: string;
  // The page renders the CTA as an external `<a target="_blank">`, so its href must be one.
  cta: { heading: string; text: string; link: InlineLink & { href: `https://${string}` } };
};

/**
 * One section per card, under the title the card shows as its heading: the description, the metric
 * as the card renders it through `formatMetric()`, and the link to the study. On the page the whole
 * card is the link, so its name carries the title; the twin's link names the study itself, or every
 * card's link would read the same.
 */
const studies = caseStudies.map(
  ({ slug, title, description, highlight: { metric } }): ProseSection => ({
    kind: 'prose',
    heading: title,
    paragraphs: [
      description,
      `${formatMetric(metric)} ${metric.label}`,
      [{ text: `${workCopy.readMore}: ${title}`, href: `/work/${slug}` }],
    ],
  }),
);

export const workRecord: PageRecord = {
  path: '/work',
  title: 'Work — AI agents & legacy modernization',
  summary:
    'Real projects, real constraints, real results. Case studies on AI agents, legacy modernization, and high-performance systems.',
  sections: [
    ...studies,
    {
      kind: 'prose',
      heading: workCopy.cta.heading,
      paragraphs: [workCopy.cta.text, [workCopy.cta.link]],
    },
  ],
};
