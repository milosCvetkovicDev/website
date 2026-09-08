import { AnimatedHero } from '@/components/animated-hero';
import { HeroContent } from '@/components/animated-hero/hero-content';
import { FeaturedWork, TechStack } from '@/components';
import { featuredProjects } from '@/data/featured-projects';

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
