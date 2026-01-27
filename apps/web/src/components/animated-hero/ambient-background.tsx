'use client';

import { useEffect, useRef } from 'react';

// Floating code particles that drift across the screen
export function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const particles: Particle[] = [];
    const codeSnippets = [
      'async',
      'await',
      'const',
      'function',
      '=> {',
      'return',
      'import',
      'export',
      'class',
      'interface',
      '{ }',
      '[ ]',
      '( )',
      '===',
      '!==',
      '...',
      'try',
      'catch',
      'if',
      'else',
      '0x',
      '///',
    ];

    interface Particle {
      x: number;
      y: number;
      text: string;
      speed: number;
      opacity: number;
      size: number;
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticle = (): Particle => ({
      x: Math.random() * canvas.width,
      y: canvas.height + 20,
      text: codeSnippets[Math.floor(Math.random() * codeSnippets.length)],
      speed: 0.3 + Math.random() * 0.5,
      opacity: 0.03 + Math.random() * 0.07,
      size: 10 + Math.random() * 4,
    });

    const init = () => {
      resize();
      // Start with some particles
      for (let i = 0; i < 15; i++) {
        const p = createParticle();
        p.y = Math.random() * canvas.height;
        particles.push(p);
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Add new particles occasionally
      if (particles.length < 20 && Math.random() < 0.02) {
        particles.push(createParticle());
      }

      particles.forEach((p, index) => {
        p.y -= p.speed;

        // Remove particles that are off screen
        if (p.y < -20) {
          particles.splice(index, 1);
          return;
        }

        ctx.font = `${p.size}px monospace`;
        ctx.fillStyle = `rgba(139, 92, 246, ${p.opacity})`;
        ctx.fillText(p.text, p.x, p.y);
      });

      animationId = requestAnimationFrame(animate);
    };

    init();
    animate();

    window.addEventListener('resize', resize);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
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
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.5) 1px, transparent 1px)
          `,
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
