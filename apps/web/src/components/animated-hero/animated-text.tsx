'use client';

import { useRef, useCallback, useState, memo, useMemo, useEffect, type RefObject } from 'react';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { isGsapRequested, runWithGsap, type Gsap } from './load-gsap';
import { useWithGsap } from './use-with-gsap';

// Every handler below runs its GSAP work through `withGsap` (use-with-gsap.ts): GSAP loads after
// hydration, and a hover that lands before it has must still play once it arrives if the pointer
// is still there. So each enter-only effect also cancels on leave (`cancelPending`), which does
// nothing once GSAP has loaded, and an enter still waiting when the pointer leaves never plays.
// The checks that decide whether to start (`isActive()`, the busy flags) sit inside the callback
// so that they are read when the tween is built. Under `prefers-reduced-motion: reduce` every
// handler is inert (`useHoverGsap`), and the markup is the same either way.

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The preference as the browser reports it at this moment. `usePrefersReducedMotion` reads `false`
 * until hydration has finished (ADR 0006), so a hover in that window would otherwise play for a
 * visitor who asked for less motion. Read in handlers only, never in render.
 */
const reducedMotionNow = () =>
  typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches;

/** What a variant is playing: one timeline or tween, or one per letter. */
type Playing = RefObject<gsap.core.Animation | gsap.core.Animation[] | null>;

/**
 * `useWithGsap` behind the visitor's reduced-motion preference, read here once for every variant.
 * Under `reduce` the returned `withGsap` returns before it asks for GSAP, so a hover or a pointer
 * move creates no tween and changes nothing drawn (WCAG 2.3.3), and a callback still waiting for
 * GSAP when the preference is switched on is dropped. Nothing rendered may depend on the value: it
 * is `false` during hydration (ADR 0006), so markup that did would be rewritten right after it.
 *
 * `playing` is the variant's ref to what its hover started. When the preference is switched on
 * while that is still running, it jumps to its end, where every variant is back at rest, and its
 * callbacks run on the way (the rainbow's colour clears, the busy flags reset), rather than playing
 * on after the visitor asked for less motion. Only an animation still on GSAP's timeline is jumped:
 * one that finished or was killed has left it, and would replay its callbacks.
 */
function useHoverGsap(playing?: Playing) {
  const reduceMotion = usePrefersReducedMotion();
  const { withGsap, cancelPending } = useWithGsap();

  useEffect(() => {
    if (!reduceMotion) return;
    cancelPending();
    const current = playing?.current;
    const animations = Array.isArray(current) ? current : current ? [current] : [];
    for (const animation of animations) {
      if (animation.parent) animation.progress(1);
      animation.kill();
    }
  }, [reduceMotion, cancelPending, playing]);

  const withMotion = useCallback(
    (callback: (gsap: Gsap) => void) => {
      if (reduceMotion || reducedMotionNow()) return;
      withGsap(callback);
    },
    [reduceMotion, withGsap],
  );

  return { withGsap: withMotion, cancelPending, reduceMotion };
}

type AnimationType =
  | 'scramble'
  | 'wave'
  | 'magnetic'
  | 'scatter'
  | 'glitch'
  | 'typewriter'
  | 'elastic'
  | 'stagger-up'
  | 'rainbow'
  | 'perspective'
  | 'gravity'
  | 'blur-reveal'
  | 'highlight'
  | 'morse';

// Restrict Tag type to common HTML elements to avoid TypeScript complexity
type AllowedTag = 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'div';

interface AnimatedTextProps {
  children: string;
  animation: AnimationType;
  className?: string;
  as?: AllowedTag;
  delay?: number;
}

// Characters for scramble effect
const scrambleChars =
  '!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Scramble text effect - characters shuffle then reveal
const ScrambleText = memo(function ScrambleText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const [displayText, setDisplayText] = useState(text);
  const animationRef = useRef<gsap.core.Tween | null>(null);
  const originalText = useRef(text);
  const { withGsap } = useHoverGsap(animationRef);

  useEffect(() => {
    return () => {
      animationRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (animationRef.current?.isActive()) return;
      animationRef.current?.kill();

      // By code point, so a character outside the BMP is never split into two halves.
      const chars = Array.from(text);

      animationRef.current = gsap.to(
        {},
        {
          duration: text.length * 0.05,
          onUpdate: function () {
            const progress = this.progress();
            const revealIndex = Math.floor(progress * chars.length);

            const newText = chars
              .map((char, i) => {
                if (char === ' ') return ' ';
                if (i < revealIndex) return char;
                return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
              })
              .join('');

            setDisplayText(newText);
          },
          onComplete: () => setDisplayText(originalText.current),
        },
      );
    });
  }, [text, withGsap]);

  // It needs no GSAP of its own, but it goes through `withGsap` too: a leave that lands before the
  // load replaces the enter still waiting, so the scramble never starts after the pointer has gone.
  const handleMouseLeave = useCallback(() => {
    withGsap(() => {
      animationRef.current?.kill();
      setDisplayText(originalText.current);
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden="true" className="font-mono">
        {displayText}
      </span>
    </Tag>
  );
});

// Helper to split text into words while keeping characters animatable
function splitIntoWords(text: string) {
  return text.split(/(\s+)/).filter(Boolean);
}

/**
 * The text of the six variants that animate letter by letter. Each letter is its own `inline-block`
 * span for GSAP to move, grouped by word so that a line never breaks inside one. Accessible-name
 * computation puts a space around every such box, which named the story's headlines
 * `M o s t b u g s …`, so that copy is `aria-hidden` and assistive technology reads the visually
 * hidden one beside it, with the text whole. Not `aria-label`: it is prohibited on a generic span.
 * The hidden copy is `select-none`, so copying the line gives the sentence once, as it is drawn.
 */
function SplitText({
  text,
  charsRef,
  wordClassName = 'inline-block whitespace-nowrap',
}: {
  text: string;
  charsRef: RefObject<(HTMLSpanElement | null)[]>;
  wordClassName?: string;
}) {
  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <>
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden="true">
        {words.map((word, wordIdx) => {
          if (/^\s+$/.test(word)) {
            return <span key={wordIdx}>{word}</span>;
          }
          return (
            <span key={wordIdx} className={wordClassName}>
              {Array.from(word).map((char) => {
                const idx = charIndex++;
                return (
                  <span
                    key={idx}
                    ref={(el) => {
                      charsRef.current[idx] = el;
                    }}
                    className="inline-block"
                  >
                    {char}
                  </span>
                );
              })}
            </span>
          );
        })}
      </span>
    </>
  );
}

// Wave effect - characters bob up and down in sequence
const WaveText = memo(function WaveText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (timelineRef.current?.isActive()) return;
      timelineRef.current?.kill();

      timelineRef.current = gsap.timeline();
      charsRef.current.forEach((char, i) => {
        if (char) {
          timelineRef
            .current!.to(
              char,
              {
                y: -8,
                duration: 0.2,
                ease: 'power2.out',
              },
              i * 0.03,
            )
            .to(
              char,
              {
                y: 0,
                duration: 0.3,
                ease: 'elastic.out(1, 0.3)',
              },
              i * 0.03 + 0.2,
            );
        }
      });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText text={text} charsRef={charsRef} />
    </Tag>
  );
});

// Magnetic effect - text follows cursor slightly
const MagneticText = memo(function MagneticText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const { withGsap, reduceMotion } = useHoverGsap();

  // The pull stays until the leave springs it back, and under `reduce` the leave does nothing. So a
  // preference switched on while the text is pulled puts it back at once, with no spring. Until
  // the page has asked for GSAP no pull can exist, and asking here would arm the load for a visitor
  // whose hovers can never use it (`isGsapRequested`). No gsap.context: reverting one would undo
  // the clearProps and put the pull back.
  useEffect(() => {
    if (!reduceMotion || !isGsapRequested()) return;
    return runWithGsap(({ gsap }) => {
      const el = textRef.current;
      // Untouched text is left alone, so a mount under `reduce` renders exactly what it would without.
      if (!el || (!el.style.transform && gsap.getTweensOf(el).length === 0)) return;
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform' });
    });
  }, [reduceMotion]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || !textRef.current) return;

      // Measured now, pointer and box alike: a move that waits for GSAP must aim where the pointer
      // was relative to the text when it moved, whatever has scrolled since.
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = (e.clientX - centerX) * 0.15;
      const deltaY = (e.clientY - centerY) * 0.15;

      // Only the latest move waits for the load: each one replaces the one before it.
      withGsap((gsap) => {
        if (!textRef.current) return;
        gsap.to(textRef.current, {
          x: deltaX,
          y: deltaY,
          duration: 0.3,
          ease: 'power2.out',
          overwrite: 'auto',
        });
      });
    },
    [withGsap],
  );

  const handleMouseLeave = useCallback(() => {
    withGsap((gsap) => {
      if (!textRef.current) return;
      gsap.to(textRef.current, {
        x: 0,
        y: 0,
        duration: 0.5,
        ease: 'elastic.out(1, 0.3)',
      });
    });
  }, [withGsap]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={containerRef as any}
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <span ref={textRef} className="inline-block">
        {text}
      </span>
    </Tag>
  );
});

// Scatter effect - characters explode outward then return
const ScatterText = memo(function ScatterText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelinesRef = useRef<gsap.core.Timeline[]>([]);
  const isAnimatingRef = useRef(false);
  // Counted as SplitText splits, by code point.
  const totalChars = useMemo(() => Array.from(text.replace(/\s/g, '')).length, [text]);
  const { withGsap, cancelPending } = useHoverGsap(timelinesRef);

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      timelinesRef.current = [];

      charsRef.current.forEach((char, i) => {
        if (char) {
          const angle = (i / totalChars) * Math.PI * 2;
          const distance = 15 + Math.random() * 10;

          const tl = gsap.timeline({
            onComplete: () => {
              if (i === totalChars - 1) isAnimatingRef.current = false;
            },
          });
          timelinesRef.current.push(tl);
          tl.to(char, {
            x: Math.cos(angle) * distance,
            y: Math.sin(angle) * distance,
            rotation: (Math.random() - 0.5) * 30,
            duration: 0.3,
            ease: 'power2.out',
          }).to(char, {
            x: 0,
            y: 0,
            rotation: 0,
            duration: 0.5,
            ease: 'elastic.out(1, 0.3)',
          });
        }
      });
    });
  }, [totalChars, withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText text={text} charsRef={charsRef} />
    </Tag>
  );
});

/**
 * The glitch's split, drawn while it plays as two offset shadows of the text itself rather than as
 * copies of it: decoration, like the SVG frames, and in theme tokens that reach AA as text on the
 * accent pill and on the page in both themes (ADR 0010, 0011; hero-contrast.spec.ts measures them).
 */
const GLITCH_OFFSETS = { textShadow: '-2px 0 var(--accent-text), 2px 0 var(--status-err)' };

// Glitch effect - RGB split and shake
const GlitchText = memo(function GlitchText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const containerRef = useRef<HTMLElement>(null);
  const [isGlitching, setIsGlitching] = useState(false);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      // A hover queued behind GSAP's load can run after a navigation has removed the heading: read
      // the ref once and do nothing when it is null (runWithGsap).
      const el = containerRef.current;
      if (!el || timelineRef.current?.isActive()) return;
      setIsGlitching(true);

      timelineRef.current = gsap.timeline({
        onComplete: () => setIsGlitching(false),
      });

      // Quick glitch bursts
      for (let i = 0; i < 5; i++) {
        timelineRef.current.to(el, {
          x: (Math.random() - 0.5) * 4,
          duration: 0.05,
        });
      }
      timelineRef.current.to(el, {
        x: 0,
        duration: 0.1,
      });
    });
  }, [withGsap]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={containerRef as any}
      className={`relative inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span style={isGlitching ? GLITCH_OFFSETS : undefined}>{text}</span>
    </Tag>
  );
});

// Typewriter effect - characters reveal one by one
const TypewriterText = memo(function TypewriterText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const [visibleCount, setVisibleCount] = useState(text.length);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(tweenRef);

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (tweenRef.current?.isActive()) return;
      tweenRef.current?.kill();

      setVisibleCount(0);

      tweenRef.current = gsap.to(
        { count: 0 },
        {
          count: text.length,
          duration: text.length * 0.04,
          ease: 'none',
          onUpdate: function () {
            setVisibleCount(Math.floor(this.targets()[0].count));
          },
        },
      );
    });
  }, [text.length, withGsap]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden="true">
        <span>{text.slice(0, visibleCount)}</span>
        <span className="opacity-0">{text.slice(visibleCount)}</span>
        {visibleCount < text.length && (
          <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-[var(--accent)]" />
        )}
      </span>
    </Tag>
  );
});

// Elastic stretch effect
const ElasticText = memo(function ElasticText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (!textRef.current || timelineRef.current?.isActive()) return;

      timelineRef.current = gsap
        .timeline()
        .to(textRef.current, {
          scaleX: 1.1,
          scaleY: 0.9,
          duration: 0.15,
          ease: 'power2.out',
        })
        .to(textRef.current, {
          scaleX: 0.95,
          scaleY: 1.05,
          duration: 0.15,
          ease: 'power2.out',
        })
        .to(textRef.current, {
          scaleX: 1,
          scaleY: 1,
          duration: 0.4,
          ease: 'elastic.out(1, 0.3)',
        });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span ref={textRef} className="inline-block origin-center">
        {text}
      </span>
    </Tag>
  );
});

// Stagger up effect - characters slide up with stagger
const StaggerUpText = memo(function StaggerUpText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelinesRef = useRef<gsap.core.Timeline[]>([]);
  const isAnimatingRef = useRef(false);
  const { withGsap, cancelPending } = useHoverGsap(timelinesRef);

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      timelinesRef.current = [];

      const totalChars = charsRef.current.filter(Boolean).length;
      let completedCount = 0;

      charsRef.current.forEach((char, i) => {
        if (char) {
          const tl = gsap.timeline({
            onComplete: () => {
              completedCount++;
              if (completedCount >= totalChars) {
                isAnimatingRef.current = false;
              }
            },
          });
          timelinesRef.current.push(tl);
          tl.set(char, { y: 0 })
            .to(char, {
              y: -20,
              opacity: 0,
              duration: 0.15,
              delay: i * 0.02,
              ease: 'power2.in',
            })
            .set(char, { y: 20 })
            .to(char, {
              y: 0,
              opacity: 1,
              duration: 0.25,
              ease: 'power2.out',
            });
        }
      });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText
        text={text}
        charsRef={charsRef}
        wordClassName="inline-block overflow-hidden whitespace-nowrap"
      />
    </Tag>
  );
});

/**
 * The rainbow's letter colours: theme tokens that reach AA as text on the accent pill in both themes
 * (hero-contrast.spec.ts measures them). Each is set and cleared at a point on the timeline rather
 * than tweened: GSAP interpolates rgb, hsl, hex and named colours, and the status tokens compute to
 * `lab()` in the browsers that support it.
 */
const RAINBOW_TOKENS = ['--status-err', '--status-warn', '--status-ok', '--accent-text'];

// Rainbow color cycle effect
const RainbowText = memo(function RainbowText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (timelineRef.current?.isActive()) return;
      timelineRef.current?.kill();

      timelineRef.current = gsap.timeline();

      charsRef.current.forEach((char, i) => {
        if (char) {
          const start = i * 0.02;
          const token = RAINBOW_TOKENS[i % RAINBOW_TOKENS.length];
          timelineRef
            .current!.call(() => char.style.setProperty('color', `var(${token})`), undefined, start)
            .to(char, { scale: 1.2, duration: 0.1 }, start)
            .to(char, { scale: 1, duration: 0.3 }, start + 0.2)
            .call(() => char.style.removeProperty('color'), undefined, start + 0.5);
        }
      });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText text={text} charsRef={charsRef} />
    </Tag>
  );
});

// 3D perspective flip effect
const PerspectiveText = memo(function PerspectiveText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (!textRef.current || timelineRef.current?.isActive()) return;

      timelineRef.current = gsap
        .timeline()
        .to(textRef.current, {
          rotateX: -90,
          opacity: 0,
          duration: 0.2,
          ease: 'power2.in',
        })
        .set(textRef.current, { rotateX: 90 })
        .to(textRef.current, {
          rotateX: 0,
          opacity: 1,
          duration: 0.3,
          ease: 'back.out(1.5)',
        });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      style={{ perspective: '500px' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span ref={textRef} className="inline-block" style={{ transformStyle: 'preserve-3d' }}>
        {text}
      </span>
    </Tag>
  );
});

// Gravity drop effect - characters fall and bounce
const GravityText = memo(function GravityText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelinesRef = useRef<gsap.core.Timeline[]>([]);
  const isAnimatingRef = useRef(false);
  const { withGsap, cancelPending } = useHoverGsap(timelinesRef);

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      timelinesRef.current = [];

      let completedCount = 0;
      const totalChars = charsRef.current.filter(Boolean).length;

      charsRef.current.forEach((char) => {
        if (char) {
          const delay = Math.random() * 0.2;
          const tl = gsap.timeline({
            onComplete: () => {
              completedCount++;
              if (completedCount >= totalChars) isAnimatingRef.current = false;
            },
          });
          timelinesRef.current.push(tl);
          tl.to(char, {
            y: 20,
            opacity: 0.5,
            duration: 0.15,
            delay,
            ease: 'power2.in',
          }).to(char, {
            y: 0,
            opacity: 1,
            duration: 0.4,
            ease: 'bounce.out',
          });
        }
      });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText text={text} charsRef={charsRef} />
    </Tag>
  );
});

// Blur reveal effect - text starts blurry and sharpens
const BlurRevealText = memo(function BlurRevealText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(timelineRef);

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (!textRef.current || timelineRef.current?.isActive()) return;

      timelineRef.current = gsap
        .timeline()
        .to(textRef.current, {
          filter: 'blur(8px)',
          opacity: 0.3,
          scale: 1.05,
          duration: 0.15,
        })
        .to(textRef.current, {
          filter: 'blur(0px)',
          opacity: 1,
          scale: 1,
          duration: 0.4,
          ease: 'power2.out',
        });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span ref={textRef} className="inline-block">
        {text}
      </span>
    </Tag>
  );
});

// Highlight scan effect - scanning line passes through
const HighlightText = memo(function HighlightText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const [isAnimating, setIsAnimating] = useState(false);
  const animatingRef = useRef(false);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const { withGsap, cancelPending } = useHoverGsap(tweenRef);

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (animatingRef.current) return;
      animatingRef.current = true;
      setIsAnimating(true);

      tweenRef.current = gsap.to(
        {},
        {
          duration: 0.6,
          onComplete: () => {
            setIsAnimating(false);
            animatingRef.current = false;
          },
        },
      );
    });
  }, [withGsap]);

  return (
    <Tag
      className={`relative inline-block cursor-pointer overflow-hidden ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <span className="relative z-10">{text}</span>
      {isAnimating && (
        <span
          className="animate-highlight-scan absolute inset-0 z-0 bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent"
          aria-hidden="true"
        />
      )}
    </Tag>
  );
});

// Morse code blink effect - characters blink in sequence
const MorseText = memo(function MorseText({
  text,
  className,
  Tag,
}: {
  text: string;
  className?: string;
  Tag: AllowedTag;
}) {
  const charsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const timelinesRef = useRef<gsap.core.Timeline[]>([]);
  const isAnimatingRef = useRef(false);
  const { withGsap, cancelPending } = useHoverGsap(timelinesRef);

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    withGsap((gsap) => {
      if (isAnimatingRef.current) return;
      isAnimatingRef.current = true;
      timelinesRef.current = [];

      const totalChars = charsRef.current.filter(Boolean).length;
      let completedAnimations = 0;

      charsRef.current.forEach((char, i) => {
        if (char) {
          // Random morse-like pattern
          const pattern = Math.random() > 0.5 ? [0.05, 0.1] : [0.1, 0.05, 0.05];
          let delay = i * 0.05;

          pattern.forEach((dur, patternIdx) => {
            const tl = gsap.timeline({
              onComplete: () => {
                if (patternIdx === pattern.length - 1) {
                  completedAnimations++;
                  if (completedAnimations >= totalChars) {
                    isAnimatingRef.current = false;
                  }
                }
              },
            });
            timelinesRef.current.push(tl);
            tl.to(char, {
              opacity: 0.2,
              duration: dur,
              delay,
            }).to(char, {
              opacity: 1,
              duration: dur,
            });
            delay += dur * 2;
          });
        }
      });
    });
  }, [withGsap]);

  return (
    <Tag
      className={`inline cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelPending}
    >
      <SplitText text={text} charsRef={charsRef} />
    </Tag>
  );
});

// Main component that switches between animation types
export const AnimatedText = memo(function AnimatedText({
  children,
  animation,
  className = '',
  as = 'span',
}: AnimatedTextProps) {
  const Tag = as;

  // Keyed on the text: each variant keeps what it draws in state and refs made from the text it
  // mounted with (the scramble's letters, the typewriter's count, the split letters' refs), so new
  // text mounts afresh, and the visually hidden copy never reads other than the visible one.
  switch (animation) {
    case 'scramble':
      return <ScrambleText key={children} text={children} className={className} Tag={Tag} />;
    case 'wave':
      return <WaveText key={children} text={children} className={className} Tag={Tag} />;
    case 'magnetic':
      return <MagneticText key={children} text={children} className={className} Tag={Tag} />;
    case 'scatter':
      return <ScatterText key={children} text={children} className={className} Tag={Tag} />;
    case 'glitch':
      return <GlitchText key={children} text={children} className={className} Tag={Tag} />;
    case 'typewriter':
      return <TypewriterText key={children} text={children} className={className} Tag={Tag} />;
    case 'elastic':
      return <ElasticText key={children} text={children} className={className} Tag={Tag} />;
    case 'stagger-up':
      return <StaggerUpText key={children} text={children} className={className} Tag={Tag} />;
    case 'rainbow':
      return <RainbowText key={children} text={children} className={className} Tag={Tag} />;
    case 'perspective':
      return <PerspectiveText key={children} text={children} className={className} Tag={Tag} />;
    case 'gravity':
      return <GravityText key={children} text={children} className={className} Tag={Tag} />;
    case 'blur-reveal':
      return <BlurRevealText key={children} text={children} className={className} Tag={Tag} />;
    case 'highlight':
      return <HighlightText key={children} text={children} className={className} Tag={Tag} />;
    case 'morse':
      return <MorseText key={children} text={children} className={className} Tag={Tag} />;
    default:
      return <Tag className={className}>{children}</Tag>;
  }
});

export default AnimatedText;
