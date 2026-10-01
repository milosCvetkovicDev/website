'use client';

import { createRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { isAlreadyReached, runWithGsap, type Gsap } from './load-gsap';
import { HudPanel, PipelineStage, NotificationToast, progressFillTransform } from './hud-elements';
import { AnimatedText } from './animated-text';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { useStoryVisibility } from '@/hooks/use-story-visibility';
import { storyClosings, storyTitles } from '@/data/pages/home';

const pipelineStages = [
  { name: 'LINT', duration: 0.5 },
  { name: 'TYPE CHECK', duration: 0.6 },
  { name: 'UNIT TESTS', duration: 0.8 },
  { name: 'E2E TESTS', duration: 1.0 },
  { name: 'SECURITY', duration: 0.5 },
  { name: 'BUILD', duration: 0.7 },
];

type StageStatus = 'pending' | 'running' | 'passed' | 'failed';
// What React renders for a stage. A running stage renders an empty fill throughout: its progress
// tween draws the fill through a ref instead (animatePipeline), so React state changes only when a
// stage starts running and when it passes.
type StageState = { status: StageStatus; progress: number };

const pendingStages: StageState[] = pipelineStages.map(() => ({ status: 'pending', progress: 0 }));
const passedStages: StageState[] = pipelineStages.map(() => ({ status: 'passed', progress: 100 }));

export function GauntletPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  // Pauses the section's endless CSS animations while it is out of view (globals.css).
  useStoryVisibility(sectionRef);
  const titleId = useId();
  const pipelineRef = useRef<HTMLDivElement>(null);
  const deployRef = useRef<HTMLDivElement>(null);
  const achievementRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);
  // Each stage's fill, which its progress tween scales frame by frame without a React render. Made
  // once, in the state initialiser, so every render hands each stage the same ref.
  const [fillRefs] = useState(() => pipelineStages.map(() => createRef<HTMLDivElement>()));

  const [stageStates, setStageStates] = useState<StageState[]>(pendingStages);
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'deploying' | 'success'>(
    'idle',
  );
  // Shown to begin with: the served HTML, a page GSAP never reaches and a section already in view
  // when GSAP builds all keep the achievement and the headline. Only a build that finds the section
  // still ahead hides them for the sequence to reveal (below).
  const [showAchievement, setShowAchievement] = useState(true);
  const [gsapUnavailable, setGsapUnavailable] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Reduced motion, or no GSAP to run the sequence with: the finished pipeline is rendered directly
  // via the derived values below.
  const finished = prefersReducedMotion || gsapUnavailable;

  // The sequence is driven by timers the ScrollTrigger callback schedules, and anything created
  // inside those timers runs after GSAP has left the context, so `ctx.revert()` never sees it.
  // Everything is tracked here instead, and cancelled when the section is entered again, on
  // unmount, or on a reduced-motion switch, rather than left to set state on a component that is
  // gone. Progress tweens only write the stage fills, which a restart empties (animatePipeline) and
  // the finished render fills, so killing them is enough; the reveal tweens are reverted, because
  // revert restores the inline styles they set, where kill would freeze them mid-flight and that
  // inline opacity would beat the class-driven state. A timer that comes due after the commit that
  // removed the section, but before the cleanup that cancels it, does nothing: its refs are
  // already null, and GSAP would warn about a null target (runWithGsap).
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const progressTweensRef = useRef<gsap.core.Tween[]>([]);
  const revealTweensRef = useRef<gsap.core.Tween[]>([]);
  const later = useCallback((callback: () => void, delayMs: number) => {
    timersRef.current.push(
      setTimeout(() => {
        if (sectionRef.current) callback();
      }, delayMs),
    );
  }, []);
  const cancelSequence = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    progressTweensRef.current.forEach((tween) => tween.kill());
    progressTweensRef.current = [];
    revealTweensRef.current.forEach((tween) => tween.revert());
    revealTweensRef.current = [];
  }, []);

  // Only ever called from the ScrollTrigger below, which exists once GSAP has loaded; it passes
  // GSAP in rather than this callback reaching for a module-level import. `reveal` is false when
  // the section was already in view as GSAP built it: the achievement and the headline stay as the
  // visitor saw them, and only the pipeline runs.
  const animatePipeline = useCallback(
    (gsap: Gsap, reveal: boolean) => {
      // Entering again (scrolling back up and down, or motion being allowed again) restarts the
      // run from pending instead of stacking on it or resuming a half-finished one.
      cancelSequence();
      // React rewrites a fill only when the transform it renders changes, and a stage that was
      // running renders the same empty fill as a pending one, so what its tween drew is emptied
      // here. Every stage renders empty once pending, so every fill starts from empty.
      fillRefs.forEach(({ current: fill }) => {
        if (fill) fill.style.transform = progressFillTransform(0);
      });
      setStageStates(pendingStages);
      setDeploymentStatus('idle');
      if (reveal) setShowAchievement(false);
      let delay = 0;

      pipelineStages.forEach((stage, index) => {
        // Start running
        later(() => {
          setStageStates((prev) => {
            const newStates = [...prev];
            newStates[index] = { status: 'running', progress: 0 };
            return newStates;
          });

          // Animate progress: each frame scales the fill directly, with no React render, and
          // state changes again only when the stage passes. The ref is read on every frame, not
          // once, so a frame always draws the fill React has mounted, and one after unmount draws
          // nothing.
          progressTweensRef.current.push(
            gsap.to(
              {},
              {
                duration: stage.duration,
                onUpdate: function () {
                  const fill = fillRefs[index].current;
                  if (fill) fill.style.transform = progressFillTransform(this.progress());
                },
                onComplete: () => {
                  setStageStates((prev) => {
                    const newStates = [...prev];
                    newStates[index] = { status: 'passed', progress: 100 };
                    return newStates;
                  });
                },
              },
            ),
          );
        }, delay * 1000);

        delay += stage.duration + 0.2;
      });

      // Deployment animation
      later(() => {
        setDeploymentStatus('deploying');
        revealTweensRef.current.push(
          gsap.fromTo(
            deployRef.current,
            { opacity: 0, scale: 0.9 },
            { opacity: 1, scale: 1, duration: 0.4 },
          ),
        );

        later(() => {
          setDeploymentStatus('success');

          // Achievement pops in
          later(() => {
            setShowAchievement(true);
            if (!reveal) return;
            revealTweensRef.current.push(
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
              ),
            );

            // Headline
            revealTweensRef.current.push(
              gsap.fromTo(
                headlineRef.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5 },
              ),
            );
          }, 300);
        }, 1000);
      }, delay * 1000);
    },
    [cancelSequence, fillRefs, later],
  );

  useEffect(() => {
    if (finished) return;

    // GSAP arrives on the visitor's first intent (load-gsap.ts); until then the section keeps its
    // starting state. The cleanup covers both orders: before the load it cancels the build,
    // after it reverts. A build that finds the section already in view finishes the entrance at
    // once rather than hide what the visitor is reading (isAlreadyReached). If GSAP never arrives,
    // the section renders its finished state, as under reduced motion.
    let ctx: gsap.Context | undefined;
    const cancelBuild = runWithGsap(
      ({ gsap, ScrollTrigger }) => {
        // The element, read once, never the ref: a soft navigation away from `/` nulls the ref
        // before this effect's cleanup runs (runWithGsap).
        const section = sectionRef.current;
        if (!section) return;
        const reached = isAlreadyReached(section);
        // Hidden for the reveal only while the section is still ahead of the visitor, so the hide
        // is never seen; one they can already see keeps them (the served state, hero-11).
        setShowAchievement(reached);
        ctx = gsap.context(() => {
          ScrollTrigger.create({
            trigger: section,
            start: 'top center',
            onEnter: () => animatePipeline(gsap, !reached),
          });

          // Initial fade in
          const fadeIn = gsap.fromTo(
            pipelineRef.current,
            { opacity: 0, y: 30 },
            {
              opacity: 1,
              y: 0,
              duration: 0.5,
              scrollTrigger: {
                trigger: section,
                start: 'top center',
              },
            },
          );

          if (reached) fadeIn.progress(1);
        }, section);
      },
      () => setGsapUnavailable(true),
    );

    return () => {
      cancelBuild();
      ctx?.revert();
      cancelSequence();
      // Back to the run's starting state, which the finished render hides. Once motion is allowed
      // again, a section not yet re-entered would otherwise show the interrupted stage running,
      // with no tween behind it, until its trigger fires.
      setStageStates(pendingStages);
      setDeploymentStatus('idle');
    };
  }, [animatePipeline, cancelSequence, finished]);

  // With reduced motion, or without GSAP, the pipeline is shown finished instead of running stage
  // by stage.
  const shownStageStates = finished ? passedStages : stageStates;
  const shownDeploymentStatus = finished ? 'success' : deploymentStatus;
  // The achievement and the headline start shown, and only a GSAP build that finds the section
  // still below the viewport hides them for the sequence to reveal. So the served HTML shows them
  // to a reader without JavaScript, and a page GSAP has not reached (no intent yet: a crawler that
  // renders but never scrolls, print before any scroll) keeps them. Opacity only, never rows, so
  // the layout does not move.
  const achievementVisible = finished || showAchievement;

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      className="flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="w-full max-w-3xl">
        {/* Phase Header: the section's heading and its name, ahead of the panels. The space keeps
            "PHASE 4" and the title apart in that name (a flex row lays it out as nothing), and
            `story-phases.test.tsx` holds the name. */}
        <h2 id={titleId} className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="rainbow">{storyTitles.gauntlet.phase}</AnimatedText>
          </span>{' '}
          <AnimatedText animation="gravity" className="font-mono text-sm text-[var(--muted)]">
            {storyTitles.gauntlet.title}
          </AnimatedText>
        </h2>

        {/* Pipeline */}
        <div ref={pipelineRef}>
          <HudPanel title="CI/CD PIPELINE">
            <div className="space-y-3">
              {pipelineStages.map((stage, index) => (
                <PipelineStage
                  key={stage.name}
                  name={stage.name}
                  status={shownStageStates[index].status}
                  progress={shownStageStates[index].progress}
                  fillRef={fillRefs[index]}
                />
              ))}
            </div>
          </HudPanel>
        </div>

        {/* Deployment Status. data-gauntlet marks the panels the tests look up. */}
        <div ref={deployRef} data-gauntlet="deploy" className="mt-6">
          {shownDeploymentStatus !== 'idle' && (
            <div
              className={`rounded-lg border p-6 text-center transition-all duration-500 ${
                shownDeploymentStatus === 'success'
                  ? 'border-[var(--status-ok)]/50 bg-[var(--status-ok)]/10'
                  : 'border-[var(--status-warn)]/50 bg-[var(--status-warn)]/10'
              }`}
            >
              {shownDeploymentStatus === 'deploying' ? (
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
        <div
          ref={achievementRef}
          data-reveal="achievement"
          data-gauntlet="achievement"
          className={`mt-6 ${achievementVisible ? '' : 'opacity-0'}`}
        >
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
          data-reveal="headline"
          className={`mt-16 text-center ${achievementVisible ? '' : 'opacity-0'}`}
        >
          <h3 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="glitch">{storyClosings.gauntlet.heading}</AnimatedText>
          </h3>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="highlight">
              {storyClosings.gauntlet.paragraphs[0]}
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
