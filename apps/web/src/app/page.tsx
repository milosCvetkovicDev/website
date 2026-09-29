import { AnimatedHero } from '@/components/animated-hero';
import { HeroContent } from '@/components/animated-hero/hero-content';
import { FeaturedWork, TechStack } from '@/components';
import { featuredProjects } from '@/data/featured-projects';
import { homePage } from '@/data/pages/home';
import { buildMetadata } from '@/lib/metadata';

// The title and description come from the home page record, so the page's head and its Markdown
// twin's summary are one string (#59).
export const metadata = buildMetadata({
  title: homePage.title,
  description: homePage.summary,
  path: homePage.path,
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
