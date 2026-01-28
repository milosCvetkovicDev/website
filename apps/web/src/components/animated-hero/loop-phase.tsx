'use client';

import { useEffect, useRef, useState } from 'react';
import { gsap, ScrollTrigger } from './use-gsap-scroll';
import { HudPanel, NotificationToast } from './hud-elements';
import { AnimatedText } from './animated-text';

const healingTimeline = [
  { time: '03:14 AM', event: 'NullPointerException in /api/orders', type: 'error' },
  { time: '03:14 AM', event: 'Agent activated', type: 'info' },
  { time: '03:15 AM', event: 'Root cause identified: missing null check', type: 'info' },
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    gsap.registerPlugin(ScrollTrigger);

    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      setVisibleEvents(healingTimeline.length);
      setAlertStatus('resolved');
      setShowProtocol(true);
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: sectionRef.current,
        start: 'top center',
        onEnter: () => animateHealing(),
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
        }
      );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const animateHealing = () => {
    // Alert pulses
    setTimeout(() => {
      gsap.fromTo(
        alertRef.current,
        { opacity: 0, scale: 0.9 },
        { opacity: 1, scale: 1, duration: 0.3 }
      );
    }, 500);

    // Timeline events appear one by one
    healingTimeline.forEach((_, index) => {
      setTimeout(() => {
        setVisibleEvents(index + 1);

        // Resolve alert when we hit the success events
        if (index === healingTimeline.length - 1) {
          setTimeout(() => {
            setAlertStatus('resolved');

            // Show protocol notification
            setTimeout(() => {
              setShowProtocol(true);
              gsap.fromTo(
                protocolRef.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5, ease: 'back.out(1.7)' }
              );

              // Headline
              gsap.fromTo(
                headlineRef.current,
                { opacity: 0, y: 20 },
                { opacity: 1, y: 0, duration: 0.5 }
              );
            }, 500);
          }, 500);
        }
      }, 800 + index * 400);
    });
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      default:
        return 'text-[var(--muted)]';
    }
  };

  return (
    <section
      ref={sectionRef}
      className="min-h-screen flex items-center justify-center px-6 py-24"
    >
      <div className="w-full max-w-3xl">
        {/* Phase Header */}
        <div className="flex items-center gap-3 mb-8">
          <span className="px-3 py-1 bg-[var(--accent)]/20 text-[var(--accent)] text-xs font-mono rounded-full">
            <AnimatedText animation="elastic">PHASE 5</AnimatedText>
          </span>
          <AnimatedText animation="wave" className="text-sm font-mono text-[var(--muted)]">
            THE LOOP
          </AnimatedText>
        </div>

        {/* Dashboard */}
        <div ref={dashboardRef}>
          <HudPanel title="MONITORING DASHBOARD">
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="text-center p-3 rounded-lg bg-[var(--background)]">
                <div className="text-2xl font-bold text-green-400">99.9%</div>
                <div className="text-xs text-[var(--muted)]">UPTIME</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--background)]">
                <div className="text-2xl font-bold text-[var(--accent)]">47ms</div>
                <div className="text-xs text-[var(--muted)]">AVG LATENCY</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-[var(--background)]">
                <div className="text-2xl font-bold text-yellow-400">3</div>
                <div className="text-xs text-[var(--muted)]">AUTO-FIXES TODAY</div>
              </div>
            </div>

            {/* Alert */}
            <div
              ref={alertRef}
              className={`p-4 rounded-lg border transition-all duration-500 ${
                alertStatus === 'error'
                  ? 'border-red-500/50 bg-red-500/10'
                  : 'border-green-500/50 bg-green-500/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-3 h-3 rounded-full ${
                    alertStatus === 'error'
                      ? 'bg-red-500 animate-pulse'
                      : 'bg-green-500'
                  }`}
                />
                <span
                  className={`font-mono text-sm ${
                    alertStatus === 'error' ? 'text-red-400' : 'text-green-400'
                  }`}
                >
                  {alertStatus === 'error' ? 'ERROR DETECTED' : 'RESOLVED'}
                </span>
              </div>
            </div>
          </HudPanel>
        </div>

        {/* Healing Timeline */}
        <div ref={timelineRef} className="mt-6">
          <HudPanel title="SELF-HEALING LOG">
            <div className="space-y-2 font-mono text-sm">
              {healingTimeline.slice(0, visibleEvents).map((event, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 animate-fade-in"
                >
                  <span className="text-[var(--muted)] shrink-0">{event.time}</span>
                  <span className="text-[var(--muted)]">—</span>
                  <span className={getEventColor(event.type)}>{event.event}</span>
                </div>
              ))}
              {visibleEvents > 0 && visibleEvents < healingTimeline.length && (
                <div className="flex items-center gap-2 text-[var(--muted)]">
                  <span className="w-2 h-2 bg-[var(--accent)] rounded-full animate-pulse" />
                  <span>Processing...</span>
                </div>
              )}
            </div>
          </HudPanel>
        </div>

        {/* Protocol Active */}
        <div ref={protocolRef} className={`mt-6 ${showProtocol ? '' : 'opacity-0'}`}>
          <NotificationToast type="success">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔄</span>
              <div>
                <div className="font-semibold">SELF-HEALING PROTOCOL ACTIVE</div>
                <div className="text-sm opacity-80">
                  System diagnosed and fixed the issue autonomously
                </div>
              </div>
            </div>
          </NotificationToast>
        </div>

        {/* Headline */}
        <div
          ref={headlineRef}
          className={`mt-16 text-center ${showProtocol ? '' : 'opacity-0'}`}
        >
          <h2 className="text-2xl md:text-4xl font-bold mb-3">
            <AnimatedText animation="morse">
              This happened at 3:14am. Nobody got paged.
            </AnimatedText>
          </h2>
          <p className="text-lg text-[var(--muted)]">
            <AnimatedText animation="stagger-up">
              The system diagnosed itself, wrote a fix, and waited for a human to approve. That&apos;s the future I build.
            </AnimatedText>
          </p>
        </div>
      </div>
    </section>
  );
}
