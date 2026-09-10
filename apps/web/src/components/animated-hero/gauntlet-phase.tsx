'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { HudPanel, PipelineStage, NotificationToast } from './hud-elements';
import { AnimatedText } from './animated-text';

const pipelineStages = [
  { name: 'LINT', duration: 0.5 },
  { name: 'TYPE CHECK', duration: 0.6 },
  { name: 'UNIT TESTS', duration: 0.8 },
  { name: 'E2E TESTS', duration: 1.0 },
  { name: 'SECURITY', duration: 0.5 },
  { name: 'BUILD', duration: 0.7 },
];

type StageStatus = 'pending' | 'running' | 'passed' | 'failed';

export function GauntletPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const deployRef = useRef<HTMLDivElement>(null);
  const achievementRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  const [stageStates, setStageStates] = useState<{ status: StageStatus; progress: number }[]>(
    pipelineStages.map(() => ({ status: 'pending', progress: 0 })),
  );
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'deploying' | 'success'>(
    'idle',
  );
  const [showAchievement, setShowAchievement] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setStageStates(pipelineStages.map(() => ({ status: 'passed', progress: 100 })));
      setDeploymentStatus('success');
      setShowAchievement(true);
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        onEnter: () => animatePipeline(),
      });

      // Initial fade in
      gsap.fromTo(
        pipelineRef.current,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top center',
          },
        },
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const animatePipeline = () => {
    let delay = 0;

    pipelineStages.forEach((stage, index) => {
      // Start running
      setTimeout(() => {
        setStageStates((prev) => {
          const newStates = [...prev];
          newStates[index] = { status: 'running', progress: 0 };
          return newStates;
        });

        // Animate progress
        gsap.to(
          {},
          {
            duration: stage.duration,
            onUpdate: function () {
              setStageStates((prev) => {
                const newStates = [...prev];
                newStates[index] = {
                  status: 'running',
                  progress: Math.round(this.progress() * 100),
                };
                return newStates;
              });
            },
            onComplete: () => {
              setStageStates((prev) => {
                const newStates = [...prev];
                newStates[index] = { status: 'passed', progress: 100 };
                return newStates;
              });
            },
          },
        );
      }, delay * 1000);

      delay += stage.duration + 0.2;
    });

    // Deployment animation
    setTimeout(() => {
      setDeploymentStatus('deploying');
      gsap.fromTo(
        deployRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.4 },
      );

      setTimeout(() => {
        setDeploymentStatus('success');

        // Achievement pops in
        setTimeout(() => {
          setShowAchievement(true);
          gsap.fromTo(
            achievementRef.current,
            { opacity: 0, y: 20, scale: 0.8 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.5,
              ease: 'back.out(1.7)',
            },
          );

          // Headline
          gsap.fromTo(
            headlineRef.current,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.5 },
          );
        }, 300);
      }, 1000);
    }, delay * 1000);
  };

  return (
    <section ref={sectionRef} className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-3xl">
        {/* Phase Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="rainbow">PHASE 4</AnimatedText>
          </span>
          <AnimatedText animation="gravity" className="font-mono text-sm text-[var(--muted)]">
            THE GAUNTLET
          </AnimatedText>
        </div>

        {/* Pipeline */}
        <div ref={pipelineRef}>
          <HudPanel title="CI/CD PIPELINE">
            <div className="space-y-3">
              {pipelineStages.map((stage, index) => (
                <PipelineStage
                  key={stage.name}
                  name={stage.name}
                  status={stageStates[index].status}
                  progress={stageStates[index].progress}
                />
              ))}
            </div>
          </HudPanel>
        </div>

        {/* Deployment Status */}
        <div ref={deployRef} className="mt-6">
          {deploymentStatus !== 'idle' && (
            <div
              className={`rounded-lg border p-6 text-center transition-all duration-500 ${
                deploymentStatus === 'success'
                  ? 'border-[var(--status-ok)]/50 bg-[var(--status-ok)]/10'
                  : 'border-[var(--status-warn)]/50 bg-[var(--status-warn)]/10'
              }`}
            >
              {deploymentStatus === 'deploying' ? (
                <div className="flex items-center justify-center gap-3">
                  <svg
                    className="h-5 w-5 animate-spin text-[var(--status-warn)]"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span className="font-mono text-[var(--status-warn)]">
                    DEPLOYING TO PRODUCTION...
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="h-6 w-6 text-[var(--status-ok)]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="font-mono text-lg text-[var(--status-ok)]">
                      DEPLOYMENT SUCCESSFUL
                    </span>
                  </div>
                  <p className="font-mono text-sm text-[var(--status-ok)]">
                    Production environment updated
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Achievement */}
        <div ref={achievementRef} className={`mt-6 ${showAchievement ? '' : 'opacity-0'}`}>
          <NotificationToast type="success">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏆</span>
              <div>
                <div className="font-semibold">Achievement Unlocked</div>
                <div className="text-sm">&quot;Zero Trust, Full Send&quot; — +500 XP</div>
              </div>
            </div>
          </NotificationToast>
        </div>

        {/* Headline */}
        <div
          ref={headlineRef}
          className={`mt-16 text-center ${showAchievement ? '' : 'opacity-0'}`}
        >
          <h2 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="glitch">
              &quot;It worked on my machine&quot; doesn&apos;t fly here.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="highlight">
              Six gates. Zero shortcuts. Every commit proves itself or dies trying.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
