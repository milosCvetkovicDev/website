'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const roles = [
  'AI-Native Engineer',
  'Legacy Modernization Expert',
  'Full-Stack Architect',
];

export function Hero() {
  const [mounted, setMounted] = useState(false);
  const [currentRole, setCurrentRole] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const interval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setCurrentRole((prev) => (prev + 1) % roles.length);
        setIsVisible(true);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, [mounted]);

  return (
    <section className="py-20 md:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <p className="text-[var(--muted)] mb-4 text-lg">Hi, I&apos;m</p>
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Milos Cvetkovic
        </h1>
        <div className="h-12 md:h-16 mb-6">
          <span
            className={`text-2xl md:text-4xl font-semibold text-[var(--accent)] transition-opacity duration-300 ${
              mounted && isVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {roles[currentRole]}
          </span>
        </div>
        <p className="text-lg md:text-xl text-[var(--muted)] max-w-2xl mb-10">
          I ship production systems that actually work—then make them better
          with AI. From rescuing legacy codebases to building autonomous agents
          that fix their own bugs, I solve the problems others avoid.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href="/work"
            className="inline-flex items-center justify-center px-6 py-3 bg-[var(--accent)] text-white font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors"
          >
            View My Work
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center px-6 py-3 border border-[var(--border)] font-medium rounded-lg hover:bg-[var(--card-hover)] transition-colors"
          >
            Get In Touch
          </Link>
        </div>
        <div className="mt-12 flex items-center gap-6 text-sm text-[var(--muted)]">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Available for opportunities
          </span>
          <span>Belgrade, Serbia</span>
        </div>
      </div>
    </section>
  );
}
