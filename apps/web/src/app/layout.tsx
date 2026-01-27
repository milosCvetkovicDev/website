import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider, Navigation, Footer } from "@/components";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Milos Cvetkovic | Senior Full-Stack Engineer",
  description:
    "AI-native engineer with 10+ years turning legacy codebases into cloud-native solutions. Expert in TypeScript, React, Node.js, and modern DevOps.",
  keywords: [
    "Full-Stack Engineer",
    "TypeScript",
    "React",
    "Node.js",
    "AI Development",
    "Claude Code",
    "Legacy Modernization",
    "Clean Architecture",
  ],
  authors: [{ name: "Milos Cvetkovic" }],
  openGraph: {
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "AI-native engineer with 10+ years turning legacy codebases into cloud-native solutions.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Milos Cvetkovic | Senior Full-Stack Engineer",
    description:
      "AI-native engineer with 10+ years turning legacy codebases into cloud-native solutions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
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
