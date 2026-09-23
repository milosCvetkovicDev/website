import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { gsap } from '../use-gsap-scroll';

/**
 * Finds the elements where CSS fights a GSAP tween for a property, in the two ways measured per frame
 * in Chromium on `/`:
 *
 * - A CSS transition on a property GSAP tweens. GSAP writes the property inline on every frame, and
 *   each write restarts the transition from wherever the last one had got to, so what renders trails
 *   the tween and loses its shape. The discovery tags' back.out overshoot (scale 1.10) rendered as
 *   1.00 under `transition-all duration-300`, and the loop alert's fade in from 0 never dipped below
 *   0.99 under `transition-all duration-500`.
 * - A state rule, such as a hover, that sets a transform on an element GSAP transforms. GSAP writes
 *   `transform` inline, and pins the individual `translate`, `scale` and `rotate` properties to `none`
 *   the first time it reads the element's transform (gsap 3.15, CSSPlugin.js:859-865). Inline beats
 *   any class, so `hover:scale-105` or `.hover-lift:hover` never applies while motion is allowed.
 *
 * The fix for both is to split the element: GSAP animates a wrapper, and the hover styles and their
 * transition live on an element inside it.
 *
 * What a class does is not restated here. It is read from the CSS the app ships: `globals.css`,
 * compiled by the installed Tailwind with the same theme, so utilities and plain classes such as
 * `.hover-lift` come out exactly as the browser gets them.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app');
const require = createRequire(import.meta.url);

/**
 * The declarations these checks read. `--tw-duration` is how Tailwind's `duration-*` reaches a
 * `transition-*` utility, whose own duration is `var(--tw-duration, var(--default-transition-duration))`.
 */
const WATCHED =
  /(?:^|[;{\s])(--tw-duration|transition(?:-property|-duration)?|transform|translate|scale|rotate)\s*:\s*([^;{}]+)/g;
const TRANSFORMS = new Set(['transform', 'translate', 'scale', 'rotate']);

/** GSAP's own `vars` keys, which name no property (gsap 3.15, gsap-core.js:1589 and :3824). */
const GSAP_RESERVED = new Set([
  ...['onComplete', 'onUpdate', 'onStart', 'onRepeat', 'onReverseComplete', 'onInterrupt'].flatMap(
    (name) => [name, `${name}Params`],
  ),
  ...'parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger,easeReverse'.split(
    ',',
  ),
  // CSSPlugin options that change how it renders rather than naming a property.
  'force3D',
  'smoothOrigin',
  'clearProps',
]);

/** Keys CSSPlugin renders into the `transform` property, aliases included (gsap 3.15, CSSPlugin.js:1592). */
const TRANSFORM_KEYS = new Set(
  'x,y,z,scale,scaleX,scaleY,xPercent,yPercent,rotation,rotationX,rotationY,skewX,skewY,transform,transformPerspective,translateX,translateY,translateZ,rotate,rotationZ,rotateZ,rotateX,rotateY'.split(
    ',',
  ),
);

type Declaration = { property: string; value: string; source: string; conditional: boolean };

/** The CSS properties GSAP tweens on `el`, from the `vars` of every tween that targets it. */
function tweenedProperties(el: Element): Set<string> {
  const properties = new Set<string>();
  for (const tween of gsap.getTweensOf(el)) {
    // A fromTo keeps its "from" values as `startAt`.
    for (const vars of [tween.vars, tween.vars.startAt]) {
      if (!vars || typeof vars !== 'object') continue;
      for (const key of Object.keys(vars)) {
        if (GSAP_RESERVED.has(key)) continue;
        if (TRANSFORM_KEYS.has(key)) properties.add('transform');
        else if (key === 'autoAlpha') properties.add('opacity').add('visibility');
        else if (key === 'transformOrigin' || key === 'svgOrigin')
          properties.add('transform-origin');
        else properties.add(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
      }
    }
  }
  return properties;
}

/** Every element in `root`, itself included, that a GSAP tween targets, with what it tweens there. */
export function tweenedElements(root: Element): Map<Element, Set<string>> {
  const found = new Map<Element, Set<string>>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const properties = tweenedProperties(el);
    if (properties.size) found.set(el, properties);
  }
  return found;
}

function watchedDeclarations(css: string): { property: string; value: string }[] {
  return [...css.matchAll(WATCHED)].map(([, property, value]) => ({
    property,
    value: value.trim(),
  }));
}

/**
 * Splits on `separator` outside brackets and parentheses, as CSS values nest, and leaves a
 * backslash-escaped character alone, as a Tailwind class name in a selector is escaped.
 */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      current += char + (text[++i] ?? '');
      continue;
    }
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (depth === 0 && separator.test(char)) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Every rule in `css`, at any depth, with its prelude and the declarations directly inside it. */
function rulesOf(css: string): { prelude: string; body: string }[] {
  const rules: { prelude: string; body: string }[] = [];
  const open: { prelude: string; body: string }[] = [];
  let text = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      i = css.indexOf('*/', i + 2) + 1 || css.length;
    } else if (char === '"' || char === "'") {
      const end = css.indexOf(char, i + 1);
      text += css.slice(i, end + 1);
      i = end;
    } else if (char === '\\') {
      text += char + (css[++i] ?? '');
    } else if (char === '{') {
      open.push({ prelude: text.trim(), body: '' });
      text = '';
    } else if (char === '}') {
      const rule = open.pop();
      if (rule) rules.push({ ...rule, body: `${rule.body}${text};` });
      text = '';
    } else if (char === ';') {
      if (open.length) open[open.length - 1].body += `${text};`;
      text = '';
    } else text += char;
  }
  return rules;
}

/** Undoes CSS escaping in a class name: `hover\:scale-105` is the class `hover:scale-105`. */
function unescapeCss(name: string): string {
  return name.replace(/\\([0-9a-fA-F]{1,6}\s?|.)/g, (_, escaped: string) =>
    /^[0-9a-fA-F]{1,6}\s?$/.test(escaped) ? String.fromCodePoint(parseInt(escaped, 16)) : escaped,
  );
}

/**
 * The classes a selector applies to, which are those of its last compound outside any `:is()` or
 * `:where()`, and whether it applies only in some state: behind a pseudo-class such as `:hover`,
 * `:active` or the `:where(.dark …)` of the dark variant. A rule on a pseudo-element names none.
 */
function subjectOf(selector: string): { classes: string[]; conditional: boolean } {
  const subject = splitTopLevel(selector, /[\s>+~]/).at(-1) ?? '';
  const classes: string[] = [];
  let depth = 0;
  for (let i = 0; i < subject.length; i++) {
    const char = subject[i];
    if (char === '\\') i++;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (depth > 0) continue;
    else if (char === ':' && subject[i + 1] === ':') return { classes: [], conditional: false };
    else if (char === '.') {
      // `.group` in `:is(:where(.group):hover *)` sits inside parentheses and names an ancestor.
      const name = /^(?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-])+/.exec(subject.slice(i + 1))?.[0] ?? '';
      classes.push(unescapeCss(name));
      i += name.length;
    }
  }
  return { classes, conditional: /(^|[^\\]):/.test(selector) };
}

let compiler: ReturnType<typeof compile> | undefined;

/** The installed Tailwind, loaded with `globals.css`, as the app's build loads it. */
function appCompiler() {
  compiler ??= compile(readFileSync(join(APP_DIR, 'globals.css'), 'utf8'), {
    base: APP_DIR,
    async loadStylesheet(id, base) {
      const path =
        id === 'tailwindcss' ? require.resolve('tailwindcss/index.css') : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler;
}

/**
 * The CSS the app ships for these class names, indexed by class, and the theme's default transition
 * duration. The compiler keeps every candidate it has built, so the index grows across calls, which
 * is harmless: a class only ever reads its own rules.
 */
async function stylesheetFor(classNames: string[]) {
  const css = (await appCompiler()).build(classNames);
  const byClass = new Map<string, Declaration[]>();
  for (const { prelude, body } of rulesOf(css)) {
    if (prelude.startsWith('@')) continue;
    const declarations = watchedDeclarations(body);
    if (!declarations.length) continue;
    for (const selector of splitTopLevel(prelude, /,/)) {
      const { classes, conditional } = subjectOf(selector);
      for (const name of classes) {
        const list = byClass.get(name) ?? [];
        for (const d of declarations)
          list.push({ ...d, source: unescapeCss(selector), conditional });
        byClass.set(name, list);
      }
    }
  }
  const defaultDuration = /--default-transition-duration:\s*([^;}]+)/.exec(css)?.[1].trim();
  return { byClass, defaultDuration };
}

function classNamesOf(el: Element): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

/** Whether a duration is above zero. `var(--tw-duration, …)` takes the element's `duration-*` value
 * when it has one and the theme default otherwise. */
function isPositiveDuration(value: string, fallback: string | undefined): boolean {
  if (value.startsWith('var('))
    return fallback === undefined || isPositiveDuration(fallback, undefined);
  const time = /^(-?\d*\.?\d+)(m?s)$/.exec(value);
  return time ? Number(time[1]) > 0 : !/^0+(\.0+)?$/.test(value);
}

/**
 * The properties the declarations transition, and which rules say so. `transition-property` starts
 * as `all` and `transition-duration` as `0s`, so a class that sets only a duration (`duration-300`
 * alone) transitions every property, and a property list with no duration transitions none.
 */
function transitionCoverage(declarations: Declaration[], defaultDuration: string | undefined) {
  const properties = new Set<string>();
  const sources = new Set<string>();
  const fallback =
    declarations.find(({ property }) => property === '--tw-duration')?.value ?? defaultDuration;
  let listed = false;
  let positive = false;
  for (const { property, value, source } of declarations) {
    if (property === 'transition-property') {
      listed = true;
      splitTopLevel(value, /,/).forEach((name) => properties.add(name));
    } else if (property === 'transition-duration') {
      positive ||= splitTopLevel(value, /,/).some((d) => isPositiveDuration(d, fallback));
    } else if (property === 'transition') {
      listed = true;
      for (const item of splitTopLevel(value, /,/)) {
        // `<property> <duration> <easing> <delay>`, in any order: the first time is the duration.
        const words = splitTopLevel(item, /\s/);
        const time = words.find((word) => /^-?\d*\.?\d+m?s$/.test(word));
        const name = words.find(
          (word) =>
            !/^-?\d*\.?\d+m?s$/.test(word) &&
            !/^(ease(-in|-out|-in-out)?|linear|step-start|step-end|allow-discrete|normal)$|\(/.test(
              word,
            ),
        );
        properties.add(name ?? 'all');
        positive ||= time !== undefined && isPositiveDuration(time, fallback);
      }
    } else continue;
    sources.add(source);
  }
  if (!positive) properties.clear();
  else if (!listed) properties.add('all');
  properties.delete('none');
  return { properties, sources };
}

function covers(transitioned: Set<string>, property: string): boolean {
  if (transitioned.has('all') || transitioned.has(property)) return true;
  // A shorthand covers its longhands: `border` transitions `border-color`.
  return [...transitioned].some((name) => property.startsWith(`${name}-`));
}

function describe(el: Element): string {
  const firstClass = classNamesOf(el)[0];
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return `<${el.tagName.toLowerCase()}${firstClass ? ` class="${firstClass} …"` : ''}> "${text}"`;
}

/**
 * Every place in `root` where CSS fights a GSAP tween, as a sentence naming the element, the property
 * and the rule responsible. Empty when there is none.
 */
export async function gsapCssConflicts(root: Element): Promise<string[]> {
  const tweened = tweenedElements(root);
  const { byClass, defaultDuration } = await stylesheetFor([
    ...new Set([...tweened.keys()].flatMap(classNamesOf)),
  ]);
  const conflicts: string[] = [];
  for (const [el, properties] of tweened) {
    const declarations = classNamesOf(el).flatMap((name) => byClass.get(name) ?? []);
    // GSAP's own inline writes are transforms, never transitions, so only a transition is read here.
    for (const d of watchedDeclarations(el.getAttribute('style') ?? '')) {
      if (d.property.startsWith('transition'))
        declarations.push({ ...d, source: 'style attribute', conditional: false });
    }
    const coverage = transitionCoverage(declarations, defaultDuration);
    for (const property of properties) {
      if (covers(coverage.properties, property))
        conflicts.push(
          `${describe(el)}: GSAP tweens ${property}, which ${[...coverage.sources].join(' + ')} transitions`,
        );
    }
    if (!properties.has('transform')) continue;
    for (const { property, source, conditional } of declarations) {
      if (conditional && TRANSFORMS.has(property))
        conflicts.push(
          `${describe(el)}: ${source} sets ${property}, which GSAP's inline transform overrides`,
        );
    }
  }
  return conflicts;
}
