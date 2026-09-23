// JSON-LD structured data. Every block goes through `serializeJsonLd`: the values come from
// NEXT_PUBLIC_SITE_URL and the case-study data, and `JSON.stringify` alone would let a `</script>`
// in any of them end the script element early.
import type { CaseStudy } from '@/data/case-studies';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

// Node ids, so the blocks describe one graph: the site and every case study point at the same
// Person instead of each describing a person of its own.
const PERSON_ID = `${siteUrl}/#person`;
const WEBSITE_ID = `${siteUrl}/#website`;

/** The Person as another node refers to it: the id, plus enough to stand alone. */
const author = { '@type': 'Person', '@id': PERSON_ID, name: 'Milos Cvetkovic', url: siteUrl };

/**
 * JSON for a `<script type="application/ld+json">`, with every `<` written as `\u003c`: a JSON
 * parser reads the same string, and the HTML tokeniser never sees a `</script>` inside it.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

export function PersonJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': PERSON_ID,
        name: 'Milos Cvetkovic',
        url: siteUrl,
        jobTitle: 'Senior Full Stack Engineer & Architect',
        description:
          'Senior Full Stack Engineer & Architect with 13 years of experience building AI-native systems, self-healing agents, and cloud-native architecture.',
        knowsAbout: [
          'TypeScript',
          'React',
          'NestJS',
          'Node.js',
          'Azure',
          'Terraform',
          'Claude Code',
          'DDD',
          'Kubernetes',
          'AI-Native Development',
          'Self-Healing Agents',
          'Clean Architecture',
          'Legacy Modernization',
          'DevOps',
        ],
        sameAs: [
          'https://www.linkedin.com/in/milos-cvetkovic-dev',
          'https://github.com/milosCvetkovicDev',
          'https://x.com/milos_dev',
        ],
      }}
    />
  );
}

export function WebsiteJsonLd() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: 'Milos Cvetkovic',
        url: siteUrl,
        description:
          'Portfolio of Milos Cvetkovic - Senior Full-Stack Engineer specializing in AI-native development and legacy modernization.',
        author,
      }}
    />
  );
}

/** A case study as an article: its words from `case-studies.ts`, its author the site's Person. */
export function TechArticleJsonLd({ caseStudy }: { caseStudy: CaseStudy }) {
  const url = `${siteUrl}/work/${caseStudy.slug}`;
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: caseStudy.title,
        description: caseStudy.description,
        url,
        mainEntityOfPage: url,
        image: `${url}/opengraph-image`,
        author,
        isPartOf: { '@id': WEBSITE_ID },
        datePublished: caseStudy.publishedAt,
        dateModified: caseStudy.updatedAt,
        keywords: caseStudy.tags,
      }}
    />
  );
}

/** Home → Work → the case study, the path a results page shows above the title. */
export function BreadcrumbListJsonLd({ caseStudy }: { caseStudy: CaseStudy }) {
  const crumbs = [
    { name: 'Home', item: siteUrl },
    { name: 'Work', item: `${siteUrl}/work` },
    { name: caseStudy.title, item: `${siteUrl}/work/${caseStudy.slug}` },
  ];
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          ...crumb,
        })),
      }}
    />
  );
}
