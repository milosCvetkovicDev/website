import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, Navigation, Footer, PersonJsonLd, WebsiteJsonLd } from "@/components";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://miloscvetkovic.dev"),
  title: {
    default: "Milos Cvetkovic | Senior Full-Stack Engineer",
    template: "%s | Milos Cvetkovic",
  },
  description:
    "I ship production systems that actually work—then make them better with AI. 10+ years rescuing legacy codebases and building autonomous agents.",
  keywords: [
    "Senior Full-Stack Engineer",
    "AI Engineer",
    "TypeScript Developer",
    "React Developer",
    "Node.js Developer",
    "Claude Code",
    "Claude Agent SDK",
    "Legacy Modernization",
    "Clean Architecture",
    "Azure",
    "DevOps",
  ],
  authors: [{ name: "Milos Cvetkovic" }],
  creator: "Milos Cvetkovic",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://miloscvetkovic.dev",
    siteName: "Milos Cvetkovic",
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "I ship production systems that actually work—then make them better with AI. 10+ years rescuing legacy codebases.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "I ship production systems that actually work—then make them better with AI.",
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
          <Navigation />
          <main className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
