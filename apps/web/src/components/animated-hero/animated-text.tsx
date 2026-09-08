'use client';

import { useRef, useCallback, useState, memo, useMemo, useEffect } from 'react';
import { gsap } from './use-gsap-scroll';

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

  useEffect(() => {
    return () => {
      animationRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (animationRef.current?.isActive()) return;
    animationRef.current?.kill();

    const chars = text.split('');

    animationRef.current = gsap.to(
      {},
      {
        duration: text.length * 0.05,
        onUpdate: function () {
          const progress = this.progress();
          const revealIndex = Math.floor(progress * text.length);

          const newText = chars
            .map((char, i) => {
              if (char === ' ') return ' ';
              if (i < revealIndex) return originalText.current[i];
              return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
            })
            .join('');

          setDisplayText(newText);
        },
        onComplete: () => setDisplayText(originalText.current),
      },
    );
  }, [text]);

  const handleMouseLeave = useCallback(() => {
    animationRef.current?.kill();
    setDisplayText(originalText.current);
  }, []);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span className="font-mono">{displayText}</span>
    </Tag>
  );
});

// Helper to split text into words while keeping characters animatable
function splitIntoWords(text: string) {
  return text.split(/(\s+)/).filter(Boolean);
}

// CSS for GPU-accelerated transforms
const gpuAcceleratedStyle = { willChange: 'transform, opacity' } as const;

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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag className={`inline cursor-pointer ${className || ''}`} onMouseEnter={handleMouseEnter}>
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !textRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) * 0.15;
    const deltaY = (e.clientY - centerY) * 0.15;

    gsap.to(textRef.current, {
      x: deltaX,
      y: deltaY,
      duration: 0.3,
      ease: 'power2.out',
      overwrite: 'auto',
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (!textRef.current) return;
    gsap.to(textRef.current, {
      x: 0,
      y: 0,
      duration: 0.5,
      ease: 'elastic.out(1, 0.3)',
    });
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={containerRef as any}
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <span ref={textRef} className="inline-block" style={gpuAcceleratedStyle}>
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
  const totalChars = useMemo(() => text.replace(/\s/g, '').length, [text]);

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, [totalChars]);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag className={`inline cursor-pointer ${className || ''}`} onMouseEnter={handleMouseEnter}>
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
    </Tag>
  );
});

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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (timelineRef.current?.isActive()) return;
    setIsGlitching(true);

    timelineRef.current = gsap.timeline({
      onComplete: () => setIsGlitching(false),
    });

    // Quick glitch bursts
    for (let i = 0; i < 5; i++) {
      timelineRef.current.to(containerRef.current, {
        x: (Math.random() - 0.5) * 4,
        duration: 0.05,
      });
    }
    timelineRef.current.to(containerRef.current, {
      x: 0,
      duration: 0.1,
    });
  }, []);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={containerRef as any}
      className={`relative inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
      style={gpuAcceleratedStyle}
    >
      <span className="relative">
        {text}
        {isGlitching && (
          <>
            <span
              className="absolute inset-0 text-cyan-400 opacity-70"
              style={{
                transform: 'translateX(-2px)',
                clipPath: 'inset(0 0 50% 0)',
              }}
              aria-hidden="true"
            >
              {text}
            </span>
            <span
              className="absolute inset-0 text-red-400 opacity-70"
              style={{
                transform: 'translateX(2px)',
                clipPath: 'inset(50% 0 0 0)',
              }}
              aria-hidden="true"
            >
              {text}
            </span>
          </>
        )}
      </span>
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

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, [text.length]);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
    >
      <span>{text.slice(0, visibleCount)}</span>
      <span className="opacity-0" aria-hidden="true">
        {text.slice(visibleCount)}
      </span>
      {visibleCount < text.length && (
        <span
          className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-[var(--accent)]"
          aria-hidden="true"
        />
      )}
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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
    >
      <span ref={textRef} className="inline-block origin-center" style={gpuAcceleratedStyle}>
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

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag
      className={`inline cursor-pointer overflow-hidden ${className || ''}`}
      onMouseEnter={handleMouseEnter}
    >
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block overflow-hidden whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
    </Tag>
  );
});

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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (timelineRef.current?.isActive()) return;
    timelineRef.current?.kill();

    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6', '#e74c3c'];
    timelineRef.current = gsap.timeline();

    charsRef.current.forEach((char, i) => {
      if (char) {
        timelineRef
          .current!.to(
            char,
            {
              color: colors[i % colors.length],
              scale: 1.2,
              duration: 0.1,
            },
            i * 0.02,
          )
          .to(
            char,
            {
              color: 'inherit',
              scale: 1,
              duration: 0.3,
            },
            i * 0.02 + 0.2,
          );
      }
    });
  }, []);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag className={`inline cursor-pointer ${className || ''}`} onMouseEnter={handleMouseEnter}>
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      style={{ perspective: '500px' }}
      onMouseEnter={handleMouseEnter}
    >
      <span
        ref={textRef}
        className="inline-block"
        style={{ transformStyle: 'preserve-3d', ...gpuAcceleratedStyle }}
      >
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

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag className={`inline cursor-pointer ${className || ''}`} onMouseEnter={handleMouseEnter}>
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
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

  useEffect(() => {
    return () => {
      timelineRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  return (
    <Tag
      className={`inline-block cursor-pointer ${className || ''}`}
      onMouseEnter={handleMouseEnter}
    >
      <span ref={textRef} className="inline-block" style={gpuAcceleratedStyle}>
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

  useEffect(() => {
    return () => {
      tweenRef.current?.kill();
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  return (
    <Tag
      className={`relative inline-block cursor-pointer overflow-hidden ${className || ''}`}
      onMouseEnter={handleMouseEnter}
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

  useEffect(() => {
    return () => {
      timelinesRef.current.forEach((tl) => tl.kill());
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
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
  }, []);

  const words = useMemo(() => splitIntoWords(text), [text]);
  let charIndex = 0;

  return (
    <Tag className={`inline cursor-pointer ${className || ''}`} onMouseEnter={handleMouseEnter}>
      {words.map((word, wordIdx) => {
        if (/^\s+$/.test(word)) {
          return <span key={wordIdx}>{word}</span>;
        }
        return (
          <span key={wordIdx} className="inline-block whitespace-nowrap">
            {word.split('').map((char) => {
              const idx = charIndex++;
              return (
                <span
                  key={idx}
                  ref={(el) => {
                    charsRef.current[idx] = el;
                  }}
                  className="inline-block"
                  style={gpuAcceleratedStyle}
                >
                  {char}
                </span>
              );
            })}
          </span>
        );
      })}
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

  switch (animation) {
    case 'scramble':
      return <ScrambleText text={children} className={className} Tag={Tag} />;
    case 'wave':
      return <WaveText text={children} className={className} Tag={Tag} />;
    case 'magnetic':
      return <MagneticText text={children} className={className} Tag={Tag} />;
    case 'scatter':
      return <ScatterText text={children} className={className} Tag={Tag} />;
    case 'glitch':
      return <GlitchText text={children} className={className} Tag={Tag} />;
    case 'typewriter':
      return <TypewriterText text={children} className={className} Tag={Tag} />;
    case 'elastic':
      return <ElasticText text={children} className={className} Tag={Tag} />;
    case 'stagger-up':
      return <StaggerUpText text={children} className={className} Tag={Tag} />;
    case 'rainbow':
      return <RainbowText text={children} className={className} Tag={Tag} />;
    case 'perspective':
      return <PerspectiveText text={children} className={className} Tag={Tag} />;
    case 'gravity':
      return <GravityText text={children} className={className} Tag={Tag} />;
    case 'blur-reveal':
      return <BlurRevealText text={children} className={className} Tag={Tag} />;
    case 'highlight':
      return <HighlightText text={children} className={className} Tag={Tag} />;
    case 'morse':
      return <MorseText text={children} className={className} Tag={Tag} />;
    default:
      return <Tag className={className}>{children}</Tag>;
  }
});

export default AnimatedText;
