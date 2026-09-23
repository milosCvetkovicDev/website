import { AnimatedHero } from '@/components/animated-hero';
import { HeroContent } from '@/components/animated-hero/hero-content';
import { FeaturedWork, TechStack } from '@/components';
import { featuredProjects } from '@/data/featured-projects';
import { buildMetadata } from '@/lib/metadata';

export const metadata = buildMetadata({
  // The root template applies to child segments only, so this is the whole title; `absolute` says so.
  title: { absolute: 'Milos Cvetkovic | Senior Full-Stack Engineer' },
  description:
    'Senior Full Stack Engineer building AI-native systems: self-healing agents, legacy rescue and cloud architecture in TypeScript, React and NestJS.',
  path: '/',
});

export default function Home() {
  return (
    <>
      {/* The animated story experience — HeroContent is server-rendered for SEO */}
      <AnimatedHero>
        <HeroContent />
      </AnimatedHero>

      {/* Additional content for those who want more */}
      <div className="border-t border-[var(--border)]">
        <FeaturedWork projects={featuredProjects} />
        <TechStack />
      </div>
    </>
  );
}
