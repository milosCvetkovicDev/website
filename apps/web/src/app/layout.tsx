import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, Navigation, Footer, PersonJsonLd, WebsiteJsonLd } from "@/components";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://miloscvetkovic.dev";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Milos Cvetkovic | Senior Full-Stack Engineer",
    template: "%s | Milos Cvetkovic",
  },
  description:
    "Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. 13 years of AI-native development, self-healing agents, and cloud-native architecture across TypeScript, React, NestJS, Azure, and Kubernetes.",
  keywords: [
    "Senior Full-Stack Engineer",
    "AI-Native Development",
    "TypeScript",
    "React",
    "NestJS",
    "Azure",
    "Terraform",
    "Claude Code",
    "DDD",
    "Kubernetes",
    "Self-Healing Agents",
    "Cloud Architecture",
    "Node.js Developer",
    "Legacy Modernization",
    "Clean Architecture",
    "DevOps",
  ],
  authors: [{ name: "Milos Cvetkovic" }],
  creator: "Milos Cvetkovic",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Milos Cvetkovic",
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. 13 years of AI-native development, self-healing agents, and cloud-native architecture.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "Senior Full Stack Engineer & Architect building systems that inherit chaos and ship clarity. AI-native development, self-healing agents, cloud architecture.",
    creator: "@milos_dev",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add these when you have them:
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
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
        <PersonJsonLd />
        <WebsiteJsonLd />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--accent)] focus:text-white focus:rounded-lg focus:outline-none"
          >
            Skip to main content
          </a>
          <Navigation />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
