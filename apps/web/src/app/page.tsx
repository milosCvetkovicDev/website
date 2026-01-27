import { AnimatedHero } from '@/components/animated-hero';
import { FeaturedWork, TechStack } from '@/components';

export default function Home() {
  return (
    <>
      {/* The animated story experience */}
      <AnimatedHero />

      {/* Additional content for those who want more */}
      <div className="border-t border-[var(--border)]">
        <FeaturedWork />
        <TechStack />
      </div>
    </>
  );
}
