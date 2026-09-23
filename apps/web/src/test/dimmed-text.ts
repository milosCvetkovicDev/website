/**
 * The scanner behind `dimmed-text.test.ts`, which says what it enforces and why. It parses a module
 * with the TypeScript compiler API and reports every dimming declared in its markup, each with
 * whether the text it reaches is there to be dimmed.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GLOBALS_CSS = path.join(appDir, 'src/app/globals.css');
/** Tailwind's own theme, resolved the way the build resolves the package rather than by a path. */
const TAILWIND_THEME = createRequire(import.meta.url).resolve('tailwindcss/theme.css');

// --- Reading values ------------------------------------------------------------------------------

/** `text` split at every `separator` outside brackets, parentheses and quotes, empty parts dropped. */
function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '[' || char === '(') {
      depth++;
    } else if (char === ']' || char === ')') {
      depth--;
    } else if (char === separator && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** A CSS opacity or alpha as a fraction: `.5`, `50%`, `1e0`. NaN when it is not a number. */
function fraction(amount: string): number {
  const value = amount.trim();
  const number = /^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/i;
  if (value.endsWith('%') && number.test(value.slice(0, -1))) {
    return Number(value.slice(0, -1)) / 100;
  }
  return number.test(value) ? Number(value) : NaN;
}

/** Strictly between hidden and whole. An amount the scan cannot read, such as a `var()`, counts. */
const partial = (value: number) => Number.isNaN(value) || (value > 0 && value < 1);

/**
 * A Tailwind opacity or alpha as a fraction: a bare number is a percentage (`/50`, `opacity-2.5`),
 * an arbitrary value is CSS (`[.5]`, `[50%]`), and anything else is unknown.
 */
function tailwindAmount(amount: string): number {
  if (/^(?:\d*\.)?\d+$/.test(amount)) return Number(amount) / 100;
  const arbitrary = /^\[(.*)\]$/.exec(amount);
  return arbitrary ? fraction(arbitrary[1].replace(/_/g, ' ')) : NaN;
}

/** The most translucent of several alphas: a partial one first, then the lowest. */
function leastOpaque(alphas: number[]): number {
  return alphas.find(partial) ?? (alphas.length > 0 ? Math.min(...alphas) : 1);
}

/**
 * The alpha of a CSS colour: 1 when it is opaque, 0 for `transparent`, NaN when the scan cannot read
 * it. A `var()` is followed through the stylesheets in every theme and its most translucent value
 * counts; so does the more translucent side of a `light-dark()`, and a `color-mix()` mixes the
 * alphas of its colours by their weights.
 */
function alphaOf(colour: string, seen: ReadonlySet<string> = new Set()): number {
  const value = colour.replace(/_/g, ' ').trim();
  if (/^transparent$/i.test(value)) return 0;
  const variable = /^(?:var|theme)\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(value);
  if (variable) {
    if (seen.has(variable[1])) return 1;
    const next = new Set(seen).add(variable[1]);
    const values = properties.get(variable[1]) ?? (variable[2] ? [variable[2]] : []);
    return leastOpaque(values.map((each) => alphaOf(each, next)));
  }
  const hex = /^#(?:[\da-f]{3}([\da-f])|[\da-f]{6}([\da-f]{2}))$/i.exec(value);
  if (hex) return parseInt(hex[1] ? hex[1].repeat(2) : hex[2], 16) / 255;
  const call = /^([\w-]+)\(([\s\S]*)\)$/.exec(value);
  if (!call) return 1;
  const [, name, args] = call;
  if (/^light-dark$/i.test(name)) {
    return leastOpaque(splitOutside(args, ',').map((side) => alphaOf(side, seen)));
  }
  if (/^color-mix$/i.test(name)) return mixedAlpha(splitOutside(args, ',').slice(1), seen);
  if (!/^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(name)) return 1;
  const slashed = splitOutside(args, '/');
  if (slashed.length > 1) return fraction(slashed[slashed.length - 1]);
  const commas = splitOutside(args, ',');
  // `rgba(r, g, b, a)`, or `rgba(var(--channels), a)` with the channels held in a variable.
  const channelsInVariable = commas.length > 1 && commas.length < 4 && /^var\(/.test(commas[0]);
  return commas.length === 4 || channelsInVariable ? fraction(commas[commas.length - 1]) : 1;
}

/**
 * The alpha `color-mix()` gives two colours: their alphas weighted by their percentages, an unset
 * percentage taking what the other leaves, and scaled down when the two add up to less than 100%.
 */
function mixedAlpha(parts: string[], seen: ReadonlySet<string>): number {
  if (parts.length !== 2) return NaN;
  const [first, second] = parts.map((part) => {
    const words = splitOutside(part, ' ');
    const weight = words.length > 1 ? fraction(words[words.length - 1]) : NaN;
    const colour = Number.isNaN(weight) ? part : words.slice(0, -1).join(' ');
    return { alpha: alphaOf(colour, seen), weight };
  });
  const firstWeight = Number.isNaN(first.weight)
    ? Number.isNaN(second.weight)
      ? 0.5
      : 1 - second.weight
    : first.weight;
  const secondWeight = Number.isNaN(second.weight) ? 1 - firstWeight : second.weight;
  const total = firstWeight + secondWeight;
  if (total <= 0) return NaN;
  const mixed = (first.alpha * firstWeight + second.alpha * secondWeight) / total;
  return mixed * Math.min(total, 1);
}

/** Whether a CSS colour is translucent, or one whose alpha the scan cannot read. */
const translucent = (colour: string) => partial(alphaOf(colour));

// --- What the stylesheets define -----------------------------------------------------------------

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selector: string;
  /** The rule's own declarations, without those of the blocks nested in it. */
  declarations: string;
}

/**
 * Every block in `css`, nested ones included, with its selector or at-rule and its declarations. A
 * comment is dropped, and a quoted string or an escaped character is copied whole, so that a brace
 * or a semicolon inside one ends nothing: `content: "}"` stays a declaration.
 */
function rulesIn(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: Rule[] = [];
  let text = '';
  for (let at = 0; at < css.length; at++) {
    const char = css[at];
    if (char === '/' && css[at + 1] === '*') {
      const end = css.indexOf('*/', at + 2);
      at = end === -1 ? css.length : end + 1;
    } else if (char === '"' || char === "'") {
      let end = at + 1;
      // A string left open ends at the end of its line, as CSS ends it.
      while (end < css.length && css[end] !== char && css[end] !== '\n') {
        end += css[end] === '\\' ? 2 : 1;
      }
      text += css.slice(at, end + 1);
      at = end;
    } else if (char === '\\') {
      text += css.slice(at, at + 2);
      at += 1;
    } else if (char === '{') {
      open.push({ selector: text.trim(), declarations: '' });
      text = '';
    } else if (char === '}') {
      const rule = open.pop();
      if (rule) {
        rule.declarations += text;
        rules.push(rule);
      }
      text = '';
    } else if (char === ';') {
      if (open.length > 0) open[open.length - 1].declarations += `${text};`;
      text = '';
    } else {
      text += char;
    }
  }
  return rules;
}

/** Each declaration of a rule, in order. */
const declarationsOf = (rule: Rule) =>
  [...rule.declarations.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map(([, property, value]) => ({
    property,
    value: value.trim(),
  }));

/** Every custom property `css` declares, with each value it takes: one per theme. */
function customPropertiesIn(css: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [, name, value] of withoutComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    found.set(name, [...(found.get(name) ?? []), value.trim()]);
  }
  return found;
}

/**
 * The opacity a keyframe's declarations leave, or undefined when they set none: its `opacity`, a
 * `filter: opacity()`, or the alpha of its `color`, whichever is the most translucent.
 */
function keyframeOpacity(declarations: { property: string; value: string }[]): number | undefined {
  const values = declarations.flatMap(({ property, value }) => {
    if (property === 'opacity') return [fraction(value)];
    if (property === 'filter') {
      const inner = /opacity\(([^)]*)\)/.exec(value);
      return inner ? [fraction(inner[1])] : [];
    }
    return property === 'color' ? [alphaOf(value)] : [];
  });
  return values.length > 0 ? leastOpaque(values) : undefined;
}

/**
 * The opacities each `@keyframes` rule in `css` passes through, by name, counting an unset start or
 * end as the element's own 1. Rules that leave opacity alone are left out; a name defined twice
 * keeps both definitions.
 */
export function keyframesIn(css: string): Map<string, number[][]> {
  const found = new Map<string, number[][]>();
  const rules = rulesIn(css);
  for (const [index, rule] of rules.entries()) {
    const name = /^@keyframes\s+['"]?([\w-]+)['"]?$/.exec(rule.selector)?.[1];
    if (!name) continue;
    // A keyframes block closes after its steps, so its steps are the rules just before it.
    const steps: { selectors: string[]; opacity: number | undefined }[] = [];
    for (let before = index - 1; before >= 0; before--) {
      const step = rules[before];
      if (!/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(step.selector)) break;
      steps.unshift({
        selectors: step.selector.split(',').map((selector) => selector.trim()),
        opacity: keyframeOpacity(declarationsOf(step)),
      });
    }
    const set = steps.flatMap((step) => (step.opacity === undefined ? [] : [step.opacity]));
    if (set.length === 0) continue;
    const at = (edge: RegExp) =>
      steps.find((step) => step.opacity !== undefined && step.selectors.some((s) => edge.test(s)))
        ?.opacity ?? 1;
    found.set(name, [...(found.get(name) ?? []), [...set, at(/^(from|0%)$/), at(/^(to|100%)$/)]]);
  }
  return found;
}

/**
 * Every animation each `animate-*` utility can run: Tailwind's `--animate-*` theme values, and the
 * `.animate-*` classes and `@utility animate-*` rules of a stylesheet, nested ones included. A
 * utility keeps them all, so a later override such as a reduced-motion `animation: none` cannot
 * hide the one that dims.
 */
export function animationUtilitiesIn(css: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const add = (name: string, shorthand: string) =>
    found.set(name, [...(found.get(name) ?? []), shorthand]);
  for (const rule of rulesIn(css)) {
    const declarations = declarationsOf(rule);
    for (const { property, value } of declarations) {
      const theme = /^--animate-([\w-]+)$/.exec(property);
      if (theme) add(theme[1], value);
    }
    const value = (property: string) => declarations.find((d) => d.property === property)?.value;
    const longhands = ['name', 'duration', 'timing-function', 'iteration-count', 'fill-mode'];
    const shorthand =
      value('animation') ?? longhands.flatMap((part) => value(`animation-${part}`) ?? []).join(' ');
    if (!shorthand) continue;
    for (const [, name] of rule.selector.matchAll(/(?:\.|@utility\s+)animate-([\w-]+)/g)) {
      add(name, shorthand);
    }
  }
  return found;
}

/**
 * Whether an animation leaves what it animates part-transparent: a keyframe holds an opacity between
 * 0 and 1, or a loop moves between two opacities other than in a single step. A single run from or
 * to 0, such as a reveal, passes through partial values only on its way.
 */
export function animationDims(
  shorthand: string,
  keyframes: ReadonlyMap<string, number[][]>,
): boolean {
  return splitOutside(shorthand, ',').some((animation) => {
    const words = splitOutside(animation, ' ');
    const loops = words.some(
      (word) => word === 'infinite' || (/^(?:\d*\.)?\d+$/.test(word) && Number(word) > 1),
    );
    const binary = words.some((word) =>
      /^(steps\(\s*1\s*(,[^)]*)?\)|step-start|step-end)$/.test(word),
    );
    return words
      .flatMap((word) => keyframes.get(word) ?? [])
      .some(
        (opacities) => opacities.some(partial) || (loops && !binary && new Set(opacities).size > 1),
      );
  });
}

function merged<T>(...maps: Map<string, T[]>[]): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const map of maps) {
    for (const [key, list] of map) result.set(key, [...(result.get(key) ?? []), ...list]);
  }
  return result;
}

const tailwindTheme = readFileSync(TAILWIND_THEME, 'utf8');
const globalsCss = readFileSync(GLOBALS_CSS, 'utf8');
const properties = merged(customPropertiesIn(tailwindTheme), customPropertiesIn(globalsCss));

/** What classes and styles can name, read from Tailwind's theme and from globals.css. */
export const vocabulary = {
  colours: new Set(
    [tailwindTheme, globalsCss].flatMap((css) =>
      [...withoutComments(css).matchAll(/--color-([\w-]+)\s*:/g)].map(([, name]) => name),
    ),
  ),
  properties,
  keyframes: merged(keyframesIn(tailwindTheme), keyframesIn(globalsCss)),
  animations: merged(animationUtilitiesIn(tailwindTheme), animationUtilitiesIn(globalsCss)),
};

// --- Which class tokens dim ----------------------------------------------------------------------

/** What a dimming acts on: the colour text inherits, the fill SVG text takes, or everything. */
type Kind = 'color' | 'fill' | 'opacity' | 'animation';

/**
 * Where a utility lands: on the element, on its generated content or its placeholder, or on the
 * children, descendants or siblings its variant selects, a descendant perhaps by tag.
 */
type Target =
  | { on: 'self' | 'placeholder' | 'siblings' | 'before' | 'after' }
  | { on: 'children' | 'descendants'; tag?: string };

interface Dimming {
  kind: Kind;
  target: Target;
}

/** A variant for an inactive control, whose text WCAG 1.4.3 exempts and axe does not measure. */
const INACTIVE = /^(group-|peer-)?(aria-)?disabled(\/[\w-]+)?$/;

/** Where a token's variants aim its utility, or null when they aim it at something with no text. */
function targetOf(variants: string[]): Target | null {
  let target: Target = { on: 'self' };
  for (const variant of variants) {
    if (INACTIVE.test(variant) || variant === 'backdrop') return null;
    if (variant === 'before' || variant === 'after' || variant === 'placeholder') {
      target = { on: variant };
    } else if (variant === '*' || variant === '**') {
      target = { on: variant === '*' ? 'children' : 'descendants' };
    } else {
      // An arbitrary variant aims elsewhere when a combinator follows its `&`: `[&_p_span]` selects
      // the spans in the element's paragraphs, `[&>li]` its list items, `[&+p]` a sibling.
      const selector = /^\[(.*)\]$/.exec(variant)?.[1].replace(/_/g, ' ');
      const after = selector?.split('&')[1];
      if (after !== undefined && /^\s*[>+~]|^\s+\S/.test(after)) {
        const combinator = /^\s*([>+~])/.exec(after)?.[1];
        const steps = after.replace(/^\s*[>+~]?\s*/, '').split(/\s*[>+~]\s*|\s+/);
        const tag = /^[a-z][a-z0-9-]*/i.exec(steps[steps.length - 1] ?? '')?.[0];
        target =
          combinator === '+' || combinator === '~'
            ? { on: 'siblings' }
            : { on: combinator === '>' && steps.length === 1 ? 'children' : 'descendants', tag };
      }
    }
  }
  return target;
}

/** Arbitrary `text-[…]` values Tailwind v4 reads as a font size: a length, a math function, a keyword. */
const FONT_SIZE = /^(-?[\d.]+[a-z%]*|(calc|clamp|min|max)\(.*)$/;
const FONT_SIZE_KEYWORD = /^((x{1,3}-)?(small|medium|large)|smaller|larger)$/;

/**
 * Whether `text-<value>` sets a colour rather than a font size, the other thing a slash can follow
 * (`text-sm/6` is a size and a line height). An arbitrary value is read as Tailwind v4 reads it: a
 * length, a math function, a size keyword or a hint such as `length:` makes a size, and anything
 * else, a bare `var()` included, is a colour. A name is a colour when a theme declares it.
 */
function isTextColour(value: string): boolean {
  const arbitrary = /^\[(.*)\]$/.exec(value);
  if (arbitrary) {
    const inner = arbitrary[1];
    if (inner.startsWith('color:')) return true;
    if (/^[a-z-]+:/.test(inner)) return false;
    return !FONT_SIZE.test(inner) && !FONT_SIZE_KEYWORD.test(inner);
  }
  const variable = /^\((.*)\)$/.exec(value);
  if (variable) return /^(color:)?--/.test(variable[1]);
  return value === 'current' || vocabulary.colours.has(value);
}

/** Whether a colour value carries an alpha of its own: inside it, or in the token it names. */
function colourHasAlpha(value: string): boolean {
  const arbitrary = /^\[(?:color:)?(.*)\]$/.exec(value);
  if (arbitrary) return translucent(arbitrary[1]);
  const variable = /^\((?:color:)?(--[\w-]+)\)$/.exec(value);
  if (variable) return translucent(`var(${variable[1]})`);
  return vocabulary.colours.has(value) && translucent(`var(--color-${value})`);
}

/**
 * Whether an `animate-*` value dims: a named utility, an arbitrary value, or a variable, which counts
 * when the stylesheets do not declare it.
 */
function animateDims(value: string): boolean {
  const arbitrary = /^\[(.*)\]$/.exec(value);
  const variable = /^\((--[\w-]+)\)$/.exec(value);
  const shorthands = arbitrary
    ? [arbitrary[1].replace(/_/g, ' ')]
    : variable
      ? vocabulary.properties.get(variable[1])
      : vocabulary.animations.get(value);
  if (shorthands === undefined) return variable !== null;
  return shorthands.some((shorthand) => animationDims(shorthand, vocabulary.keyframes));
}

/** What a utility dims, whatever its variants aim it at, or null when it dims nothing. */
function utilityKind(utility: string): Kind | null {
  const property = /^\[(opacity|color|fill|filter|animation):(.+)\]$/.exec(utility);
  if (property) {
    const [, name, raw] = property;
    const value = raw.replace(/_/g, ' ');
    if (name === 'opacity') return partial(fraction(value)) ? 'opacity' : null;
    if (name === 'filter') {
      const inner = /opacity\(([^)]*)\)/.exec(value);
      return inner && partial(fraction(inner[1])) ? 'opacity' : null;
    }
    if (name === 'animation')
      return animationDims(value, vocabulary.keyframes) ? 'animation' : null;
    if (!translucent(value)) return null;
    return name === 'fill' ? 'fill' : 'color';
  }
  const [base, ...modifier] = splitOutside(utility, '/');
  const alpha = modifier.length > 0 && partial(tailwindAmount(modifier.join('/')));
  const paint = /^(text|placeholder|fill)-(.+)$/.exec(base);
  if (paint && (paint[1] === 'fill' ? paint[2] !== 'none' : isTextColour(paint[2]))) {
    if (!alpha && !colourHasAlpha(paint[2])) return null;
    return paint[1] === 'fill' ? 'fill' : 'color';
  }
  const opacity = /^opacity-(.+)$/.exec(base);
  if (opacity && modifier.length === 0) {
    return partial(tailwindAmount(opacity[1])) ? 'opacity' : null;
  }
  const animation = /^animate-(.+)$/.exec(base);
  return animation && animateDims(animation[1]) ? 'animation' : null;
}

/** How a class token dims, and what, or null when it dims nothing that could hold text. */
function dimming(token: string): Dimming | null {
  const variants = splitOutside(token, ':');
  const utility = (variants.pop() ?? '').replace(/^!|!$/g, '');
  const target = targetOf(variants);
  const kind = target && utilityKind(utility);
  if (!target || !kind) return null;
  return { kind, target: utility.startsWith('placeholder-') ? { on: 'placeholder' } : target };
}

// --- Where a class lands -------------------------------------------------------------------------

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

type StringNode =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail;

/** A piece of source text that may hold class names. */
interface Chunk {
  node: ts.Node;
  text: string;
  /** The offset `text` starts at, and whether each token's offset follows from it. */
  start: number;
  exact: boolean;
  /** Whether it applies only some of the time: a branch of a condition, a clsx key, one map entry. */
  conditional: boolean;
}

const openingOf = (element: JsxTag) =>
  ts.isJsxElement(element) ? element.openingElement : element;

const isIntrinsic = (tag: string) => /^[a-z]/.test(tag);

function isStringNode(node: ts.Node): node is StringNode {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

/**
 * The text of a string between its delimiters: a quote, a backtick, or a substitution's `}` and `${`.
 * Where escapes make the page's text differ from the source, the page's text is read, at the
 * string's own offset.
 */
function chunkOf(node: StringNode | ts.Identifier, conditional: boolean): Chunk {
  const raw = node.getText();
  const start = node.getStart();
  if (ts.isIdentifier(node)) return { node, text: raw, start, exact: true, conditional };
  const closing = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? 2 : 1;
  const source = raw.slice(1, raw.length - closing);
  const exact = source === node.text;
  return { node, text: node.text, start: start + 1, exact, conditional };
}

const tokensIn = (chunk: Chunk) =>
  [...chunk.text.matchAll(/\S+/g)].map((match) => ({
    token: match[0],
    at: chunk.start + (chunk.exact ? match.index : 0),
  }));

/** Attributes and props that hold classes: `className`, `classNames`, `titleClass`, `labelClassName`. */
const isClassName = (name: string) => /^class(Name)?(es|s)?$|Class(Name)?(es|s)?$/.test(name);

const LOGICAL = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

/** What a function returns: its expression body, or every `return` outside nested functions. */
function returnedExpressions(fn: ts.FunctionLikeDeclaration): ts.Expression[] {
  const body = fn.body;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];
  const found: ts.Expression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      if (node.expression) found.push(node.expression);
    } else if (!ts.isFunctionLike(node)) {
      ts.forEachChild(node, visit);
    }
  };
  ts.forEachChild(body, visit);
  return found;
}

type Binding = ts.ParameterDeclaration | ts.BindingElement | ts.VariableDeclaration;

function bindingNamed(node: Binding, text: string): Binding | undefined {
  if (ts.isIdentifier(node.name)) return node.name.text === text ? node : undefined;
  for (const element of node.name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    const found = bindingNamed(element, text);
    if (found) return found;
  }
  return undefined;
}

function propertyKey(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
    return name.expression.text;
  }
  return undefined;
}

/**
 * A property's value; a shorthand property's is the name it repeats, and a method's or a getter's
 * is the function itself, which the callers read through what it returns.
 */
function propertyValue(property: ts.ObjectLiteralElementLike): ts.Node | undefined {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  if (ts.isMethodDeclaration(property) || ts.isGetAccessorDeclaration(property)) return property;
  return undefined;
}

const propertyNamed = (object: ts.ObjectLiteralExpression, key: string) =>
  object.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property) ||
        ts.isMethodDeclaration(property) ||
        ts.isGetAccessorDeclaration(property)) &&
      propertyKey(property) === key,
  );

/** The static key of `object.key` or `object['key']`. */
function staticKey(node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : undefined;
}

/** An object literal an expression can be, and whether it applies only some of the time. */
interface Found {
  object: ts.ObjectLiteralExpression;
  sometimes: boolean;
}

/**
 * The object literals an expression can be within the module: itself, either side of a condition,
 * or what a name, an entry of another object or a local function gives.
 */
function objectLiteralsOf(
  node: ts.Node | undefined,
  seen = new Set<ts.Node>(),
  sometimes = false,
): Found[] {
  if (!node || seen.has(node) || !ts.isExpression(node)) return [];
  seen.add(node);
  const expression = unwrap(node);
  if (ts.isObjectLiteralExpression(expression)) return [{ object: expression, sometimes }];
  if (ts.isConditionalExpression(expression)) {
    return [
      ...objectLiteralsOf(expression.whenTrue, seen, true),
      ...objectLiteralsOf(expression.whenFalse, seen, true),
    ];
  }
  if (ts.isBinaryExpression(expression) && LOGICAL.has(expression.operatorToken.kind)) {
    return [
      ...objectLiteralsOf(expression.left, seen, true),
      ...objectLiteralsOf(expression.right, seen, true),
    ];
  }
  if (ts.isIdentifier(expression)) {
    const held = valuesOf(expression);
    return held.values.flatMap((value) =>
      objectLiteralsOf(value, seen, sometimes || held.sometimes),
    );
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    const key = staticKey(expression);
    if (key === undefined) return [];
    const entries = objectLiteralsOf(expression.expression, seen, sometimes).flatMap((found) => {
      const property = propertyNamed(found.object, key);
      return property ? objectLiteralsOf(propertyValue(property), seen, found.sometimes) : [];
    });
    if (entries.length > 0) return entries;
    return handedMember(expression).flatMap((value) => objectLiteralsOf(value, seen, true));
  }
  if (ts.isCallExpression(expression)) {
    const callee = callableOf(expression.expression);
    const returned = callee ? returnedExpressions(callee) : [];
    return returned.flatMap((value) =>
      objectLiteralsOf(value, seen, sometimes || returned.length > 1),
    );
  }
  return [];
}

/** The value `const { key } = object` gives a name, or the whole initializer when that is unclear. */
function destructured(declaration: ts.VariableDeclaration, binding: Binding): ts.Node | undefined {
  const key =
    ts.isBindingElement(binding) && binding.parent.parent === declaration
      ? (binding.propertyName ?? binding.name)
      : undefined;
  const keyText = key && (ts.isIdentifier(key) || ts.isStringLiteral(key)) ? key.text : undefined;
  if (keyText === undefined) return declaration.initializer;
  for (const { object } of objectLiteralsOf(declaration.initializer)) {
    const property = propertyNamed(object, keyText);
    if (property) return propertyValue(property);
  }
  return declaration.initializer;
}

/**
 * The initializer or function a name refers to, found by walking out through the scopes around it.
 * A parameter without a default, or a loop or `catch` binding, resolves to nothing: its value is not
 * in the source. With `constantsOnly`, so does anything but a `const`: a parameter's default or a
 * `let`'s first value is only one of the values it takes.
 */
function declarationOf(name: ts.Identifier, constantsOnly = false): ts.Node | undefined {
  for (let scope: ts.Node | undefined = name.parent; scope; scope = scope.parent) {
    if (
      ts.isSourceFile(scope) ||
      ts.isBlock(scope) ||
      ts.isModuleBlock(scope) ||
      ts.isCaseClause(scope) ||
      ts.isDefaultClause(scope)
    ) {
      for (const statement of scope.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name.text) {
          return constantsOnly ? undefined : statement;
        }
        if (!ts.isVariableStatement(statement)) continue;
        const constant = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
        for (const declaration of statement.declarationList.declarations) {
          const binding = bindingNamed(declaration, name.text);
          if (!binding) continue;
          if (constantsOnly && !constant) return undefined;
          return binding === declaration
            ? declaration.initializer
            : destructured(declaration, binding);
        }
      }
    }
    const loopBindings =
      (ts.isForOfStatement(scope) || ts.isForInStatement(scope) || ts.isForStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)
        ? scope.initializer.declarations
        : [];
    if (loopBindings.some((declaration) => bindingNamed(declaration, name.text))) return undefined;
    if (
      ts.isCatchClause(scope) &&
      scope.variableDeclaration &&
      bindingNamed(scope.variableDeclaration, name.text)
    ) {
      return undefined;
    }
    if (ts.isFunctionLike(scope)) {
      for (const parameter of scope.parameters) {
        const binding = bindingNamed(parameter, name.text);
        if (binding) return constantsOnly ? undefined : binding.initializer;
      }
    }
  }
  return undefined;
}

/**
 * Every value a name can hold that the source shows, and whether it holds any of them only some of
 * the time: a `const` holds its value, a `let` its first value and every later assignment in its
 * scope, and a parameter its default only when a caller passes nothing. A component's prop also
 * holds what the module's own elements hand it.
 */
function valuesOf(name: ts.Identifier): { values: ts.Node[]; sometimes: boolean } {
  const declared = declarationOf(name);
  const binding = bindingOf(name);
  if (!binding) return { values: declared ? [declared] : [], sometimes: false };
  if (ts.isParameter(binding) || (ts.isBindingElement(binding) && !variableOf(binding))) {
    const prop = propOf(binding);
    const handed = prop ? handedTo(prop.component, prop.key) : [];
    return { values: [...(declared ? [declared] : []), ...handed], sometimes: true };
  }
  const variable = ts.isVariableDeclaration(binding) ? binding : variableOf(binding);
  const list = variable?.parent;
  if (!list || !ts.isVariableDeclarationList(list) || list.flags & ts.NodeFlags.Const) {
    return { values: declared ? [declared] : [], sometimes: false };
  }
  const assigned: ts.Node[] = [];
  const scope = list.parent.parent;
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
      ts.isIdentifier(node.left) &&
      node.left.text === name.text
    ) {
      assigned.push(node.right);
    }
    ts.forEachChild(node, visit);
  };
  if (scope) visit(scope);
  const values = [...(declared ? [declared] : []), ...assigned];
  return { values, sometimes: assigned.length > 0 };
}

/** A function that can be a component: what `localComponent` finds behind a tag. */
const isComponentFunction = (
  node: ts.Node,
): node is ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression =>
  ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** The component and prop a parameter's binding reads: `tone` in `function Label({ tone })`. */
function propOf(
  binding: Binding,
): { component: ts.FunctionLikeDeclaration; key: string } | undefined {
  if (!ts.isBindingElement(binding) || binding.dotDotDotToken) return undefined;
  const pattern = binding.parent;
  const parameter = pattern.parent;
  if (!ts.isObjectBindingPattern(pattern) || !ts.isParameter(parameter)) return undefined;
  const component = parameter.parent;
  if (!isComponentFunction(component) || component.parameters[0] !== parameter) return undefined;
  const key = binding.propertyName ?? binding.name;
  return ts.isIdentifier(key) || ts.isStringLiteral(key) ? { component, key: key.text } : undefined;
}

/** What the module's own elements hand `props.tone`, where `props` is a component's parameter. */
function handedMember(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): ts.Node[] {
  const key = staticKey(node);
  const object = unwrap(node.expression);
  if (key === undefined || !ts.isIdentifier(object)) return [];
  const parameter = bindingOf(object);
  if (!parameter || !ts.isParameter(parameter) || !ts.isIdentifier(parameter.name)) return [];
  const component = parameter.parent;
  return isComponentFunction(component) && component.parameters[0] === parameter
    ? handedTo(component, key)
    : [];
}

/** The elements of a module that render each of its own components, found once per module. */
const renderers = new WeakMap<ts.SourceFile, Map<ts.Node, ts.JsxOpeningLikeElement[]>>();

function renderersOf(component: ts.FunctionLikeDeclaration): ts.JsxOpeningLikeElement[] {
  const sourceFile = component.getSourceFile();
  let byComponent = renderers.get(sourceFile);
  if (!byComponent) {
    // Stored before the walk, so that a lookup that needs the map again finds it, if partly.
    const found = new Map<ts.Node, ts.JsxOpeningLikeElement[]>();
    renderers.set(sourceFile, found);
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const rendered = localComponent(node.tagName);
        if (rendered) found.set(rendered, [...(found.get(rendered) ?? []), node]);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    byComponent = found;
  }
  return byComponent.get(component) ?? [];
}

/** The component props being resolved, so that a component that hands a prop to itself ends. */
const handing: { component: ts.Node; key: string }[] = [];

/**
 * What the module's own elements hand a component's prop: the `tone={…}` of each `<Label>`, or
 * the `tone` of an object one spreads. A class or a style prop is left out, because it lands on
 * the `<Label>` element itself, where the scan judges it against what the component renders.
 */
function handedTo(component: ts.FunctionLikeDeclaration, key: string): ts.Node[] {
  if (isClassName(key) || key === 'style') return [];
  if (handing.some((entry) => entry.component === component && entry.key === key)) return [];
  handing.push({ component, key });
  try {
    return renderersOf(component).flatMap((opening) =>
      opening.attributes.properties.flatMap((attribute): ts.Node[] => {
        if (ts.isJsxSpreadAttribute(attribute)) {
          return objectLiteralsOf(attribute.expression).flatMap(({ object }) => {
            const property = propertyNamed(object, key);
            const value = property && propertyValue(property);
            return value ? [value] : [];
          });
        }
        const value = attribute.name.getText() === key ? attribute.initializer : undefined;
        if (!value) return [];
        return ts.isJsxExpression(value) ? (value.expression ? [value.expression] : []) : [value];
      }),
    );
  } finally {
    handing.pop();
  }
}

/** The declaration a binding element sits in, when it is a variable's rather than a parameter's. */
function variableOf(binding: ts.BindingElement): ts.VariableDeclaration | undefined {
  let current: ts.Node = binding;
  while (
    ts.isBindingElement(current) ||
    ts.isObjectBindingPattern(current) ||
    ts.isArrayBindingPattern(current)
  ) {
    current = current.parent;
  }
  return ts.isVariableDeclaration(current) ? current : undefined;
}

/**
 * The binding a name refers to: a variable, a parameter or one of their destructured names. A loop
 * or `catch` binding stops the search, as it does for declarationOf.
 */
function bindingOf(name: ts.Identifier): Binding | undefined {
  for (let scope: ts.Node | undefined = name.parent; scope; scope = scope.parent) {
    const loop =
      (ts.isForOfStatement(scope) || ts.isForInStatement(scope) || ts.isForStatement(scope)) &&
      scope.initializer &&
      ts.isVariableDeclarationList(scope.initializer)
        ? scope.initializer.declarations
        : [];
    if (loop.some((declaration) => bindingNamed(declaration, name.text))) return undefined;
    if (
      ts.isCatchClause(scope) &&
      scope.variableDeclaration &&
      bindingNamed(scope.variableDeclaration, name.text)
    ) {
      return undefined;
    }
    if (
      ts.isSourceFile(scope) ||
      ts.isBlock(scope) ||
      ts.isModuleBlock(scope) ||
      ts.isCaseClause(scope) ||
      ts.isDefaultClause(scope)
    ) {
      for (const statement of scope.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          const found = bindingNamed(declaration, name.text);
          if (found) return found;
        }
      }
    }
    if (ts.isFunctionLike(scope)) {
      for (const parameter of scope.parameters) {
        const found = bindingNamed(parameter, name.text);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** A function whose returns the scan reads: a literal, a declaration, a method or a getter. */
const isReadableFunction = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isGetAccessorDeclaration(node);

/**
 * A function literal, or the same-module function a name or an object's entry refers to, through
 * other names: `const f = S.cls`.
 */
function callableOf(
  node: ts.Node | undefined,
  seen = new Set<ts.Node>(),
): ts.FunctionLikeDeclaration | undefined {
  if (!node || seen.has(node)) return undefined;
  seen.add(node);
  const target = ts.isExpression(node) ? unwrap(node) : node;
  if (ts.isIdentifier(target)) return callableOf(declarationOf(target), seen);
  if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
    const key = staticKey(target);
    if (key === undefined) return undefined;
    for (const { object } of objectLiteralsOf(target.expression)) {
      const property = propertyNamed(object, key);
      const found = property && callableOf(propertyValue(property), seen);
      if (found) return found;
    }
    return undefined;
  }
  return isReadableFunction(target) ? target : undefined;
}

function propertyChunks(
  property: ts.ObjectLiteralElementLike,
  seen: Set<ts.Node>,
  conditional: boolean,
): Chunk[] {
  if (ts.isSpreadAssignment(property)) return classChunks(property.expression, seen, conditional);
  const name = property.name;
  // clsx and friends read a key as a class name, included when its value holds.
  const key =
    name && (ts.isStringLiteral(name) || ts.isIdentifier(name))
      ? [chunkOf(name, true)]
      : name && ts.isComputedPropertyName(name)
        ? classChunks(name.expression, seen, true)
        : [];
  return [...key, ...classChunks(propertyValue(property), seen, conditional)];
}

/**
 * The strings a class value can be built from: its literals, both branches of every condition, the
 * pieces of a template, clsx arguments and keys, and, through the names they use, the constants,
 * map entries and helper functions of the same module.
 */
function classChunks(
  node: ts.Node | undefined,
  seen = new Set<ts.Node>(),
  conditional = false,
): Chunk[] {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  const next = (child: ts.Node | undefined, sometimes = conditional) =>
    classChunks(child, seen, sometimes);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [chunkOf(node, conditional)];
  }
  if (ts.isJsxExpression(node)) return next(node.expression);
  if (ts.isTemplateExpression(node)) {
    return [
      chunkOf(node.head, conditional),
      ...node.templateSpans.flatMap((span) => [
        ...next(span.expression),
        chunkOf(span.literal, conditional),
      ]),
    ];
  }
  if (ts.isTaggedTemplateExpression(node)) return next(node.template);
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSpreadElement(node)
  ) {
    return next(node.expression);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    // `STYLES.icon` reads that entry alone; `tones[tone]` could be any of them; `props.tone` is
    // what the module's own elements hand the component.
    const key = staticKey(node);
    const objects = key === undefined ? [] : objectLiteralsOf(node.expression);
    const found = objects.find(({ object }) => key !== undefined && propertyNamed(object, key));
    const property = found && key !== undefined ? propertyNamed(found.object, key) : undefined;
    if (property) {
      return next(propertyValue(property), conditional || found!.sometimes || objects.length > 1);
    }
    const handed = handedMember(node);
    return handed.length > 0
      ? handed.flatMap((value) => next(value, true))
      : next(node.expression, true);
  }
  if (ts.isConditionalExpression(node)) {
    return [...next(node.whenTrue, true), ...next(node.whenFalse, true)];
  }
  if (ts.isBinaryExpression(node)) {
    const sometimes = conditional || LOGICAL.has(node.operatorToken.kind);
    return [...next(node.left, sometimes), ...next(node.right, sometimes)];
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((element) => next(element));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => propertyChunks(property, seen, conditional));
  }
  if (ts.isCallExpression(node)) {
    // The callee too: `[…].join(' ')` reaches the array, a local helper reaches what it returns.
    return [...next(node.expression), ...node.arguments.flatMap((argument) => next(argument))];
  }
  if (ts.isIdentifier(node)) {
    const held = valuesOf(node);
    return held.values.flatMap((value) => next(value, conditional || held.sometimes));
  }
  if (isReadableFunction(node)) {
    const returned = returnedExpressions(node);
    return returned.flatMap((expression) => next(expression, conditional || returned.length > 1));
  }
  return [];
}

/**
 * The values that set an element's classes: its class attributes, and the classes of an object it
 * spreads, which apply only sometimes when the spread picks between objects.
 */
function classValues(opening: ts.JsxOpeningLikeElement) {
  return opening.attributes.properties.flatMap((attribute) => {
    if (ts.isJsxAttribute(attribute)) {
      return isClassName(attribute.name.getText()) && attribute.initializer
        ? [{ value: attribute.initializer as ts.Node, conditional: false }]
        : [];
    }
    const objects = objectLiteralsOf(attribute.expression);
    return objects.flatMap(({ object, sometimes }) =>
      object.properties.flatMap((property) => {
        const key = propertyKey(property);
        const value = propertyValue(property);
        return key !== undefined && isClassName(key) && value
          ? [{ value, conditional: sometimes || objects.length > 1 }]
          : [];
      }),
    );
  });
}

/**
 * The class tokens an element's classes can hold. With `always`, only those it holds whatever
 * happens, not those of a branch of a condition. A token under a variant such as `hover:` or `md:`
 * applies only sometimes too, and the callers already skip it, because they match bare utilities.
 */
function classTokensOf(opening: ts.JsxOpeningLikeElement, always = false): string[] {
  const cached = classTokenCache.get(opening)?.get(always);
  if (cached) return cached;
  const tokens = classValues(opening).flatMap(({ value, conditional }) =>
    classChunks(value, new Set(), conditional)
      .filter((chunk) => !always || !chunk.conditional)
      .flatMap((chunk) => chunk.text.match(/\S+/g) ?? []),
  );
  if (handing.length === 0) {
    classTokenCache.set(opening, (classTokenCache.get(opening) ?? new Map()).set(always, tokens));
  }
  return tokens;
}

/**
 * Class tokens by element and mode, worked out once: the text walk visits an element once for every
 * path to it, and resolving a class through the props of a chain of components on each visit grows
 * with the number of paths. A result worked out while a prop is being resolved is not kept, since
 * the guard against a component handing a prop to itself may have cut it short.
 */
const classTokenCache = new WeakMap<ts.JsxOpeningLikeElement, Map<boolean, string[]>>();

/**
 * Whether a string can be skipped because it never becomes a class: a type, the value of a DOM
 * attribute such as `d` or `href`, or text rendered as a child. Anything else, a component's props
 * and a call's arguments included, is read, since it might become one.
 */
function neverAClass(node: ts.Node): boolean {
  // Whether only conditions and parentheses stand between the string and where it ends up.
  let passing = true;
  let child: ts.Node = node;
  for (let current = node.parent; current; child = current, current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isJsxAttribute(current)) {
      const tag = current.parent.parent.tagName.getText();
      return !isClassName(current.name.getText()) && isIntrinsic(tag);
    }
    if (
      ts.isJsxExpression(current) &&
      (ts.isJsxElement(current.parent) || ts.isJsxFragment(current.parent))
    ) {
      return passing;
    }
    if (
      ts.isFunctionLike(current) ||
      ts.isJsxSpreadAttribute(current) ||
      ts.isJsxOpeningLikeElement(current)
    ) {
      return false;
    }
    const through =
      ts.isParenthesizedExpression(current) ||
      ts.isJsxExpression(current) ||
      ts.isTemplateExpression(current) ||
      ts.isTemplateSpan(current) ||
      (ts.isConditionalExpression(current) && child !== current.condition) ||
      (ts.isBinaryExpression(current) &&
        LOGICAL.has(current.operatorToken.kind) &&
        child === current.right);
    if (!through) passing = false;
  }
  return false;
}

// --- Styles and attributes -----------------------------------------------------------------------

/**
 * SVG elements whose paint reaches text: text itself, and the containers that pass it down. `a` is
 * one only inside an `<svg>`, since an HTML link ignores presentation attributes.
 */
const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);
const PAINT_HOSTS = new Set(['svg', 'g', 'a', 'symbol', 'switch', ...SVG_TEXT]);

/** Whether an element sits in an `<svg>` of the same markup, and not in its `<foreignObject>`. */
function insideSvg(opening: ts.JsxOpeningLikeElement, seen = new Set<ts.Node>()): boolean {
  if (seen.has(opening)) return false;
  seen.add(opening);
  const element = ts.isJsxOpeningElement(opening) ? opening.parent : opening;
  for (let node = element.parent; node; node = node.parent) {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText();
      if (tag === 'foreignObject') return false;
      if (tag === 'svg') return true;
    } else if (isComponentFunction(node)) {
      // A component of its own is inside an <svg> when the module renders it inside one.
      const renderers = renderersOf(node);
      if (renderers.length > 0) return renderers.some((renderer) => insideSvg(renderer, seen));
    }
  }
  return false;
}

/**
 * Every opacity a value can take that the scan can read: literals, the branches of a condition or a
 * logical operator, and constants of the module. A value it cannot read, such as a prop, gives none.
 */
function amountsOf(node: ts.Node | undefined, seen = new Set<ts.Node>()): number[] {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  if (ts.isJsxExpression(node)) return amountsOf(node.expression, seen);
  if (!ts.isExpression(node)) return [];
  const expression = unwrap(node);
  if (ts.isNumericLiteral(expression)) return [Number(expression.text)];
  if (ts.isStringLiteralLike(expression)) return [fraction(expression.text)];
  if (ts.isConditionalExpression(expression)) {
    return [...amountsOf(expression.whenTrue, seen), ...amountsOf(expression.whenFalse, seen)];
  }
  if (ts.isBinaryExpression(expression) && LOGICAL.has(expression.operatorToken.kind)) {
    return [...amountsOf(expression.left, seen), ...amountsOf(expression.right, seen)];
  }
  if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
    return handedMember(expression).flatMap((value) => amountsOf(value, seen));
  }
  if (!ts.isIdentifier(expression)) return [];
  return valuesOf(expression).values.flatMap((value) => amountsOf(value, seen));
}

interface Declared {
  token: string;
  kind: Kind;
  node: ts.Node;
}

/** What a style property or an SVG attribute dims, if its value dims. */
function propertyKind(name: string, value: ts.Node): Kind | null {
  const strings = () => classChunks(value).map((chunk) => chunk.text);
  if (name === 'opacity') return amountsOf(value).some(partial) ? 'opacity' : null;
  if (name === 'fillOpacity' || name === 'fill-opacity') {
    return amountsOf(value).some(partial) ? 'fill' : null;
  }
  if (name === 'color' || name === 'fill') {
    if (!strings().some(translucent)) return null;
    return name === 'fill' ? 'fill' : 'color';
  }
  if (name === 'animation') {
    return strings().some((text) => animationDims(text, vocabulary.keyframes)) ? 'animation' : null;
  }
  if (name === 'filter') {
    const dims = strings().some((text) => {
      const inner = /opacity\(([^)]*)\)/.exec(text);
      return inner !== null && partial(fraction(inner[1]));
    });
    return dims ? 'opacity' : null;
  }
  return null;
}

/**
 * The properties a `style` value can set, through names, conditions and spreads, each with whether
 * it applies only some of the time.
 */
function styleProperties(
  value: ts.Node | undefined,
): { property: ts.ObjectLiteralElementLike; sometimes: boolean }[] {
  const seen = new Set<ts.Node>();
  const expand = ({ object, sometimes }: Found) =>
    object.properties.flatMap(
      (property): { property: ts.ObjectLiteralElementLike; sometimes: boolean }[] =>
        ts.isSpreadAssignment(property)
          ? objectLiteralsOf(property.expression, seen, sometimes).flatMap(expand)
          : [{ property, sometimes }],
    );
  const expression = value && ts.isJsxExpression(value) ? value.expression : undefined;
  return objectLiteralsOf(expression, seen).flatMap(expand);
}

/** Dimming an element's `style` sets, or, on an SVG element, its `opacity`, `fill` and `color`. */
function declaredDimmings(opening: ts.JsxOpeningLikeElement): Declared[] {
  const tag = opening.tagName.getText();
  const svg = PAINT_HOSTS.has(tag) && (tag !== 'a' || insideSvg(opening));
  return opening.attributes.properties.flatMap((attribute): Declared[] => {
    if (!ts.isJsxAttribute(attribute) || !attribute.initializer) return [];
    const name = attribute.name.getText();
    if (name === 'style') {
      return styleProperties(attribute.initializer).flatMap(({ property }) => {
        const key = propertyKey(property);
        const value = propertyValue(property);
        const kind = key !== undefined && value ? propertyKind(key, value) : null;
        return kind ? [{ token: `style.${key}`, kind, node: property }] : [];
      });
    }
    const presentation = ['opacity', 'fillOpacity', 'fill-opacity', 'fill', 'color'];
    const kind =
      svg && presentation.includes(name) ? propertyKind(name, attribute.initializer) : null;
    return kind ? [{ token: `${name}={…}`, kind, node: attribute }] : [];
  });
}

/** Words in a prop's name that make its paint something other than text's. */
const NOT_TEXT_PAINT = new Set([
  'backdrop',
  'background',
  'bar',
  'bg',
  'border',
  'caret',
  'decoration',
  'divider',
  'dot',
  'edge',
  'from',
  'glow',
  'gradient',
  'icon',
  'outline',
  'overlay',
  'ring',
  'scrollbar',
  'selection',
  'separator',
  'shadow',
  'stop',
  'stroke',
  'thumb',
  'to',
  'track',
  'via',
]);

/** Words in a prop's name that make its paint text's. */
const TEXT_PAINT = new Set([
  'caption',
  'font',
  'fore',
  'heading',
  'hint',
  'label',
  'link',
  'placeholder',
  'text',
  'title',
  'value',
]);

/**
 * A colour or an opacity handed to a component in a prop named for one, which it may use on text.
 * The scan reports it where it is handed over: it cannot follow the value into a component of
 * another module, and one of the same module may pass it on to a helper the scan does not follow.
 */
function handedDimmings(opening: ts.JsxOpeningLikeElement): Declared[] {
  if (isIntrinsic(opening.tagName.getText())) return [];
  return opening.attributes.properties.flatMap((attribute): Declared[] => {
    if (!ts.isJsxAttribute(attribute) || !attribute.initializer) return [];
    const name = attribute.name.getText();
    // `color`, `fill` or `opacity`, alone or after words that say whose: `textColor`, `valueColor`,
    // `labelOpacity`. The last word that says whose decides: `labelBgColor` paints a background and
    // `iconLabelColor` a label, and `borderColor`, `borderTopColor` and `glowOpacity` are left
    // alone. A name with no such word is read as text's.
    const [, prefix = '', paint] = /^(.*?)(colou?r|fill|opacity)$/i.exec(name) ?? [];
    if (!paint) return [];
    const words = (prefix.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((word) =>
      word.toLowerCase(),
    );
    const whose = words.findLast((word) => TEXT_PAINT.has(word) || NOT_TEXT_PAINT.has(word));
    if (whose !== undefined && NOT_TEXT_PAINT.has(whose)) return [];
    const opacity = /^opacity$/i.test(paint);
    const dims = opacity
      ? amountsOf(attribute.initializer).some(partial)
      : classChunks(attribute.initializer).some((chunk) => translucent(chunk.text));
    return dims
      ? [{ token: `${name}={…}`, kind: opacity ? 'opacity' : 'color', node: attribute }]
      : [];
  });
}

// --- Whether an element renders text ------------------------------------------------------------

/** Tags that render a value or a label as text without a text child. */
const TEXT_CONTROLS = new Set(['textarea', 'select', 'optgroup']);
/** `<input>` types that render no text; a file input names its file, so it is not one of them. */
const TEXTLESS_INPUTS = new Set(['checkbox', 'radio', 'range', 'color', 'hidden', 'image']);
/** Content that is never painted. */
const UNPAINTED = new Set(['title', 'desc', 'metadata']);
/** Tags that draw content the scan cannot read: another document, or a canvas. */
const OPAQUE = new Set(['iframe', 'object', 'embed', 'canvas']);
/** SVG shapes and symbol references, which render no text whatever they are given. */
const SHAPES = new Set([
  ...['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'stop', 'use'],
  ...['animate', 'animateMotion', 'animateTransform', 'set', 'mpath'],
]);

/** What a dimming reaches: everything under the element, or what takes its colour or its fill. */
type Scope = 'all' | 'color' | 'fill';

interface Pass {
  scope: Scope;
  /** Whether content the scan cannot see, such as an imported component's output, counts. */
  opaque: boolean;
  /** Functions and constants being walked, so that a recursive one ends. */
  entered: Set<ts.Node>;
}

/** Where the walk stands: at the dimmed element, and whether plain text here takes its paint. */
interface Place {
  root: boolean;
  painted: boolean;
  /** Whether the fill here is `currentColor`, so that SVG text takes the colour. */
  currentFill: boolean;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
}

function attributeNamed(opening: ts.JsxOpeningLikeElement, name: string) {
  return opening.attributes.properties.find(
    (attribute): attribute is ts.JsxAttribute =>
      ts.isJsxAttribute(attribute) && attribute.name.getText() === name,
  );
}

/** Whether the element is `hidden`: a bare attribute or `{true}`. */
function isHidden(opening: ts.JsxOpeningLikeElement): boolean {
  const hidden = attributeNamed(opening, 'hidden');
  if (!hidden) return false;
  const value = hidden.initializer;
  return (
    !value || (ts.isJsxExpression(value) && value.expression?.kind === ts.SyntaxKind.TrueKeyword)
  );
}

/** Whether an element is read only by screen readers: `sr-only` always, and no `not-sr-only`. */
function isScreenReaderOnly(opening: ts.JsxOpeningLikeElement): boolean {
  return (
    classTokensOf(opening, true).includes('sr-only') &&
    !classTokensOf(opening).some((token) => splitOutside(token, ':').pop() === 'not-sr-only')
  );
}

/** The text an element's classes generate as `::before` or `::after` content, which inherits its dimming. */
function generatedContent(opening: ts.JsxOpeningLikeElement, pseudo?: 'before' | 'after') {
  for (const token of classTokensOf(opening)) {
    const variants = splitOutside(token, ':');
    const content = /^content-\[(.*)\]$/.exec(variants.pop() ?? '')?.[1];
    const on = variants.find((variant) => variant === 'before' || variant === 'after');
    if (on && (!pseudo || on === pseudo) && content && !/^(''|""|none)$/.test(content)) {
      return `the ::${on} content ${content}`;
    }
  }
  return null;
}

/** Whether a colour value inherits the paint above it rather than setting one. */
const inherits = (value: string) =>
  /^(currentcolor|inherit|current)$/i.test(
    value.replace(/^\[(?:color:|fill:)?(.*)\]$/, '$1').trim(),
  );

/** The values an element's `style` always gives `key`, not only in one branch; '?' for one unread. */
function styledAlways(opening: ts.JsxOpeningLikeElement, key: string): string[] {
  return styleProperties(attributeNamed(opening, 'style')?.initializer)
    .filter(({ property, sometimes }) => !sometimes && propertyKey(property) === key)
    .map(({ property }) => {
      const value = propertyValue(property);
      const texts = value ? classChunks(value).map((chunk) => chunk.text.trim()) : [];
      return texts.length === 1 ? texts[0] : '?';
    });
}

/** Whether an element always sets a text colour of its own, one that does not inherit. */
function setsOwnColour(opening: ts.JsxOpeningLikeElement): boolean {
  const own = classTokensOf(opening, true).some((token) => {
    const property = /^\[color:(.*)\]$/.exec(token);
    if (property) return !inherits(property[1]);
    const text = /^text-(.+)$/.exec(token);
    const colour = text ? splitOutside(text[1], '/')[0] : undefined;
    return colour !== undefined && isTextColour(colour) && !inherits(colour);
  });
  return own || styledAlways(opening, 'color').some((value) => !inherits(value));
}

/**
 * The fill an element always sets, taking CSS's order (a `style` over a class over an SVG
 * attribute): `current` for `currentColor`, `inherit`, `other` for anything else, or undefined.
 */
function fillOf(opening: ts.JsxOpeningLikeElement): 'current' | 'inherit' | 'other' | undefined {
  const styled = styledAlways(opening, 'fill');
  const classes = classTokensOf(opening, true).filter(
    (token) => /^fill-/.test(token) || token.startsWith('[fill:'),
  );
  const attribute = attributeNamed(opening, 'fill')?.initializer;
  const value =
    styled[styled.length - 1] ??
    (classes.length > 0
      ? classes[classes.length - 1] === 'fill-current'
        ? 'currentColor'
        : classes[classes.length - 1].replace(/^\[fill:(.*)\]$/, '$1')
      : attribute && ts.isStringLiteral(attribute)
        ? attribute.text
        : attribute
          ? '?'
          : undefined);
  if (value === undefined) return undefined;
  if (/^currentcolor$/i.test(value)) return 'current';
  return /^inherit$/i.test(value) ? 'inherit' : 'other';
}

/**
 * Whether an element sets, whatever happens, the paint a dimming would pass down to it: for a
 * colour, a text colour of its own; for a fill, a fill of its own, `currentColor` included.
 */
function setsOwnPaint(opening: ts.JsxOpeningLikeElement, scope: Scope): boolean {
  if (scope === 'color') return setsOwnColour(opening);
  if (scope === 'fill') {
    const fill = fillOf(opening);
    return fill !== undefined && fill !== 'inherit';
  }
  return false;
}

/** The function behind a component declared in the same module, through `memo` and `forwardRef`. */
function localComponent(tagName: ts.JsxTagNameExpression): ts.FunctionLikeDeclaration | undefined {
  if (!ts.isIdentifier(tagName)) return undefined;
  let node = declarationOf(tagName);
  while (node && ts.isCallExpression(node)) {
    node = node.arguments.find(
      (argument) =>
        ts.isArrowFunction(argument) ||
        ts.isFunctionExpression(argument) ||
        ts.isCallExpression(argument),
    );
  }
  return node &&
    (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
    ? node
    : undefined;
}

/** The callback of `list.map(…)`, `list.flatMap(…)` or `Array.from(list, …)`. */
function mapCallback(expression: ts.Expression): ts.FunctionLikeDeclaration | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const method = expression.expression.name.text;
  if (method === 'from' && expression.expression.expression.getText() === 'Array') {
    return callableOf(expression.arguments[1]);
  }
  return method === 'map' || method === 'flatMap' ? callableOf(expression.arguments[0]) : undefined;
}

/** The list behind `list.slice(…)`, `list.filter(…)` and the like, which keep its elements. */
function listBehind(expression: ts.Expression): ts.Expression | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  const keeps = ['slice', 'filter', 'reverse', 'toReversed', 'sort', 'toSorted', 'flat'];
  return keeps.includes(expression.expression.name.text)
    ? expression.expression.expression
    : undefined;
}

/** Walks `node` with `key` marked as entered, so that a recursive function or constant ends. */
function entering<T>(pass: Pass, key: ts.Node, walk: () => T | null): T | null {
  if (pass.entered.has(key)) return null;
  pass.entered.add(key);
  try {
    return walk();
  } finally {
    pass.entered.delete(key);
  }
}

/**
 * What makes `element` count as rendering text under a dimming of `scope`, or null when nothing
 * under it can. The first pass leaves out content the scan cannot see, so that the message names
 * actual text when there is any.
 */
function textEvidence(element: JsxTag, scope: Scope): string | null {
  for (const opaque of [false, true]) {
    const pass = { scope, opaque, entered: new Set<ts.Node>() };
    const place = { root: true, painted: scope !== 'fill', currentFill: false };
    const evidence = tagEvidence(element, pass, place);
    if (evidence) return evidence;
  }
  return null;
}

function tagEvidence(element: JsxTag, pass: Pass, place: Place): string | null {
  const opening = openingOf(element);
  const tag = opening.tagName.getText();
  if (UNPAINTED.has(tag) || isScreenReaderOnly(opening) || isHidden(opening)) return null;
  if (!place.root && setsOwnPaint(opening, pass.scope)) return null;
  const fill = fillOf(opening);
  const currentFill =
    fill === undefined || fill === 'inherit' ? place.currentFill : fill === 'current';
  // SVG text is painted with its fill, which takes the colour only as `currentColor`: its initial
  // fill is black, and no stylesheet here sets another.
  if (pass.scope === 'color' && SVG_TEXT.has(tag) && !currentFill) return null;
  const painted = place.painted || SVG_TEXT.has(tag);
  const inside = { root: false, painted, currentFill };
  const children = ts.isJsxElement(element) ? element.children : [];
  const generated = generatedContent(opening);
  if (generated && painted) return generated;
  // Children written out take the place of any a spread would bring, so a spread counts without them.
  const written = children.some(
    (child) => !ts.isJsxText(child) || !child.containsOnlyTriviaWhiteSpaces,
  );
  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      if (pass.opaque && !written && !SHAPES.has(tag)) {
        return `{...${clip(attribute.expression.getText())}}, whose content this scan cannot see`;
      }
      continue;
    }
    const name = attribute.name.getText();
    if (name === 'dangerouslySetInnerHTML' && painted) return 'dangerouslySetInnerHTML';
    if (name === 'children' && attribute.initializer) {
      const evidence = nodeEvidence(attribute.initializer, pass, inside);
      if (evidence) return evidence;
    }
  }
  if (tag === 'input') {
    const type = attributeNamed(opening, 'type')?.initializer;
    const textless =
      type !== undefined && ts.isStringLiteral(type) && TEXTLESS_INPUTS.has(type.text);
    return painted && !textless ? 'an <input>, which renders its value as text' : null;
  }
  if (TEXT_CONTROLS.has(tag)) return painted ? `a <${tag}>, which renders its value as text` : null;
  if (OPAQUE.has(tag) || tag.includes('-')) {
    return pass.opaque ? `<${tag}>, whose content this scan cannot see` : null;
  }
  if (isIntrinsic(tag) || tag === 'Fragment' || tag === 'React.Fragment') {
    return firstEvidence(children, pass, inside);
  }
  const local = localComponent(opening.tagName);
  if (local) {
    return entering(pass, local, () => firstEvidence(returnedExpressions(local), pass, inside));
  }
  if (pass.opaque) return `<${tag}>, whose output this scan cannot see`;
  return firstEvidence(children, pass, inside);
}

function firstEvidence(nodes: readonly ts.Node[], pass: Pass, place: Place): string | null {
  for (const node of nodes) {
    const evidence = nodeEvidence(node, pass, place);
    if (evidence) return evidence;
  }
  return null;
}

/**
 * The first text a JSX child, an attribute value or an expression renders. An expression counts
 * unless it is a literal, JSX the scan can read, a condition over those, a constant for them, or a
 * list built from them with `.map` or `Array.from`.
 */
function nodeEvidence(node: ts.Node, pass: Pass, place: Place): string | null {
  if (ts.isJsxText(node)) {
    const text = node.text.replace(/&nbsp;|&#160;| /g, ' ');
    return place.painted && text.trim() ? `the text "${clip(text)}"` : null;
  }
  if (ts.isJsxExpression(node)) {
    return node.expression ? nodeEvidence(node.expression, pass, place) : null;
  }
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    return tagEvidence(node, pass, place);
  }
  if (ts.isJsxFragment(node)) return firstEvidence(node.children, pass, place);
  if (!ts.isExpression(node)) return null;
  const expression = unwrap(node);
  if (expression !== node) return nodeEvidence(expression, pass, place);
  if (ts.isStringLiteralLike(expression)) {
    return place.painted && expression.text.trim() ? `the string "${clip(expression.text)}"` : null;
  }
  if (ts.isNumericLiteral(expression)) {
    return place.painted ? `the number ${expression.text}` : null;
  }
  if (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined')
  ) {
    return null;
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      nodeEvidence(expression.whenTrue, pass, place) ??
      nodeEvidence(expression.whenFalse, pass, place)
    );
  }
  if (ts.isBinaryExpression(expression) && LOGICAL.has(expression.operatorToken.kind)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      // React renders a falsy number on the left, so `{items.length && …}` can show "0".
      const count = /\.(length|size)$/.test(expression.left.getText());
      return count && place.painted
        ? `{${clip(expression.left.getText())}}, which renders 0 when empty`
        : nodeEvidence(expression.right, pass, place);
    }
    return (
      nodeEvidence(expression.left, pass, place) ?? nodeEvidence(expression.right, pass, place)
    );
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return firstEvidence(expression.elements, pass, place);
  }
  const callback = mapCallback(expression);
  if (callback) {
    return entering(pass, callback, () =>
      firstEvidence(returnedExpressions(callback), pass, place),
    );
  }
  const name = ts.isIdentifier(expression) ? expression : undefined;
  const constant = name && declarationOf(name, true);
  if (name && constant && ts.isExpression(constant) && !ts.isFunctionLike(constant)) {
    // A constant for JSX or a literal is judged by what it holds; for anything else, the name reads best.
    const held = entering(pass, constant, () => nodeEvidence(constant, pass, place));
    return held?.startsWith('{') ? `{${name.text}}` : held;
  }
  const list = listBehind(expression);
  if (list) return nodeEvidence(list, pass, place);
  return place.painted || pass.opaque ? `{${clip(expression.getText())}}` : null;
}

/**
 * The elements a JSX element renders as its children, or at any depth: through conditions, lists,
 * fragments, constants and same-module components. Content the scan cannot see comes back as a
 * description of it.
 */
function elementsUnder(element: JsxTag, deep: boolean): (JsxTag | string)[] {
  const found: (JsxTag | string)[] = [];
  const entered = new Set<ts.Node>();
  const childrenOf = (of: JsxTag) => (ts.isJsxElement(of) ? of.children : []);
  const enter = (key: ts.Node, nodes: readonly ts.Node[]) => {
    if (entered.has(key)) return;
    entered.add(key);
    nodes.forEach(visit);
  };
  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) return;
    if (ts.isJsxExpression(node)) {
      if (node.expression) visit(node.expression);
      return;
    }
    if (ts.isJsxFragment(node)) return node.children.forEach(visit);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = openingOf(node).tagName;
      const tag = tagName.getText();
      if (tag === 'Fragment' || tag === 'React.Fragment') return childrenOf(node).forEach(visit);
      found.push(node);
      if (!deep) return;
      const local = isIntrinsic(tag) ? undefined : localComponent(tagName);
      if (local) enter(local, returnedExpressions(local));
      else childrenOf(node).forEach(visit);
      return;
    }
    if (!ts.isExpression(node)) return;
    const expression = unwrap(node);
    if (expression !== node) return visit(expression);
    if (
      ts.isStringLiteralLike(expression) ||
      ts.isNumericLiteral(expression) ||
      ts.isTemplateExpression(expression) ||
      expression.kind === ts.SyntaxKind.NullKeyword ||
      expression.kind === ts.SyntaxKind.TrueKeyword ||
      expression.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return;
    }
    if (ts.isConditionalExpression(expression)) {
      visit(expression.whenTrue);
      return visit(expression.whenFalse);
    }
    if (ts.isBinaryExpression(expression) && LOGICAL.has(expression.operatorToken.kind)) {
      if (expression.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
        visit(expression.left);
      }
      return visit(expression.right);
    }
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.forEach(visit);
    const callback = mapCallback(expression);
    if (callback) return enter(callback, returnedExpressions(callback));
    const constant = ts.isIdentifier(expression) ? declarationOf(expression, true) : undefined;
    if (constant) return enter(constant, [constant]);
    const list = listBehind(expression);
    if (list) return visit(list);
    found.push(`{${clip(expression.getText())}}, whose content this scan cannot see`);
  }
  childrenOf(element).forEach(visit);
  return found;
}

/** What makes the text a dimming reaches count, or null when it reaches none. */
function targetEvidence(element: JsxTag, target: Target, scope: Scope): string | null {
  const opening = openingOf(element);
  const tag = opening.tagName.getText();
  switch (target.on) {
    case 'self':
      return textEvidence(element, scope);
    case 'before':
    case 'after':
      return generatedContent(opening, target.on);
    case 'placeholder':
      if (tag === 'input' || tag === 'textarea') return `the placeholder of a <${tag}>`;
      return isIntrinsic(tag) ? null : `<${tag}>, whose output this scan cannot see`;
    case 'siblings':
      return 'the siblings it selects, which this scan does not follow';
    default:
      for (const found of elementsUnder(element, target.on === 'descendants')) {
        if (typeof found === 'string') return found;
        const foundTag = openingOf(found).tagName.getText();
        if (target.tag && isIntrinsic(foundTag) && foundTag !== target.tag) continue;
        const evidence = textEvidence(found, scope);
        if (evidence) return evidence;
      }
      return null;
  }
}

/** The component a node sits in: the nearest capitalised function or constant around it. */
function componentOf(node: ts.Node): string {
  let fallback: string | undefined;
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    let name: string | undefined;
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isClassDeclaration(current)) &&
      current.name
    ) {
      name = current.name.text;
    } else if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      name = current.name.text;
    }
    if (name && /^[A-Z]/.test(name)) return name;
    fallback ??= name;
  }
  return fallback ?? '(module)';
}

// --- The scan ------------------------------------------------------------------------------------

export type Verdict = 'text' | 'no-text' | 'unattributed';

export interface Site {
  file: string;
  line: number;
  component: string;
  /** The tag the dimming lands on, or '' when the scan could not trace it to one. */
  element: string;
  token: string;
  verdict: Verdict;
  /** What counts as the text it dims, for the failure message. */
  evidence: string;
}

export interface Scan {
  /** Every class token the scan traced to an element, dimming or not. */
  tokens: string[];
  /** Every dimming, with whether it reaches text. */
  sites: Site[];
}

function scriptKindOf(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

/**
 * A parse error leaves a truncated tree behind rather than an exception, and a truncated tree has
 * fewer classes in it, so a module that does not parse must fail loudly rather than scan clean.
 */
function assertParses(source: string, file: string): void {
  const { diagnostics = [] } = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext },
  });
  if (diagnostics.length > 0) {
    const reasons = diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '))
      .join('; ');
    throw new Error(`${file} did not parse, so this scan cannot see it: ${reasons}`);
  }
}

export function scanSource(source: string, file: string): Scan {
  assertParses(source, file);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindOf(file),
  );
  const tokens: string[] = [];
  const sites: Site[] = [];
  const traced = new Set<ts.Node>();
  const lineOf = (position: number) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const report = (node: ts.Node, position: number, token: string, found: Partial<Site>) =>
    sites.push({
      file,
      line: lineOf(position),
      component: componentOf(node),
      element: '',
      token,
      verdict: 'unattributed',
      evidence: '',
      ...found,
    });

  const land = (element: JsxTag, found: Dimming, token: string, position: number) => {
    const scope: Scope = found.kind === 'color' || found.kind === 'fill' ? found.kind : 'all';
    const evidence = targetEvidence(element, found.target, scope);
    report(element, position, token, {
      element: openingOf(element).tagName.getText(),
      verdict: evidence ? 'text' : 'no-text',
      evidence: evidence ?? '',
    });
  };

  const visitElements = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = openingOf(node);
      for (const { value, conditional } of classValues(opening)) {
        for (const chunk of classChunks(value, new Set(), conditional)) {
          traced.add(chunk.node);
          for (const { token, at } of tokensIn(chunk)) {
            tokens.push(token);
            const found = dimming(token);
            if (found) land(node, found, token, at);
          }
        }
      }
      for (const declared of declaredDimmings(opening)) {
        const found = { kind: declared.kind, target: { on: 'self' } } as const;
        land(node, found, declared.token, declared.node.getStart());
      }
      for (const handed of handedDimmings(opening)) {
        const evidence = `handed to <${opening.tagName.getText()}>, which the scan does not follow`;
        report(handed.node, handed.node.getStart(), handed.token, { evidence });
      }
    }
    ts.forEachChild(node, visitElements);
  };
  visitElements(sourceFile);

  const visitStrings = (node: ts.Node): void => {
    if (isStringNode(node) && !traced.has(node) && !neverAClass(node)) {
      for (const { token, at } of tokensIn(chunkOf(node, false))) {
        // Prose ends a class name with punctuation that no class name has.
        const bare = token.replace(/[.,;]+$/, '');
        if (dimming(bare)) report(node, at, bare, {});
      }
    }
    ts.forEachChild(node, visitStrings);
  };
  visitStrings(sourceFile);

  return { tokens, sites };
}
