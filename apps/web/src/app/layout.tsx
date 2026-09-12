import type { Metadata } from 'next';
// Self-hosted through next/font/local (the `geist` package) rather than fetched from Google Fonts at
// build time: outside dev, Next turns a failed Google Fonts fetch into a build error, so an outage or
// a network block on a runner blocked every production deploy. The package sets the same
// --font-geist-sans and --font-geist-mono variables globals.css already reads.
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
// Imported from their own modules, not the `@/components` barrel: every client module reachable
// from a server component's imports is bundled into that layout's client chunk whether it renders
// or not, and through the barrel that meant FeaturedWork shipping to every route.
import { ThemeProvider } from '@/components/theme-provider';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { PersonJsonLd, WebsiteJsonLd } from '@/components/json-ld';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Milos Cvetkovic | Senior Full-Stack Engineer',
    template: '%s | Milos Cvetkovic',
  },
  description:
    'Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. 13 years of AI-native development, self-healing agents, and cloud-native architecture across TypeScript, React, NestJS, Azure, and Kubernetes.',
  keywords: [
    'Senior Full-Stack Engineer',
    'AI-Native Development',
    'TypeScript',
    'React',
    'NestJS',
    'Azure',
    'Terraform',
    'Claude Code',
    'DDD',
    'Kubernetes',
    'Self-Healing Agents',
    'Cloud Architecture',
    'Node.js Developer',
    'Legacy Modernization',
    'Clean Architecture',
    'DevOps',
  ],
  authors: [{ name: 'Milos Cvetkovic' }],
  creator: 'Milos Cvetkovic',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Milos Cvetkovic',
    title: 'Milos Cvetkovic | Senior Full-Stack Engineer',
    description:
      'Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. 13 years of AI-native development, self-healing agents, and cloud-native architecture.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Milos Cvetkovic | Senior Full-Stack Engineer',
    description:
      'Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. AI-native development, self-healing agents, cloud architecture.',
    creator: '@milos_dev',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <PersonJsonLd />
        <WebsiteJsonLd />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} flex min-h-screen flex-col antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:text-white focus:outline-none"
          >
            Skip to main content
          </a>
          <Navigation />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
