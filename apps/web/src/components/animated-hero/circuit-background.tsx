'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { circuitPaths, circuitNodes, particleRoutes } from './circuit-data';
import { usePrefersReducedMotion } from './use-gsap-scroll';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(MotionPathPlugin, DrawSVGPlugin);
}

export interface CircuitBackgroundHandle {
  syncProgress: () => void;
  startIdle: () => void;
}

interface CircuitBackgroundProps {
  progressRef: React.RefObject<number>;
}

// Label font sizes by node tier
const LABEL_FONT_SIZE = { ic: 12, via: 9, solder: 7.5 } as const;

// Label fill opacities by node tier (at rest, post-boot)
const LABEL_FILL = {
  ic: 'rgba(139, 92, 246, 0.7)',
  via: 'rgba(139, 92, 246, 0.5)',
  solder: 'rgba(139, 92, 246, 0.35)',
} as const;

export const CircuitBackground = forwardRef<CircuitBackgroundHandle, CircuitBackgroundProps>(
  function CircuitBackground({ progressRef }, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();
    const masterTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const idleTimelineRef = useRef<gsap.core.Timeline | null>(null);
    const idleTweensRef = useRef<gsap.core.Tween[]>([]);
    const rafIdRef = useRef<number>(0);

    useImperativeHandle(ref, () => ({
      syncProgress: () => {
        // No longer needed — rAF loop reads progressRef directly
      },
      startIdle: () => {
        if (idleTimelineRef.current || prefersReducedMotion) return;
        const svg = svgRef.current;
        if (!svg) return;

        const particles = svg.querySelectorAll('[data-particle]');
        const icNodes = svg.querySelectorAll('[data-tier="ic"]');
        const energyPulse = svg.querySelector('.energy-pulse');
        const pathElements = svg.querySelectorAll('.circuit-paths path');

        // Responsive particle count
        const isMobile = window.innerWidth < 768;
        const activeCount = isMobile ? Math.min(8, particles.length) : particles.length;

        // Particle motion along paths
        for (let i = 0; i < activeCount; i++) {
          const particle = particles[i];
          const route = particleRoutes[i];
          if (!particle || !route) continue;
          const pathEl = pathElements[route.pathIndex];
          if (!pathEl) continue;

          const tween = gsap.to(particle, {
            motionPath: {
              path: pathEl as SVGPathElement,
              align: pathEl as SVGPathElement,
              alignOrigin: [0.5, 0.5],
            },
            duration: 4 + Math.random() * 4,
            repeat: -1,
            ease: 'none',
            delay: Math.random() * 3,
          });
          idleTweensRef.current.push(tween);
        }

        // IC node pulse — gentle opacity oscillation
        const pulseTween = gsap.to(icNodes, {
          opacity: 0.4,
          duration: 2,
          stagger: { each: 0.3, repeat: -1, yoyo: true },
          ease: 'sine.inOut',
        });
        idleTweensRef.current.push(pulseTween);

        // Periodic energy pulse every ~8 seconds
        if (energyPulse) {
          const pulseTimeline = gsap.timeline({ repeat: -1, repeatDelay: 8 }).fromTo(
            energyPulse,
            { attr: { r: 0 }, opacity: 0.15 },
            {
              attr: { r: 800 },
              opacity: 0,
              duration: 3,
              ease: 'power2.out',
            },
          );
          // Timeline extends Tween in GSAP's type hierarchy; cast for storage
          idleTweensRef.current.push(pulseTimeline as unknown as gsap.core.Tween);
        }

        // Store a dummy timeline ref to prevent re-entry
        idleTimelineRef.current = gsap.timeline();
      },
    }));

    // Boot animation: build a GSAP master timeline and scrub it via rAF
    useEffect(() => {
      const svg = svgRef.current;
      if (!svg || prefersReducedMotion) return;

      const trunkPaths = svg.querySelectorAll('[data-tier="trunk"]');
      const branchPaths = svg.querySelectorAll('[data-tier="branch"]');
      const tracePaths = svg.querySelectorAll('[data-tier="trace"]');
      const icNodes = svg.querySelectorAll('[data-tier="ic"]');
      const viaNodes = svg.querySelectorAll('[data-tier="via"]');
      const solderNodes = svg.querySelectorAll('[data-tier="solder"]');
      const particles = svg.querySelectorAll('[data-particle]');
      const energyPulse = svg.querySelector('.energy-pulse');

      // Labels — queried separately for staggered fade-in
      const icLabels = svg.querySelectorAll('[data-label-tier="ic"]');
      const viaLabels = svg.querySelectorAll('[data-label-tier="via"]');
      const solderLabels = svg.querySelectorAll('[data-label-tier="solder"]');

      // Initialize: all paths hidden via DrawSVG, nodes invisible
      gsap.set([...trunkPaths, ...branchPaths, ...tracePaths], {
        drawSVG: '0%',
        opacity: 1,
      });
      gsap.set([...icNodes, ...viaNodes, ...solderNodes], {
        opacity: 0,
        scale: 0.3,
        transformOrigin: 'center center',
      });
      gsap.set(particles, { opacity: 0 });
      gsap.set([...icLabels, ...viaLabels, ...solderLabels], { opacity: 0 });

      // Build master timeline (paused, we scrub it with progress)
      const master = gsap.timeline({ paused: true });

      // Phase 1 (0-0.3): Trunk paths trace — main data highways
      master.to(
        trunkPaths,
        {
          drawSVG: '100%',
          duration: 0.3,
          stagger: 0.03,
          ease: 'power2.out',
        },
        0,
      );

      // Phase 2 (0.25-0.55): IC nodes + labels, branch paths, via nodes + labels
      master.to(
        icNodes,
        {
          opacity: 1,
          scale: 1,
          duration: 0.15,
          stagger: 0.02,
          ease: 'back.out(1.7)',
        },
        0.25,
      );

      // IC labels fade in just after their nodes
      master.to(
        icLabels,
        {
          opacity: 1,
          duration: 0.12,
          stagger: 0.03,
          ease: 'power2.out',
        },
        0.3,
      );

      master.to(
        branchPaths,
        {
          drawSVG: '100%',
          duration: 0.3,
          stagger: 0.02,
          ease: 'power1.out',
        },
        0.3,
      );

      master.to(
        viaNodes,
        {
          opacity: 1,
          scale: 1,
          duration: 0.15,
          stagger: 0.01,
          ease: 'back.out(1.4)',
        },
        0.4,
      );

      // Via labels fade in with their nodes
      master.to(
        viaLabels,
        {
          opacity: 1,
          duration: 0.1,
          stagger: 0.02,
          ease: 'power2.out',
        },
        0.45,
      );

      // Phase 3 (0.6-0.9): Tertiary traces, solder nodes + labels, particles
      master.to(
        tracePaths,
        {
          drawSVG: '100%',
          duration: 0.2,
          stagger: 0.015,
          ease: 'power1.out',
        },
        0.6,
      );

      master.to(
        solderNodes,
        {
          opacity: 1,
          scale: 1,
          duration: 0.1,
          stagger: 0.01,
          ease: 'power2.out',
        },
        0.7,
      );

      // Solder labels (faintest)
      master.to(
        solderLabels,
        {
          opacity: 1,
          duration: 0.1,
          stagger: 0.01,
          ease: 'power2.out',
        },
        0.75,
      );

      master.to(
        particles,
        {
          opacity: 1,
          duration: 0.1,
          stagger: 0.02,
        },
        0.75,
      );

      // Phase 4 (0.9-1.0): Energy pulse
      if (energyPulse) {
        master.fromTo(
          energyPulse,
          { attr: { r: 0 }, opacity: 0.3 },
          {
            attr: { r: 600 },
            opacity: 0,
            duration: 0.1,
            ease: 'power2.out',
          },
          0.9,
        );
      }

      masterTimelineRef.current = master;

      // rAF loop: scrub master timeline to match boot progress
      const syncLoop = () => {
        const p = (progressRef.current ?? 0) / 100;
        const current = master.progress();
        const next = current + (p - current) * 0.1;
        master.progress(Math.min(next, 1));
        rafIdRef.current = requestAnimationFrame(syncLoop);
      };
      rafIdRef.current = requestAnimationFrame(syncLoop);

      return () => {
        cancelAnimationFrame(rafIdRef.current);
        master.kill();
        idleTweensRef.current.forEach((t) => t.kill());
        idleTweensRef.current = [];
      };
    }, [prefersReducedMotion, progressRef]);

    // Pause/resume idle animations when the SVG scrolls out of view
    useEffect(() => {
      const svg = svgRef.current;
      if (!svg) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const isVisible = entries[0]?.isIntersecting ?? false;
          idleTweensRef.current.forEach((t) => (isVisible ? t.play() : t.pause()));
        },
        { threshold: 0 },
      );
      observer.observe(svg);

      return () => observer.disconnect();
    }, []);

    // For reduced motion: show static fully-lit circuit
    const staticOpacity = prefersReducedMotion ? 1 : 0;

    return (
      <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Glow filter for nodes */}
            <filter id="circuit-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Stronger glow for particles */}
            <filter id="particle-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Circuit Paths */}
          <g className="circuit-paths">
            {circuitPaths.map((path, i) => (
              <path
                key={`path-${i}`}
                d={path.d}
                fill="none"
                stroke="rgba(139, 92, 246, 0.4)"
                strokeWidth={path.strokeWidth}
                strokeLinecap="round"
                opacity={staticOpacity}
                data-tier={path.tier}
                data-index={i}
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="circuit-nodes">
            {circuitNodes.map((node, i) => (
              <circle
                key={`node-${i}`}
                cx={node.cx}
                cy={node.cy}
                r={node.r}
                fill="rgba(139, 92, 246, 0.8)"
                filter={node.tier === 'ic' ? 'url(#circuit-glow)' : undefined}
                opacity={staticOpacity}
                data-tier={node.tier}
                data-index={i}
              />
            ))}
          </g>

          {/* Technology Labels */}
          <g className="circuit-labels">
            {circuitNodes.map((node, i) => {
              if (!node.label) return null;
              const isLeft = node.labelAnchor === 'left';
              const fontSize = LABEL_FONT_SIZE[node.tier];
              const fill = LABEL_FILL[node.tier];
              const dx = isLeft ? -(node.r + 8) : node.r + 8;
              return (
                <text
                  key={`label-${i}`}
                  x={node.cx + dx}
                  y={node.cy}
                  textAnchor={isLeft ? 'end' : 'start'}
                  dominantBaseline="central"
                  fontSize={fontSize}
                  fontFamily="ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace"
                  fill={fill}
                  opacity={staticOpacity}
                  data-label-tier={node.tier}
                  letterSpacing="0.05em"
                >
                  {node.label}
                </text>
              );
            })}
          </g>

          {/* Data Particles */}
          <g className="circuit-particles">
            {particleRoutes.map((_, i) => (
              <circle
                key={`particle-${i}`}
                r={3}
                fill="rgba(139, 92, 246, 1)"
                filter="url(#particle-glow)"
                opacity={0}
                data-particle={i}
              />
            ))}
          </g>

          {/* Energy Pulse */}
          <circle
            className="energy-pulse"
            cx={960}
            cy={540}
            r={0}
            fill="none"
            stroke="rgba(139, 92, 246, 0.1)"
            strokeWidth={2}
            opacity={0}
          />
        </svg>
      </div>
    );
  },
);
