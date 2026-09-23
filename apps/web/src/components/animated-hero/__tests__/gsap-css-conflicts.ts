import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';
import { gsap } from '../use-gsap-scroll';

/**
 * Finds the elements where CSS fights a GSAP tween for a property. Two of the ways were measured per
 * frame in Chromium on `/`:
 *
 * - A CSS transition on a property GSAP tweens. GSAP writes the property inline on every frame, and
 *   each write restarts the transition from wherever the last one had got to, so what renders trails
 *   the tween and loses its shape. The discovery tags' back.out overshoot (scale 1.10) rendered as
 *   1.00 under `transition-all duration-300`, and the loop alert's pulse from opacity 0 never
 *   dipped below 0.99 under `transition-all duration-500`.
 * - A state rule, such as a hover, that sets a property GSAP writes inline: inline beats any class.
 *   That includes every transform on an element GSAP transforms, because GSAP writes `transform`
 *   inline and pins the individual `translate`, `scale` and `rotate` properties to `none` the first
 *   time it reads the element's transform (gsap 3.15, CSSPlugin.js:859-865), so `hover:scale-105` or
 *   `.hover-lift:hover` never applies while motion is allowed.
 *
 * A CSS animation on the element is reported too, because an animation outranks inline styles for as
 * long as it runs. The fix for all three is to split the element: GSAP animates a wrapper, and the
 * hover styles, transitions and animations live on an element inside it.
 *
 * What a class does is not restated here. It is read from `globals.css` compiled by the installed
 * Tailwind with the app's theme, so utilities and plain classes such as `.hover-lift` come out as the
 * build generates them, before the Lightning CSS pass that only flattens and merges rules. A rule
 * reaches an element through the element's own classes; an element, id or universal selector, or a
 * variant applied from an ancestor (`*:`, `[&_span]:`), is not read. None of those sets a transition,
 * an animation or a transform on anything this app tweens.
 *
 * Only tweens still in GSAP's global timeline are seen, so call it while they are alive: with the
 * tweens paused, or with `gsap.updateRoot` taken off the ticker so none of them completes.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'app');
const require = createRequire(import.meta.url);

/** Every declaration in a block of CSS; the value stops at `;`, `{` or `}`. */
const DECLARATION = /(?:^|[;{\s])(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]+)/g;
const TRANSFORMS = new Set(['transform', 'translate', 'scale', 'rotate']);

/**
 * GSAP's own `vars` keys, which name no property: its reserved words and callbacks (gsap 3.15,
 * gsap-core.js:1589 and :3824), its core plugins (gsap-core.js:4422-4455) and CSSPlugin's
 * `autoRound` and `clearProps`. `startAt`, `keyframes` and `css` are read rather than skipped.
 */
const GSAP_RESERVED = new Set([
  ...['onComplete', 'onUpdate', 'onStart', 'onRepeat', 'onReverseComplete', 'onInterrupt'].flatMap(
    (name) => [name, `${name}Params`],
  ),
  ...'parent,duration,ease,delay,overwrite,runBackwards,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,autoRevert,scrollTrigger,easeReverse'.split(
    ',',
  ),
  ...'attr,snap,modifiers,roundProps,endArray,autoRound,clearProps'.split(','),
]);

/**
 * The keys CSSPlugin handles as transforms (gsap 3.15, CSSPlugin.js:1592). Every one of them makes it
 * read the element's transform and pin the individual properties; all but the origin keys and the two
 * rendering options are also rendered into `transform` on every frame.
 */
const TRANSFORM_KEYS = new Set(
  'x,y,z,scale,scaleX,scaleY,xPercent,yPercent,rotation,rotationX,rotationY,skewX,skewY,transform,transformPerspective,translateX,translateY,translateZ,rotate,rotationZ,rotateZ,rotateX,rotateY'.split(
    ',',
  ),
);
const ORIGIN_KEYS = new Set(['transformOrigin', 'svgOrigin']);
const RENDER_OPTIONS = new Set(['force3D', 'smoothOrigin']);

type Tweened = { properties: Set<string>; pinsTransform: boolean };
type Declaration = { property: string; value: string; source: string; conditional: boolean };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function addVars(vars: Record<string, unknown>, into: Tweened) {
  for (const [key, value] of Object.entries(vars)) {
    if (key === 'startAt' || key === 'css') {
      // A fromTo keeps its "from" values as `startAt`; `css` wraps CSS properties explicitly.
      if (isObject(value)) addVars(value, into);
    } else if (key === 'keyframes') {
      // An array of frames, or an object of per-property arrays and percentage frames.
      if (Array.isArray(value)) value.filter(isObject).forEach((frame) => addVars(frame, into));
      else if (isObject(value))
        for (const [frameKey, frame] of Object.entries(value)) {
          if (frameKey.endsWith('%')) {
            if (isObject(frame)) addVars(frame, into);
          } else if (frameKey !== 'ease' && frameKey !== 'easeEach')
            addVars({ [frameKey]: frame }, into);
        }
    } else if (GSAP_RESERVED.has(key)) {
      continue;
    } else if (TRANSFORM_KEYS.has(key)) {
      into.properties.add('transform');
      into.pinsTransform = true;
    } else if (ORIGIN_KEYS.has(key) || RENDER_OPTIONS.has(key)) {
      if (ORIGIN_KEYS.has(key)) into.properties.add('transform-origin');
      into.pinsTransform = true;
    } else if (key === 'autoAlpha') into.properties.add('opacity').add('visibility');
    else if (key === 'alpha') into.properties.add('opacity');
    else into.properties.add(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`));
  }
}

function tweenInfo(el: Element): Tweened {
  const info: Tweened = { properties: new Set(), pinsTransform: false };
  for (const tween of gsap.getTweensOf(el)) addVars(tween.vars as Record<string, unknown>, info);
  return info;
}

/**
 * Every element in `root`, itself included, that a GSAP tween targets, with the CSS properties it
 * tweens there (empty for a tween that only sets a transform option such as `force3D`).
 */
export function tweenedElements(root: Element): Map<Element, Set<string>> {
  const found = new Map<Element, Set<string>>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const info = tweenInfo(el);
    if (info.properties.size || info.pinsTransform) found.set(el, info.properties);
  }
  return found;
}

function declarationsIn(css: string): { property: string; value: string }[] {
  return [...css.matchAll(DECLARATION)].map(([, property, value]) => ({
    property: property.startsWith('--') ? property : property.toLowerCase(),
    value: value.replace(/!\s*important\s*$/i, '').trim(),
  }));
}

/** The length of the CSS escape starting at `text[i]` (a backslash): a hex code and its space, or one character. */
function escapeLength(text: string, i: number): number {
  const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(text.slice(i + 1, i + 8));
  return 1 + (hex ? hex[0].length : 1);
}

/** Splits on `separator` outside brackets, parentheses and escapes, as CSS values and selectors nest. */
function splitTopLevel(text: string, separator: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') i += escapeLength(text, i) - 1;
    else if (char === '"' || char === "'") {
      const close = text.indexOf(char, i + 1);
      i = close === -1 ? text.length : close;
    } else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (depth === 0 && separator.test(char)) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** A nested prelude resolved against its parent style rule: `&` is the parent, otherwise a descendant. */
function resolveNesting(prelude: string, parent: string): string {
  const parents = splitTopLevel(parent, /,/);
  return splitTopLevel(prelude, /,/)
    .flatMap((part) =>
      parents.map((outer) =>
        part.includes('&') ? part.replaceAll('&', outer) : `${outer} ${part}`,
      ),
    )
    .join(', ');
}

type Rule = { selector: string | undefined; body: string; conditional: boolean };

/**
 * Every rule in `css`, at any depth, with the selector it applies to and the declarations directly
 * inside it. A nested rule is resolved against its parent, an at-rule's own declarations belong to the
 * enclosing style rule, and anything inside `@media`, `@supports` or `@container` is conditional.
 * Throws on a block that never closes, rather than silently dropping what is in it.
 */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: (Rule & { prelude: string })[] = [];
  let text = '';
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    if (char === '/' && css[i + 1] === '*') {
      i = css.indexOf('*/', i + 2) + 1 || css.length;
    } else if (char === '"' || char === "'") {
      // A string ends at its unescaped quote; a bad one ends at the newline, as CSS ends it.
      let end = i + 1;
      while (end < css.length && css[end] !== char && css[end] !== '\n')
        end += css[end] === '\\' ? 2 : 1;
      text += css.slice(i, end + 1);
      i = end;
    } else if (char === '\\') {
      const length = escapeLength(css, i);
      text += css.slice(i, i + length);
      i += length - 1;
    } else if (/^url\(/i.test(css.slice(i, i + 4))) {
      // An unquoted url() may hold braces and semicolons.
      const end = css.indexOf(')', i);
      const stop = end === -1 ? css.length - 1 : end;
      text += css.slice(i, stop + 1);
      i = stop;
    } else if (char === '{') {
      const prelude = text.trim();
      const parent = open.at(-1);
      const atRule = prelude.startsWith('@');
      open.push({
        prelude,
        selector: atRule
          ? parent?.selector
          : parent?.selector
            ? resolveNesting(prelude, parent.selector)
            : prelude,
        conditional:
          (parent?.conditional ?? false) || /^@(media|supports|container)\b/i.test(prelude),
        body: '',
      });
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
  if (open.length) throw new Error(`gsap-css-conflicts: ${open.length} CSS block(s) never close`);
  return rules;
}

/** Undoes CSS escaping in a class name: `hover\:scale-105` is the class `hover:scale-105`. */
function unescapeCss(name: string): string {
  return name.replace(/\\([0-9a-fA-F]{1,6}\s?|[\s\S])/g, (_, escaped: string) => {
    if (!/^[0-9a-fA-F]{1,6}\s?$/.test(escaped)) return escaped;
    const code = parseInt(escaped, 16);
    const invalid = code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff);
    return invalid ? '�' : String.fromCodePoint(code);
  });
}

/**
 * The classes a selector applies to, which are those of its last compound outside any `:is()` or
 * `:where()`, and whether it applies only in some state. A state is a pseudo-class anywhere in the
 * selector (`:hover`, `:active`, the `:where(.dark …)` of the dark variant), an attribute on the
 * subject (`data-[state=open]:`, `aria-pressed:`), or a second class the element may not carry yet
 * (`[&.is-active]:`). A rule on a pseudo-element names no class.
 */
function subjectOf(selector: string): { classes: string[]; conditional: boolean } {
  const subject = splitTopLevel(selector, /[\s>+~]/).at(-1) ?? '';
  const classes: string[] = [];
  let depth = 0;
  let attribute = false;
  for (let i = 0; i < subject.length; i++) {
    const char = subject[i];
    if (char === '\\') {
      i += escapeLength(subject, i) - 1;
    } else if (char === '(' || char === '[') {
      if (char === '[' && depth === 0) attribute = true;
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    } else if (depth > 0) {
      continue;
    } else if (
      char === ':' &&
      /^:(:|before\b|after\b|first-line\b|first-letter\b)/.test(subject.slice(i))
    ) {
      return { classes: [], conditional: false };
    } else if (char === '.') {
      // `.group` in `:is(:where(.group):hover *)` sits inside parentheses and names an ancestor.
      const name =
        /^(?:\\[0-9a-fA-F]{1,6}\s?|\\[\s\S]|[\w-])+/.exec(subject.slice(i + 1))?.[0] ?? '';
      classes.push(unescapeCss(name));
      i += name.length;
    }
  }
  const pseudoClass = /(^|[^\\]):/.test(selector);
  const ancestor = splitTopLevel(selector, /[\s>+~]/).length > 1;
  return { classes, conditional: pseudoClass || attribute || ancestor || classes.length > 1 };
}

let compiler: ReturnType<typeof compile> | undefined;

/** The installed Tailwind, loaded with `globals.css`, as the app's build loads it. */
function appCompiler() {
  compiler ??= compile(readFileSync(join(APP_DIR, 'globals.css'), 'utf8'), {
    base: APP_DIR,
    async loadStylesheet(id, base) {
      const path = /^[./]/.test(id)
        ? resolve(base, id)
        : require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  }).catch((error: unknown) => {
    // A failed compile is reported once and retried next time, not cached for every later call.
    compiler = undefined;
    throw error;
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
  for (const rule of rulesOf(css)) {
    if (!rule.selector) continue;
    const declarations = declarationsIn(rule.body);
    if (!declarations.length) continue;
    for (const selector of splitTopLevel(rule.selector, /,/)) {
      const { classes, conditional } = subjectOf(selector);
      for (const name of classes) {
        const list = byClass.get(name) ?? [];
        for (const d of declarations)
          list.push({
            ...d,
            source: unescapeCss(selector),
            conditional: rule.conditional || conditional,
          });
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

const TIME = /^(-?\d*\.?\d+)(m?s)$/i;
const TRANSITION_LONGHANDS = ['transition-property', 'transition-duration', 'transition-delay'];

/**
 * Whether a time is above zero. `var(--tw-duration, …)` takes the element's `duration-*` value when
 * it has one and the theme's default otherwise; any other `var()` or `calc()` is unknown and counted
 * as above zero, and `initial`, `unset` and `revert` are the initial `0s`.
 */
function isPositiveTime(raw: string, twDuration: string | undefined): boolean {
  const value = raw.trim().toLowerCase();
  if (value.startsWith('var(--tw-duration'))
    return twDuration === undefined || isPositiveTime(twDuration, undefined);
  if (/^(var|calc)\(/.test(value) || value === 'inherit') return true;
  if (value === 'initial' || value === 'unset' || value === 'revert') return false;
  const time = TIME.exec(value);
  return time ? Number(time[1]) > 0 : false;
}

/**
 * What one transition declaration sets: a property list, a time, or both. A transition runs when its
 * duration plus its delay is above zero, so a delay alone (`duration-0 delay-300`) counts: every frame
 * GSAP writes then waits out the delay before it shows.
 */
function transitionParts(
  d: Declaration,
  twDuration: string | undefined,
): { names?: string[]; positive?: boolean } {
  const times = (value: string) =>
    splitTopLevel(value, /,/).some((v) => isPositiveTime(v, twDuration));
  if (d.property === 'transition-property')
    // A property list left to a custom property is unknown, so it counts as `all`.
    return { names: splitTopLevel(d.value, /,/).map((n) => (n.startsWith('var(') ? 'all' : n)) };
  if (d.property === 'transition-duration' || d.property === 'transition-delay')
    return { positive: times(d.value) };
  // The shorthand: `<property> <duration> <easing> <delay>` per item; the first time is the duration.
  const names: string[] = [];
  let positive = false;
  for (const item of splitTopLevel(d.value, /,/)) {
    const words = splitTopLevel(item, /\s/);
    const itemTimes = words.filter((w) => TIME.test(w) || /^(var|calc)\(/i.test(w));
    const name = words.find(
      (w) =>
        !TIME.test(w) &&
        !/\(/.test(w) &&
        !/^(ease(-in|-out|-in-out)?|linear|step-start|step-end|allow-discrete|normal)$/i.test(w),
    );
    names.push(name ?? 'all');
    positive ||= itemTimes.some((t) => isPositiveTime(t, twDuration));
  }
  return { names, positive };
}

/** The transition one set of declarations gives, with the style attribute beating every class. */
function coverageOf(declarations: Declaration[], twDuration: string | undefined) {
  const parts = (inline: boolean) =>
    declarations
      .filter(
        (d) =>
          (d.source === 'style attribute') === inline &&
          (d.property === 'transition' || TRANSITION_LONGHANDS.includes(d.property)),
      )
      .map((d) => ({ d, ...transitionParts(d, twDuration) }));
  const inline = parts(true);
  const fromClasses = parts(false);
  const nameParts = inline.some((p) => p.names) ? inline : fromClasses;
  const timeParts = inline.some((p) => p.positive !== undefined) ? inline : fromClasses;
  const properties = new Set<string>();
  const sources = new Set<string>();
  if (!timeParts.some((p) => p.positive)) return { properties, sources };
  const listed = nameParts.filter((p) => p.names);
  if (listed.length) listed.forEach((p) => p.names?.forEach((name) => properties.add(name)));
  else properties.add('all');
  properties.delete('none');
  for (const p of [...listed, ...timeParts]) if (p.names || p.positive) sources.add(p.d.source);
  return { properties, sources };
}

/**
 * The properties the declarations transition, and which rules say so. `transition-property` starts
 * as `all` and `transition-duration` as `0s`, so a class that sets only a duration (`duration-300`
 * alone) transitions every property, and a property list with no time transitions none. The element
 * at rest and the element in some state are worked out apart and joined, so a state rule can add a
 * transition but never hide the one at rest: `hover:transition-colors duration-300` still eases every
 * property until the pointer arrives, and `motion-reduce:duration-0` does not turn it off.
 */
function transitionCoverage(declarations: Declaration[], defaultDuration: string | undefined) {
  const atRest = declarations.filter((d) => !d.conditional);
  const twDuration = (list: Declaration[]) =>
    list.find((d) => d.property === '--tw-duration')?.value ?? defaultDuration;
  const rest = coverageOf(atRest, twDuration(atRest));
  const anyState = coverageOf(
    declarations,
    declarations.find((d) => d.property === '--tw-duration' && isPositiveTime(d.value, undefined))
      ?.value ?? twDuration(atRest),
  );
  return {
    properties: new Set([...rest.properties, ...anyState.properties]),
    sources: new Set([...rest.sources, ...anyState.sources]),
  };
}

/** The longhands of the shorthands a transition list or a tween may name. */
const LONGHANDS: Record<string, string[]> = {
  background:
    'background-color,background-image,background-position,background-size,background-repeat,background-origin,background-clip,background-attachment'.split(
      ',',
    ),
  border:
    'border-color,border-style,border-width,border-top,border-right,border-bottom,border-left'.split(
      ',',
    ),
  'border-color': 'border-top-color,border-right-color,border-bottom-color,border-left-color'.split(
    ',',
  ),
  'border-width': 'border-top-width,border-right-width,border-bottom-width,border-left-width'.split(
    ',',
  ),
  outline: ['outline-color', 'outline-style', 'outline-width'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  font: ['font-style', 'font-weight', 'font-size', 'line-height', 'font-family'],
  'text-decoration': ['text-decoration-color', 'text-decoration-line', 'text-decoration-style'],
};

function covers(transitioned: Set<string>, property: string): boolean {
  if (transitioned.has('all') || transitioned.has(property)) return true;
  return [...transitioned].some(
    (name) => LONGHANDS[name]?.includes(property) || LONGHANDS[property]?.includes(name),
  );
}

/**
 * The properties any element's CSS transitions, `all` included when nothing narrows it: for an
 * element GSAP does not tween, such as a fill whose width React rewrites every frame.
 */
export async function cssTransitions(el: Element): Promise<Set<string>> {
  const { byClass, defaultDuration } = await stylesheetFor(classNamesOf(el));
  const declarations = classNamesOf(el).flatMap((name) => byClass.get(name) ?? []);
  for (const d of declarationsIn(el.getAttribute('style') ?? '')) {
    if (/^transition(-|$)/.test(d.property))
      declarations.push({ ...d, source: 'style attribute', conditional: false });
  }
  return transitionCoverage(declarations, defaultDuration).properties;
}

function describeElement(el: Element): string {
  const firstClass = classNamesOf(el)[0];
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return `<${el.tagName.toLowerCase()}${firstClass ? ` class="${firstClass} …"` : ''}> "${text}"`;
}

/**
 * Every place in `root` where CSS fights a GSAP tween, as a sentence naming the element, the property
 * and the rule responsible. Empty when there is none.
 */
export async function gsapCssConflicts(root: Element): Promise<string[]> {
  const tweened = new Map<Element, Tweened>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const info = tweenInfo(el);
    if (info.properties.size || info.pinsTransform) tweened.set(el, info);
  }
  // Read once, so a class added while the stylesheet compiles cannot miss its rules.
  const classLists = new Map([...tweened.keys()].map((el) => [el, classNamesOf(el)]));
  const { byClass, defaultDuration } = await stylesheetFor([
    ...new Set([...classLists.values()].flat()),
  ]);
  const conflicts: string[] = [];
  for (const [el, { properties, pinsTransform }] of tweened) {
    const declarations = (classLists.get(el) ?? []).flatMap((name) => byClass.get(name) ?? []);
    // The style attribute also holds GSAP's own writes, so only what CSS adds is read from it.
    for (const d of declarationsIn(el.getAttribute('style') ?? '')) {
      if (/^(transition|animation)(-|$)/.test(d.property))
        declarations.push({ ...d, source: 'style attribute', conditional: false });
    }
    const who = describeElement(el);

    const coverage = transitionCoverage(declarations, defaultDuration);
    for (const property of properties) {
      if (covers(coverage.properties, property))
        conflicts.push(
          `${who}: GSAP tweens ${property}, which ${[...coverage.sources].join(' + ')} transitions`,
        );
    }

    for (const { property, value, source } of declarations) {
      if (
        (property === 'animation' || property === 'animation-name') &&
        value.toLowerCase() !== 'none'
      )
        conflicts.push(
          `${who}: ${source} runs a CSS animation, which outranks GSAP's inline values`,
        );
    }

    for (const { property, source, conditional } of declarations) {
      if (
        !conditional ||
        property.startsWith('--') ||
        /^(transition|animation)(-|$)/.test(property)
      )
        continue;
      if (properties.has(property) || (pinsTransform && TRANSFORMS.has(property)))
        conflicts.push(`${who}: ${source} sets ${property}, which GSAP's inline value overrides`);
    }
  }
  return conflicts;
}
