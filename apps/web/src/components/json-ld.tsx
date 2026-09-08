// JSON-LD structured data for SEO rich snippets
// Note: dangerouslySetInnerHTML is safe here as content is hardcoded, not user input

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

export function PersonJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
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
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export function WebsiteJsonLd() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Milos Cvetkovic',
    url: siteUrl,
    description:
      'Portfolio of Milos Cvetkovic - Senior Full-Stack Engineer specializing in AI-native development and legacy modernization.',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
