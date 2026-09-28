import { caseStudies, formatMetric } from '@/data/case-studies';
import type { InlineLink, PageRecord, ProseSection } from './types';

/**
 * /work: the copy `app/work/page.tsx` renders around its cards, and the record its Markdown twin
 * reads (#59). The cards themselves read `caseStudies`, and so does the record, so neither restates
 * a study's title, description or metric. The `h1` stays in the page.
 */

/** A figure in the stats bar and the label under it. */
export interface WorkStat {
  value: string;
  label: string;
}

/** The copy the page renders around its `h1` and its cards, in page order. */
export const workCopy = {
  eyebrow: 'Case studies · Milos Cvetkovic, Senior Full-Stack Engineer',
  intro:
    'Real projects with real constraints: AI agents, legacy modernization and developer tooling. Each one pushed boundaries—and delivered results.',
  stats: [
    { value: String(caseStudies.length), label: 'Projects' },
    { value: '100%', label: 'In Production' },
    { value: '0', label: 'Left Unfinished' },
  ],
  /** The line at the foot of every card, which the whole card links from. */
  readMore: 'Read full case study',
  cta: {
    heading: 'Like what you see?',
    text: 'I share engineering deep dives, project updates, and lessons learned. Connect with me to follow along.',
    link: {
      text: 'Connect on LinkedIn',
      href: 'https://www.linkedin.com/in/milos-cvetkovic-dev',
    },
  },
} satisfies {
  eyebrow: string;
  intro: string;
  stats: readonly WorkStat[];
  readMore: string;
  cta: { heading: string; text: string; link: InlineLink };
};

/**
 * One section per card, under the title the card shows as its heading: the description, the metric
 * as the card renders it through `formatMetric()`, and the link to the study.
 */
const studies = caseStudies.map(
  ({ slug, title, description, highlight: { metric } }): ProseSection => ({
    kind: 'prose',
    heading: title,
    paragraphs: [
      description,
      `${formatMetric(metric)} ${metric.label}`,
      [{ text: workCopy.readMore, href: `/work/${slug}` }],
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
