import type { Metadata, Viewport } from 'next';
// Self-hosted through next/font/local rather than fetched from Google Fonts at build time: outside
// dev, Next turns a failed Google Fonts fetch into a build error, so an outage or a network block on a
// runner blocked every production deploy. The files are subsets of Geist; see fonts/README.md.
import localFont from 'next/font/local';
import './globals.css';
import { SITE_NAME, TWITTER_HANDLE } from '@/lib/metadata';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
// Imported from their own modules, not the `@/components` barrel: every client module reachable
// from a server component's imports is bundled into that layout's client chunk whether it renders
// or not, and through the barrel that meant FeaturedWork shipping to every route.
import { ThemeProvider } from '@/components/theme-provider';
import { HydrationMarker } from '@/components/hydration-marker';
import { Navigation } from '@/components/navigation';
import { Footer } from '@/components/footer';
import { PersonJsonLd, WebsiteJsonLd } from '@/components/json-ld';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://miloscvetkovic.dev';

// Characters Geist lacks fall back to the faces globals.css declares with Google Fonts' override
// values, so they keep the size they had; the faces next/font/local would compute differ by a
// percent or two.
const geistSans = localFont({
  src: './fonts/geist-latin.woff2',
  variable: '--font-geist-sans',
  weight: '400 900',
  adjustFontFallback: false,
  fallback: ['Geist Fallback'],
});

const geistMono = localFont({
  src: './fonts/geist-mono-latin-symbols.woff2',
  variable: '--font-geist-mono',
  weight: '400 900',
  adjustFontFallback: false,
  fallback: ['Geist Mono Fallback'],
});

// Only what is true of every response, the 404 included. What names a route (the canonical, og:url,
// the titles and descriptions) comes from each page's buildMetadata(): Next replaces `openGraph` and
// `twitter` wholesale per segment, so a URL or title set here would reach every page that forgot one.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Milos Cvetkovic | Senior Full-Stack Engineer',
    template: '%s | Milos Cvetkovic',
  },
  authors: [{ name: 'Milos Cvetkovic' }],
  creator: 'Milos Cvetkovic',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: SITE_NAME,
  },
  twitter: {
    card: 'summary_large_image',
    creator: TWITTER_HANDLE,
  },
  // No `robots` here: each page sets its own through buildMetadata(), and one declared here would
  // also reach the 404s, beside the `noindex` Next injects there.
};

// Browser chrome in each scheme's `--background` (globals.css). The media queries follow the
// operating system, not the site's toggle, which Next cannot see; `color-scheme` in globals.css is
// what follows the toggle, and the meta tag tells the browser both schemes exist before CSS loads.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
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
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
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
        <HydrationMarker />
      </body>
    </html>
  );
}
