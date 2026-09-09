'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { HudPanel, NotificationToast } from './hud-elements';
import { AnimatedText } from './animated-text';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

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
  const dashboardRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const protocolRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  const [visibleEvents, setVisibleEvents] = useState(0);
  const [alertStatus, setAlertStatus] = useState<'error' | 'resolved'>('error');
  const [showProtocol, setShowProtocol] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Every timer is tracked so unmounting (or a reduced-motion switch) cancels the sequence.
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((callback: () => void, delayMs: number) => {
    timersRef.current.push(setTimeout(callback, delayMs));
  }, []);

  const animateHealing = useCallback(() => {
    // Alert pulses
    later(() => {
      gsap.fromTo(
        alertRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.3 },
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
                gsap.fromTo(
                  protocolRef.current,
                  { opacity: 0, y: 20 },
                  { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' },
                );

                // Headline
                gsap.fromTo(
                  headlineRef.current,
                  { opacity: 0, y: 20 },
                  { opacity: 1, y: 0, duration: 0.5 },
                );
              }, 500);
            }, 500);
          }
        },
        800 + index * 400,
      );
    });
  }, [later]);

  useEffect(() => {
    // Reduced motion: the final state is rendered directly via the derived values below.
    if (prefersReducedMotion) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        once: true,
        onEnter: animateHealing,
      });

      // Dashboard fades in
      gsap.fromTo(
        dashboardRef.current,
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

    return () => {
      ctx.revert();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [animateHealing, prefersReducedMotion]);

  // With reduced motion the timeline is shown complete instead of animating in.
  const shownEvents = prefersReducedMotion ? healingTimeline.length : visibleEvents;
  const shownAlertStatus = prefersReducedMotion ? 'resolved' : alertStatus;
  const protocolVisible = prefersReducedMotion || showProtocol;

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
    <section ref={sectionRef} className="flex min-h-screen items-center justify-center px-6 py-24">
      <div className="w-full max-w-3xl">
        {/* Phase Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent)]/20 px-3 py-1 font-mono text-xs text-[var(--accent-text)]">
            <AnimatedText animation="elastic">PHASE 5</AnimatedText>
          </span>
          <AnimatedText animation="wave" className="font-mono text-sm text-[var(--muted)]">
            THE LOOP
          </AnimatedText>
        </div>

        {/* Dashboard */}
        <div ref={dashboardRef}>
          <HudPanel title="MONITORING DASHBOARD">
            <div className="mb-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <div className="text-2xl font-bold text-[var(--status-ok)]">99.9%</div>
                <div className="text-xs text-[var(--muted)]">UPTIME</div>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <div className="text-2xl font-bold text-[var(--accent-text)]">47ms</div>
                <div className="text-xs text-[var(--muted)]">AVG LATENCY</div>
              </div>
              <div className="rounded-lg bg-[var(--background)] p-3 text-center">
                <div className="text-2xl font-bold text-[var(--status-warn)]">3</div>
                <div className="text-xs text-[var(--muted)]">AUTO-FIXES TODAY</div>
              </div>
            </div>

            {/* Alert */}
            <div
              ref={alertRef}
              className={`rounded-lg border p-4 transition-all duration-500 ${
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
        <div ref={timelineRef} className="mt-6">
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
        <div ref={protocolRef} className={`mt-6 ${protocolVisible ? '' : 'opacity-0'}`}>
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
          className={`mt-16 text-center ${protocolVisible ? '' : 'opacity-0'}`}
        >
          <h2 className="mb-3 text-2xl font-bold md:text-4xl">
            <AnimatedText animation="morse">
              This happened at 3:14am. Nobody got paged.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="stagger-up">
              The system diagnosed itself, wrote a fix, and waited for a human to approve.
              That&apos;s the future I build.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
