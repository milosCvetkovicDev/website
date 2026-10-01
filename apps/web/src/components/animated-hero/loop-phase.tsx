'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isAlreadyReached, runWithGsap, type Gsap } from './load-gsap';
import { HudPanel, NotificationToast } from './hud-elements';
import { AnimatedText } from './animated-text';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { useStoryVisibility } from '@/hooks/use-story-visibility';
import { storyClosings, storyTitles } from '@/data/pages/home';

const healingTimeline = [
  {
    time: '03:14 AM',
    event: 'NullPointerException in /api/orders',
    type: 'error',
  },
  { time: '03:14 AM', event: 'Agent activated', type: 'info' },
  {
    time: '03:15 AM',
    event: 'Root cause identified: missing null check',
    type: 'info',
  },
  { time: '03:16 AM', event: 'Fix generated', type: 'success' },
  { time: '03:16 AM', event: 'PR #847 opened', type: 'success' },
  { time: '03:17 AM', event: 'Tests passing', type: 'success' },
  { time: '03:17 AM', event: 'Awaiting human approval', type: 'info' },
];

export function LoopPhase() {
  const sectionRef = useRef<HTMLDivElement>(null);
  // Pauses the section's endless CSS animations while it is out of view (globals.css).
  useStoryVisibility(sectionRef);
  const titleId = useId();
  const dashboardRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const protocolRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  const [visibleEvents, setVisibleEvents] = useState(0);
  const [alertStatus, setAlertStatus] = useState<'error' | 'resolved'>('error');
  // Shown to begin with, and hidden for the sequence to reveal only by a build that finds the
  // section still ahead of the visitor: GauntletPhase's achievement says why.
  const [showProtocol, setShowProtocol] = useState(true);
  const [gsapUnavailable, setGsapUnavailable] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  // Reduced motion, or no GSAP to run the sequence with: the final state is rendered directly via
  // the derived values below.
  const finished = prefersReducedMotion || gsapUnavailable;

  // The sequence is driven by timers the ScrollTrigger callback schedules, and the reveals those
  // timers create run after GSAP has left the context, so `ctx.revert()` never sees them. Both are
  // tracked here instead, and cancelled when a run starts, on unmount and on a reduced-motion
  // switch, as in GauntletPhase. The reveals are reverted rather than killed, finished ones as well
  // as those in flight: revert restores the inline styles they set, where kill would freeze them
  // mid-flight and that inline opacity would beat the class-driven state, which alone decides
  // whether the toast and the headline show once the run is over. A timer that comes due after the
  // commit that removed the section, but before the cleanup that cancels it, does nothing: `later`
  // checks the section's ref, which is null by then along with the three it contains, where GSAP
  // would warn about a null target (runWithGsap).
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
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
    revealTweensRef.current.forEach((tween) => tween.revert());
    revealTweensRef.current = [];
  }, []);

  // Only ever called from the ScrollTrigger below, which exists once GSAP has loaded; it passes
  // GSAP in rather than this callback reaching for a module-level import. `reveal` is false when
  // the section was already in view as GSAP built it: the toast and the headline stay as the
  // visitor saw them, and only the log runs, with the alert's pulse as its first beat.
  const animateHealing = useCallback(
    (gsap: Gsap, reveal: boolean) => {
      // The trigger is `once: true`, but a rebuilt one (motion allowed again) fires in view, so the
      // reset lives here rather than in the effect: every run starts from an empty log, a live
      // alert and, where it is revealed, no toast, instead of playing over a finished run.
      cancelSequence();
      setVisibleEvents(0);
      setAlertStatus('error');
      if (reveal) setShowProtocol(false);

      // Alert pulses
      later(() => {
        revealTweensRef.current.push(
          gsap.fromTo(
            alertRef.current,
            { opacity: 0, scale: 0.9 },
            { opacity: 1, scale: 1, duration: 0.3 },
          ),
        );
      }, 500);

      // Timeline events appear one by one
      healingTimeline.forEach((_, index) => {
        later(
          () => {
            setVisibleEvents(index + 1);

            // Resolve alert when we hit the success events
            if (index === healingTimeline.length - 1) {
              later(() => {
                setAlertStatus('resolved');

                // Show protocol notification
                later(() => {
                  setShowProtocol(true);
                  if (!reveal) return;
                  revealTweensRef.current.push(
                    gsap.fromTo(
                      protocolRef.current,
                      { opacity: 0, y: 20 },
                      { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' },
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
                }, 500);
              }, 500);
            }
          },
          800 + index * 400,
        );
      });
    },
    [cancelSequence, later],
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
        // Hidden for the reveal only while the section is still ahead of the visitor (hero-11).
        setShowProtocol(reached);
        // A rebuild (motion allowed again) must not show a cancelled run's rows or its RESOLVED
        // banner while the new trigger waits for the section to enter: the log starts empty here,
        // and animateHealing starts it empty again when the run begins.
        setVisibleEvents(0);
        setAlertStatus('error');
        ctx = gsap.context(() => {
          ScrollTrigger.create({
            trigger: section,
            start: 'top center',
            once: true,
            onEnter: () => animateHealing(gsap, !reached),
          });

          // Dashboard fades in
          const fadeIn = gsap.fromTo(
            dashboardRef.current,
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
    };
  }, [animateHealing, cancelSequence, finished]);

  // With reduced motion, or without GSAP, the timeline is shown complete instead of animating in.
  const shownEvents = finished ? healingTimeline.length : visibleEvents;
  const shownAlertStatus = finished ? 'resolved' : alertStatus;
  // Shown until a GSAP build finds the section still below the viewport, so the served HTML and a
  // page GSAP has not reached keep the toast and the headline; GauntletPhase's achievement says
  // more.
  const protocolVisible = finished || showProtocol;

  const getEventColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-[var(--status-err)]';
      case 'success':
        return 'text-[var(--status-ok)]';
      default:
        return 'text-[var(--muted)]';
    }
  };

  return (
    <section
      ref={sectionRef}
      aria-labelledby={titleId}
      className="flex min-h-screen items-center justify-center px-4 py-16 sm:px-6 sm:py-24"
    >
      <div className="w-full max-w-3xl">
        {/* Phase Header: the section's heading and its name, ahead of the panels. The space keeps
            "PHASE 5" and the title apart in that name (a flex row lays it out as nothing), and
            `story-phases.test.tsx` holds the name. */}
        <h2 id={titleId} className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="elastic">{storyTitles.loop.phase}</AnimatedText>
          </span>{' '}
          <AnimatedText animation="wave" className="font-mono text-sm text-[var(--muted)]">
            {storyTitles.loop.title}
          </AnimatedText>
        </h2>

        {/* Dashboard */}
        <div ref={dashboardRef}>
          <HudPanel title="MONITORING DASHBOARD">
            <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
              <div className="rounded-lg bg-[var(--background)] p-2 text-center sm:p-3">
                <div className="text-xl font-bold text-[var(--status-ok)] sm:text-2xl">99.9%</div>
                <div className="text-xs text-[var(--muted)]">UPTIME</div>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-2 text-center sm:p-3">
                <div className="text-xl font-bold text-[var(--accent-text)] sm:text-2xl">47ms</div>
                <div className="text-xs text-[var(--muted)]">AVG LATENCY</div>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-2 text-center sm:p-3">
                <div className="text-xl font-bold text-[var(--status-warn)] sm:text-2xl">3</div>
                <div className="text-xs text-[var(--muted)]">AUTO-FIXES TODAY</div>
              </div>
            </div>

            {/* Alert. transition-colors only: GSAP's pulse writes its opacity and transform.
                data-loop marks it for the tests to find. */}
            <div
              ref={alertRef}
              data-loop="alert"
              className={`rounded-lg border p-4 transition-colors duration-500 ${
                shownAlertStatus === 'error'
                  ? 'border-[var(--status-err)]/50 bg-[var(--status-err)]/10'
                  : 'border-[var(--status-ok)]/50 bg-[var(--status-ok)]/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    shownAlertStatus === 'error'
                      ? 'animate-pulse bg-[var(--status-err)]'
                      : 'bg-[var(--status-ok)]'
                  }`}
                />
                <span
                  className={`font-mono text-sm ${
                    shownAlertStatus === 'error'
                      ? 'text-[var(--status-err)]'
                      : 'text-[var(--status-ok)]'
                  }`}
                >
                  {shownAlertStatus === 'error' ? 'ERROR DETECTED' : 'RESOLVED'}
                </span>
              </div>
            </div>
          </HudPanel>
        </div>

        {/* Healing Timeline */}
        <div className="mt-6">
          <HudPanel title="SELF-HEALING LOG">
            <div className="space-y-2 font-mono text-sm">
              {healingTimeline.slice(0, shownEvents).map((event, index) => (
                <div key={index} className="animate-fade-in flex items-start gap-3">
                  <span className="shrink-0 text-[var(--muted)]">{event.time}</span>
                  <span className="text-[var(--muted)]">—</span>
                  <span className={getEventColor(event.type)}>{event.event}</span>
                </div>
              ))}
              {shownEvents > 0 && shownEvents < healingTimeline.length && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
          </HudPanel>
        </div>

        {/* Protocol Active */}
        <div
          ref={protocolRef}
          data-reveal="protocol"
          className={`mt-6 ${protocolVisible ? '' : 'opacity-0'}`}
        >
          <NotificationToast type="success">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔄</span>
              <div>
                <div className="font-semibold">SELF-HEALING PROTOCOL ACTIVE</div>
                <div className="text-sm">System diagnosed and fixed the issue autonomously</div>
              </div>
            </div>
          </NotificationToast>
        </div>

        {/* Headline */}
        <div
          ref={headlineRef}
          data-reveal="headline"
          className={`mt-16 text-center ${protocolVisible ? '' : 'opacity-0'}`}
        >
          <h3 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="morse">{storyClosings.loop.heading}</AnimatedText>
          </h3>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="stagger-up">{storyClosings.loop.paragraphs[0]}</AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
