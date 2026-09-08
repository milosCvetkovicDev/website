'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const roles = ['AI-Native Engineer', 'Legacy Modernization Expert', 'Full-Stack Architect'];

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
        <p className="mb-4 text-lg text-[var(--muted)]">Hi, I&apos;m</p>
        <h1 className="mb-6 text-4xl font-bold md:text-6xl">Milos Cvetkovic</h1>
        <div className="mb-6 h-12 md:h-16">
          <span
            className={`text-2xl font-semibold text-[var(--accent)] transition-opacity duration-300 md:text-4xl ${
              mounted && isVisible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {roles[currentRole]}
          </span>
        </div>
        <p className="mb-10 max-w-2xl text-lg text-[var(--muted)] md:text-xl">
          I ship production systems that actually work—then make them better with AI. From rescuing
          legacy codebases to building autonomous agents that fix their own bugs, I solve the
          problems others avoid.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/work"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-6 py-3 font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            View My Work
          </Link>
          <a
            href="https://www.linkedin.com/in/milos-cvetkovic-dev"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-6 py-3 font-medium transition-colors hover:bg-[var(--card-hover)]"
          >
            Connect on LinkedIn
          </a>
        </div>
        <div className="mt-12 flex items-center gap-6 text-sm text-[var(--muted)]">
          <span>Belgrade, Serbia</span>
        </div>
      </div>
    </section>
  );
}
