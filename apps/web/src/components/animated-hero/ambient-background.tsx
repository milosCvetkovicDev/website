'use client';

import { useEffect, useRef, useCallback } from 'react';

// Floating code particles that drift across the screen
// Performance optimized: throttled to 30fps, pauses when off-screen, uses filter instead of splice
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isVisibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) return;

    let animationId: number;
    let lastTime = 0;
    const targetFPS = 30; // Throttle to 30fps for performance
    const frameInterval = 1000 / targetFPS;

    // Pause animation when canvas is not visible (performance optimization)
    const observer = new IntersectionObserver(
      (entries) => {
        isVisibleRef.current = entries[0]?.isIntersecting ?? false;
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    let particles: Particle[] = [];
    const codeSnippets = [
      'async', 'await', 'const', 'function', '=> {', 'return',
      'import', 'export', 'class', 'interface', '{ }', '[ ]',
    ];

    interface Particle {
      x: number;
      y: number;
      text: string;
      speed: number;
      opacity: number;
      font: string; // Cache font string
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticle = (): Particle => {
      const size = 10 + Math.random() * 4;
      return {
        x: Math.random() * canvas.width,
        y: canvas.height + 20,
        text: codeSnippets[Math.floor(Math.random() * codeSnippets.length)],
        speed: 0.3 + Math.random() * 0.5,
        opacity: 0.03 + Math.random() * 0.07,
        font: `${size}px monospace`, // Pre-compute font string
      };
    };

    const init = () => {
      resize();
      // Start with fewer particles for better performance
      for (let i = 0; i < 10; i++) {
        const p = createParticle();
        p.y = Math.random() * canvas.height;
        particles.push(p);
      }
    };

    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate);

      // Skip rendering when canvas is not visible (huge performance win)
      if (!isVisibleRef.current) return;

      // Throttle to target FPS
      const deltaTime = currentTime - lastTime;
      if (deltaTime < frameInterval) return;
      lastTime = currentTime - (deltaTime % frameInterval);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Add new particles occasionally (reduced frequency)
      if (particles.length < 15 && Math.random() < 0.01) {
        particles.push(createParticle());
      }

      // Use filter instead of splice for better performance
      particles = particles.filter((p) => {
        p.y -= p.speed;
        if (p.y < -20) return false;

        ctx.font = p.font;
        ctx.fillStyle = `rgba(139, 92, 246, ${p.opacity})`;
        ctx.fillText(p.text, p.x, p.y);
        return true;
      });
    };

    init();
    animationId = requestAnimationFrame(animate);

    // Debounce resize handler
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    };

    window.addEventListener('resize', debouncedResize);

    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
      cancelAnimationFrame(animationId);
      observer.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  );
}

// Grid background pattern
export function GridBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />
      {/* Radial fade from center */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, var(--background) 70%)',
        }}
      />
    </div>
  );
}

// Scan line effect for retro-tech feel
export function ScanLines() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
      style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
      }}
    />
  );
}
