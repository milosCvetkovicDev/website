'use client';

import { useRef, forwardRef, useImperativeHandle } from 'react';
import { circuitPaths, circuitNodes, particleRoutes } from './circuit-data';
import { usePrefersReducedMotion } from './use-gsap-scroll';

export interface CircuitBackgroundHandle {
  syncProgress: (progress: number) => void;
  startIdle: () => void;
}

export const CircuitBackground = forwardRef<CircuitBackgroundHandle>(
  function CircuitBackground(_props, ref) {
    const svgRef = useRef<SVGSVGElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    useImperativeHandle(ref, () => ({
      syncProgress: (_progress: number) => {
        // Will be implemented with GSAP in Task 4
      },
      startIdle: () => {
        // Will be implemented with GSAP in Task 5
      },
    }));

    // For reduced motion: show static fully-lit circuit
    const staticOpacity = prefersReducedMotion ? 1 : 0;

    return (
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 1920 1080"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full"
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
  }
);
