'use client';

import { memo, useCallback, useRef, useState, type RefObject } from 'react';
import type { Gsap } from './load-gsap';
import { useHoverTimeline } from './use-hover-timeline';

// Fourteen hover effects for the story's labels and headlines. Each entry in `VARIANTS` builds its
// hover as one GSAP timeline or tween, `useHoverTimeline` carries what they all share, and
// `SplitText` draws the six that move letter by letter. Every root is a span that names its variant
// in `data-animation`, which is how tests find it.

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

interface AnimatedTextProps {
  children: string;
  animation: AnimationType;
  className?: string;
}

type Animation = gsap.core.Animation;
/** Where magnetic's pull aims, measured when the pointer moved; `null` springs the text back. */
type Aim = { x: number; y: number } | null;

type Parts = RefObject<(HTMLElement | null)[]>;

/**
 * The text of the six variants that animate letter by letter. Each letter is its own `inline-block`
 * span for GSAP to move, grouped by word so that a line never breaks inside one. Accessible-name
 * computation puts a space around every such box, which named the story's headlines
 * `M o s t b u g s …`, so that copy is `aria-hidden` and assistive technology reads the visually
 * hidden one beside it, with the text whole. Not `aria-label`: it is prohibited on a generic span.
 * The hidden copy is `select-none`, so copying the line gives the sentence once, as it is drawn.
 */
function SplitText({ text, letters, words }: { text: string; letters: Parts; words: string }) {
  let index = 0;
  // By code point, so a character outside the BMP is never split into two halves.
  const split = (word: string) =>
    Array.from(word).map((char) => {
      const at = index++;
      return (
        <span key={at} ref={(el) => void (letters.current[at] = el)} className="inline-block">
          {char}
        </span>
      );
    });
  return (
    <>
      <span className="sr-only select-none">{text}</span>
      <span aria-hidden="true">
        {text
          .split(/(\s+)/)
          .filter(Boolean)
          .map((word, i) => (
            <span key={i} className={/^\s+$/.test(word) ? undefined : words}>
              {/^\s+$/.test(word) ? word : split(word)}
            </span>
          ))}
      </span>
    </>
  );
}

/** What a variant's builder is handed when a hover starts. */
interface Hover {
  gsap: Gsap;
  root: HTMLElement;
  parts: HTMLElement[]; // the letters of a split variant, or the one span a whole variant moves
  text: string;
  aim: Aim;
  draw: (frame: string | null) => void; // the text as the hover draws it, `null` back at rest
}

interface Variant {
  build: (hover: Hover) => Animation;
  words?: string; // splits the text into letters, with this class on each word
  span?: string; // moves the text as one span with this class
  draw?: (text: string, frame: string | null) => React.ReactNode; // draws a text it changes
  display?: string; // the root's classes, when not `inline` (split) or `inline-block`
  style?: React.CSSProperties;
  spanStyle?: React.CSSProperties;
  follows?: true; // follows the pointer and springs back on leave, rather than playing once
  stopsOnLeave?: true; // ends the hover when the pointer leaves, rather than letting it play out
  rest?: (gsap: Gsap, parts: HTMLElement[]) => void; // what reduced motion puts back, if played
}

/** A split variant: `each` adds one letter's steps to the hover's single timeline. */
const letters = (
  each: (timeline: gsap.core.Timeline, letter: HTMLElement, i: number, n: number) => void,
  words = 'inline-block whitespace-nowrap',
): Variant => ({
  words,
  build: ({ gsap, parts }) => {
    const timeline = gsap.timeline();
    parts.forEach((letter, i) => each(timeline, letter, i, parts.length));
    return timeline;
  },
});

const SCRAMBLE_CHARS =
  '!@#$%^&*()_+-=[]{}|;:,.<>?/~`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * The glitch's split, drawn while it plays as two offset shadows of the text itself rather than as
 * copies of it: decoration, like the SVG frames, and in theme tokens that reach AA as text on the
 * accent pill and on the page in both themes (ADR 0010, 0011; hero-contrast.spec.ts measures them).
 */
const GLITCH_OFFSETS = { textShadow: '-2px 0 var(--accent-text), 2px 0 var(--status-err)' };

/**
 * The rainbow's letter colours: theme tokens that reach AA as text on the accent pill in both themes
 * (hero-contrast.spec.ts measures them). Each is set and cleared at a point on the timeline rather
 * than tweened: GSAP interpolates rgb, hsl, hex and named colours, and the status tokens compute to
 * `lab()` in the browsers that support it.
 */
const RAINBOW_TOKENS = ['--status-err', '--status-warn', '--status-ok', '--accent-text'];

const VARIANTS = {
  // Shuffles the characters, then reveals them left to right; a leave puts the text back at once.
  // Whitespace of any kind is kept where it is, so the line never rewraps while it plays.
  scramble: {
    stopsOnLeave: true,
    build: ({ gsap, text, draw }) => {
      const chars = Array.from(text);
      const any = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      const tween = gsap.to({}, { duration: chars.length * 0.05, onComplete: () => draw(null) });
      return tween.eventCallback('onUpdate', () => {
        const shown = Math.floor(tween.progress() * chars.length);
        draw(chars.map((c, i) => (/\s/.test(c) || i < shown ? c : any())).join(''));
      });
    },
    draw: (text, frame) => (
      <>
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden="true" className="font-mono">
          {frame ?? text}
        </span>
      </>
    ),
  },
  // Bobs each letter up and down in turn.
  wave: letters((timeline, letter, i) =>
    timeline
      .to(letter, { y: -8, duration: 0.2, ease: 'power2.out' }, i * 0.03)
      .to(letter, { y: 0, duration: 0.3, ease: 'elastic.out(1, 0.3)' }, i * 0.03 + 0.2),
  ),
  // Pulls the text towards the pointer, then springs it back when the pointer leaves.
  magnetic: {
    span: 'inline-block',
    follows: true,
    build: ({ gsap, parts: [text], aim }) =>
      gsap.to(
        text,
        aim
          ? { ...aim, duration: 0.3, ease: 'power2.out' }
          : { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' },
      ),
    // The pull stays until the leave springs it back, which under `reduce` does nothing. No
    // gsap.context: reverting one would undo the clearProps and put the pull back.
    rest: (gsap, [text]) => void (text && gsap.set(text, { clearProps: 'transform' })),
  },
  // Throws the letters outward, then pulls them back.
  scatter: letters((timeline, letter, i, n) => {
    const angle = (i / n) * Math.PI * 2;
    const distance = 15 + Math.random() * 10;
    const [x, y] = [Math.cos(angle) * distance, Math.sin(angle) * distance];
    const rotation = (Math.random() - 0.5) * 30;
    timeline
      .to(letter, { x, y, rotation, duration: 0.3, ease: 'power2.out' }, 0)
      .to(letter, { x: 0, y: 0, rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' }, 0.3);
  }),
  // Shakes the text, split into token-coloured offsets while it does.
  glitch: {
    display: 'relative inline-block',
    build: ({ gsap, root, text, draw }) => {
      draw(text);
      const timeline = gsap.timeline({ onComplete: () => draw(null) });
      for (let burst = 0; burst < 5; burst++) {
        timeline.to(root, { x: (Math.random() - 0.5) * 4, duration: 0.05 });
      }
      return timeline.to(root, { x: 0, duration: 0.1 });
    },
    draw: (text, frame) => <span style={frame === null ? undefined : GLITCH_OFFSETS}>{text}</span>,
  },
  // Retypes the text one character at a time, behind a caret. By code point, so a frame never ends
  // in half a character, and `draw` can slice the untyped rest off the text by the frame's length.
  typewriter: {
    build: ({ gsap, text, draw }) => {
      const chars = Array.from(text);
      const typed = { count: 0 };
      draw('');
      return gsap.to(typed, {
        count: chars.length,
        duration: chars.length * 0.04,
        ease: 'none',
        onUpdate: () => draw(chars.slice(0, Math.floor(typed.count)).join('')),
        onComplete: () => draw(null),
      });
    },
    draw: (text, frame) => (
      <>
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden="true">
          <span>{frame ?? text}</span>
          <span className="opacity-0">{text.slice((frame ?? text).length)}</span>
          {frame !== null && frame.length < text.length && (
            <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-[var(--accent)]" />
          )}
        </span>
      </>
    ),
  },
  // Squashes and stretches the text.
  elastic: {
    span: 'inline-block origin-center',
    build: ({ gsap, parts: [text] }) =>
      gsap
        .timeline()
        .to(text, { scaleX: 1.1, scaleY: 0.9, duration: 0.15, ease: 'power2.out' })
        .to(text, { scaleX: 0.95, scaleY: 1.05, duration: 0.15, ease: 'power2.out' })
        .to(text, { scaleX: 1, scaleY: 1, duration: 0.4, ease: 'elastic.out(1, 0.3)' }),
  },
  // Slides each letter out at the top and back in from below.
  'stagger-up': letters((timeline, letter, i) => {
    const back = i * 0.02 + 0.15;
    timeline
      .set(letter, { y: 0 }, 0)
      .to(letter, { y: -20, opacity: 0, duration: 0.15, ease: 'power2.in' }, i * 0.02)
      .set(letter, { y: 20 }, back)
      .to(letter, { y: 0, opacity: 1, duration: 0.25, ease: 'power2.out' }, back);
  }, 'inline-block overflow-hidden whitespace-nowrap'),
  // Recolours and grows each letter in turn.
  rainbow: letters((timeline, letter, i) => {
    const at = i * 0.02;
    const token = RAINBOW_TOKENS[i % RAINBOW_TOKENS.length];
    timeline
      .call(() => letter.style.setProperty('color', `var(${token})`), undefined, at)
      .to(letter, { scale: 1.2, duration: 0.1 }, at)
      .to(letter, { scale: 1, duration: 0.3 }, at + 0.2)
      .call(() => letter.style.removeProperty('color'), undefined, at + 0.5);
  }),
  // Flips the text over in 3D.
  perspective: {
    span: 'inline-block',
    style: { perspective: '500px' },
    spanStyle: { transformStyle: 'preserve-3d' },
    build: ({ gsap, parts: [text] }) =>
      gsap
        .timeline()
        .to(text, { rotateX: -90, opacity: 0, duration: 0.2, ease: 'power2.in' })
        .set(text, { rotateX: 90 })
        .to(text, { rotateX: 0, opacity: 1, duration: 0.3, ease: 'back.out(1.5)' }),
  },
  // Drops the letters and bounces them back.
  gravity: letters((timeline, letter) => {
    const at = Math.random() * 0.2;
    timeline
      .to(letter, { y: 20, opacity: 0.5, duration: 0.15, ease: 'power2.in' }, at)
      .to(letter, { y: 0, opacity: 1, duration: 0.4, ease: 'bounce.out' }, at + 0.15);
  }),
  // Blurs the text, then sharpens it.
  'blur-reveal': {
    span: 'inline-block',
    build: ({ gsap, parts: [text] }) =>
      gsap
        .timeline()
        .to(text, { filter: 'blur(8px)', opacity: 0.3, scale: 1.05, duration: 0.15 })
        .to(text, { filter: 'blur(0px)', opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' }),
  },
  // Sweeps a highlight across the text.
  highlight: {
    display: 'relative inline-block overflow-hidden',
    build: ({ gsap, text, draw }) => {
      draw(text);
      return gsap.to({}, { duration: 0.6, onComplete: () => draw(null) });
    },
    draw: (text, frame) => (
      <>
        <span className="relative z-10">{text}</span>
        {frame !== null && (
          <span
            className="animate-highlight-scan absolute inset-0 z-0 bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent"
            aria-hidden="true"
          />
        )}
      </>
    ),
  },
  // Blinks the letters in a morse-like pattern.
  morse: letters((timeline, letter, i) => {
    let at = i * 0.05;
    for (const blink of Math.random() > 0.5 ? [0.05, 0.1] : [0.1, 0.05, 0.05]) {
      timeline
        .to(letter, { opacity: 0.2, duration: blink }, at)
        .to(letter, { opacity: 1, duration: blink }, at + blink);
      at += blink * 2;
    }
  }),
} satisfies Record<AnimationType, Variant>;

type HoverTextProps = Omit<AnimatedTextProps, 'children'> & { text: string };

function HoverText({ text, animation, className }: HoverTextProps) {
  const variant: Variant = VARIANTS[animation];
  const root = useRef<HTMLSpanElement>(null);
  const parts = useRef<(HTMLElement | null)[]>([]);
  const [frame, draw] = useState<string | null>(null);
  const found = useCallback(() => parts.current.filter((part) => part !== null), []);
  const build = useCallback(
    (gsap: Gsap, aim: Aim) => {
      // A hover queued behind GSAP's load can run after a navigation has removed the text.
      const el = root.current;
      return el ? variant.build({ gsap, root: el, parts: found(), text, aim, draw }) : null;
    },
    [variant, found, text],
  );
  const rest = useCallback((gsap: Gsap) => variant.rest?.(gsap, found()), [variant, found]);
  const { play, finish, cancelPending } = useHoverTimeline<Aim>(build, rest);

  const hover = variant.follows
    ? {
        // Measured now, pointer and box alike: a move that waits for GSAP must aim where the pointer
        // was relative to the text when it moved, whatever has scrolled since.
        onMouseMove: (event: React.MouseEvent<HTMLElement>) => {
          const box = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - box.left - box.width / 2) * 0.15;
          play({ x, y: (event.clientY - box.top - box.height / 2) * 0.15 }, true);
        },
        onMouseLeave: () => play(null, true),
      }
    : {
        onMouseEnter: () => play(null, false),
        // Cancelled first, so an enter still waiting for GSAP never starts after the pointer left.
        onMouseLeave: () => {
          cancelPending();
          if (variant.stopsOnLeave) finish();
        },
      };
  const display = variant.display ?? (variant.words ? 'inline' : 'inline-block');
  const whole = (el: HTMLElement | null) => void (parts.current[0] = el);

  return (
    <span
      ref={root}
      data-animation={animation}
      className={className ? `${display} ${className}` : display}
      style={variant.style}
      {...hover}
    >
      {variant.words ? (
        <SplitText text={text} letters={parts} words={variant.words} />
      ) : variant.draw ? (
        variant.draw(text, frame)
      ) : (
        <span ref={whole} className={variant.span} style={variant.spanStyle}>
          {text}
        </span>
      )}
    </span>
  );
}

// Keyed on the variant and the text: a variant keeps what it draws in state and refs made from the
// text it mounted with (the frame, the letters' refs), so new text or a new variant mounts afresh,
// and the visually hidden copy never reads other than the visible one. An animation the table does
// not own, from a caller the type does not reach, draws the text with no hover rather than throwing.
export const AnimatedText = memo(function AnimatedText({ children, ...props }: AnimatedTextProps) {
  if (!Object.hasOwn(VARIANTS, props.animation)) {
    return <span className={props.className}>{children}</span>;
  }
  return <HoverText key={`${props.animation}:${children}`} text={children} {...props} />;
});
