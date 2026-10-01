/**
 * The home page story pauses its endless CSS animations while a section is out of view (ADR 0009
 * rule 4) with one rule in `globals.css`: `[data-story-visible='false']` and a list of animation
 * classes. The rule can only pause what it names, so this holds the story's sources to that list:
 *
 * - every endless `animate-*` class the story's modules use is on it;
 * - nothing finite is on it, or it would hold its first frame while its section is out of view;
 * - no animation is written in a form the list cannot match: a variant such as
 *   `motion-safe:animate-pulse` (its class is not `.animate-pulse`), an arbitrary value such as
 *   `animate-[pulse_1s_infinite]`, an arbitrary `[animation:…]` property, or an inline `animation`
 *   style, whose inline precedence resets `animation-play-state` past any stylesheet rule.
 *
 * `e2e/reduced-motion.spec.ts` (R18) checks the result in a browser, at the bottom of the page; this
 * fails sooner, and on a class whose element the e2e walk never happens to render.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appDir, vocabulary } from './dimmed-text';

const STORY_DIR = path.join(appDir, 'src/components/animated-hero');

const sources = readdirSync(STORY_DIR)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => ({ name, text: readFileSync(path.join(STORY_DIR, name), 'utf8') }));

/** The classes the `data-story-visible` rule in `globals.css` pauses. */
function pausedClasses(): string[] {
  const css = readFileSync(path.join(appDir, 'src/app/globals.css'), 'utf8');
  const start = css.search(/^[^\n/]*data-story-visible='false'/m);
  if (start < 0) throw new Error("globals.css has no [data-story-visible='false'] rule");
  const selector = css.slice(start, css.indexOf('{', start));
  return [...selector.matchAll(/\.animate-([\w-]+)/g)].map(([, name]) => name);
}

/** Whether a utility's animation never ends, from Tailwind's theme and `globals.css`. */
function isEndless(name: string): boolean | undefined {
  const shorthands = vocabulary.animations.get(name);
  return shorthands && shorthands.some((shorthand) => /\binfinite\b/.test(shorthand));
}

/** Every `animate-*` token in the story's modules, with its variant prefix if it has one. */
const TOKEN = /(?<![\w-])((?:(?:\[[^\]\s]*\]|[\w-]+):)*)animate-(\[[^\]\s]*\]|\([^)\s]*\)|[\w-]+)/g;

const tokens = sources.flatMap(({ name, text }) =>
  [...text.matchAll(TOKEN)].map(([token, prefix, value]) => ({ file: name, token, prefix, value })),
);

describe("the story's endless animations and the rule that pauses them", () => {
  it('finds the story modules and their animation classes', () => {
    expect(sources.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['hero-section.tsx', 'execution-phase.tsx', 'hud-elements.tsx']),
    );
    expect(tokens.length).toBeGreaterThan(10);
  });

  it('lists only endless animations, each known to Tailwind or globals.css', () => {
    const listed = pausedClasses();
    expect(listed).toEqual(expect.arrayContaining(['pulse', 'spin', 'caret-pulse']));
    expect(listed.filter((name) => isEndless(name) !== true)).toEqual([]);
  });

  it('pauses every endless animation class the story uses', () => {
    const listed = new Set(pausedClasses());
    const missing = tokens
      .filter(({ prefix, value }) => !prefix && /^[\w-]+$/.test(value))
      .filter(({ value }) => {
        const endless = isEndless(value);
        if (endless === undefined) throw new Error(`animate-${value} is declared nowhere`);
        return endless && !listed.has(value);
      })
      .map(({ file, token }) => `${file}: ${token}`);
    expect(
      missing,
      "add each to globals.css's [data-story-visible='false'] rule, or it runs off-screen",
    ).toEqual([]);
  });

  it('writes no animation the rule cannot match', () => {
    const unmatchable = [
      ...tokens
        .filter(({ prefix, value }) => prefix || !/^[\w-]+$/.test(value))
        .map(({ file, token }) => `${file}: ${token}`),
      ...sources.flatMap(({ name, text }) =>
        [...text.matchAll(/\[animation:[^\]\s]*\]|\banimation(?:Name)?\s*:\s*['"`]/g)].map(
          ([match]) => `${name}: ${match}`,
        ),
      ),
    ];
    expect(
      unmatchable,
      'a variant, an arbitrary value or an inline animation escapes the pause rule: use a plain ' +
        'class on its list, declared in globals.css when Tailwind has none',
    ).toEqual([]);
  });
});
