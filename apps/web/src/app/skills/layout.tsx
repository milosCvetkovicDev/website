import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Skills',
  description:
    'TypeScript, React, Node.js, Azure, AI agents, and more. 10+ years of full-stack expertise across modern and legacy systems.',
  openGraph: {
    title: 'Skills & Expertise',
    description: 'Tools are just tools—what matters is shipping working software.',
  },
};

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
