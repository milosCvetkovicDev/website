// JSON-LD structured data for SEO rich snippets
// Note: dangerouslySetInnerHTML is safe here as content is hardcoded, not user input

export function PersonJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Milos Cvetkovic",
    url: "https://miloscvetkovic.dev",
    jobTitle: "Senior Full-Stack Engineer",
    description:
      "AI-native engineer with 10+ years turning legacy codebases into cloud-native solutions.",
    knowsAbout: [
      "TypeScript",
      "React",
      "Node.js",
      "AI Development",
      "Claude Code",
      "Clean Architecture",
      "Legacy Modernization",
      "Azure",
      "DevOps",
    ],
    sameAs: [
      "https://www.linkedin.com/in/milos-cvetkovic-dev",
      "https://github.com/milosCvetkovicDev",
      "https://x.com/milos_dev",
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
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Milos Cvetkovic",
    url: "https://miloscvetkovic.dev",
    description:
      "Portfolio of Milos Cvetkovic - Senior Full-Stack Engineer specializing in AI-native development and legacy modernization.",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
