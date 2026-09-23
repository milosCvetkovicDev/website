/**
 * The scanner behind `dimmed-text.test.ts`, which says what it enforces and why. It parses a module
 * with the TypeScript compiler API and reports every dimming declared in its markup, each with
 * whether the element it lands on renders text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GLOBALS_CSS = 'src/app/globals.css';
const TAILWIND_THEME = 'node_modules/tailwindcss/theme.css';

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

/**
 * Whether a CSS colour carries an alpha strictly between 0 and 1: `rgba(…, .7)`, `rgb(… / 70%)`,
 * `#rrggbbaa`, `#rgba`, or a `color-mix()` with `transparent`. A `var()` is followed through the
 * stylesheets, in every theme.
 */
function hasPartialAlpha(colour: string, seen = new Set<string>()): boolean {
  const value = colour.replace(/_/g, ' ').trim();
  const variable = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/.exec(value);
  if (variable) {
    if (seen.has(variable[1])) return false;
    seen.add(variable[1]);
    const values = vocabulary.properties.get(variable[1]) ?? (variable[2] ? [variable[2]] : []);
    return values.some((next) => hasPartialAlpha(next, seen));
  }
  if (/^color-mix\(/i.test(value)) return /\btransparent\b/i.test(value);
  const hex = /^#(?:[\da-f]{3}([\da-f])|[\da-f]{6}([\da-f]{2}))$/i.exec(value);
  if (hex) return partial(parseInt(hex[1] ? hex[1].repeat(2) : hex[2], 16) / 255);
  const colourFunction = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([\s\S]*)\)$/i.exec(
    value,
  );
  if (!colourFunction) return false;
  const slashed = splitOutside(colourFunction[1], '/');
  const alpha =
    slashed.length > 1 ? slashed[slashed.length - 1] : splitOutside(colourFunction[1], ',')[3];
  return alpha !== undefined && partial(fraction(alpha));
}

// --- What the stylesheets define -----------------------------------------------------------------

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Every custom property `css` declares, with each value it takes: one per theme. */
function customPropertiesIn(css: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [, name, value] of withoutComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) {
    found.set(name, [...(found.get(name) ?? []), value.trim()]);
  }
  return found;
}

/**
 * The opacities each `@keyframes` rule in `css` passes through, by name, counting an unset start or
 * end as the element's own 1. Rules that set no opacity are left out; a name defined twice keeps both.
 */
export function keyframesIn(css: string): Map<string, number[][]> {
  const found = new Map<string, number[][]>();
  const source = withoutComments(css);
  for (const match of source.matchAll(/@keyframes\s+['"]?([\w-]+)['"]?\s*\{/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth > 0 && end < source.length) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') depth--;
      end++;
    }
    const body = source.slice(match.index + match[0].length, end - 1);
    const steps = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, declarations]) => {
      const opacity = /(?:^|;)\s*opacity\s*:\s*([^;]+)/.exec(declarations.trim());
      return {
        selectors: selectors.split(',').map((selector) => selector.trim()),
        opacity: opacity ? fraction(opacity[1]) : undefined,
      };
    });
    const set = steps.flatMap((step) => (step.opacity === undefined ? [] : [step.opacity]));
    if (set.length === 0) continue;
    const at = (edge: RegExp) =>
      steps.find((step) => step.opacity !== undefined && step.selectors.some((s) => edge.test(s)))
        ?.opacity ?? 1;
    found.set(match[1], [
      ...(found.get(match[1]) ?? []),
      [...set, at(/^(from|0%)$/), at(/^(to|100%)$/)],
    ]);
  }
  return found;
}

/**
 * The animation each `animate-*` utility runs: Tailwind's `--animate-*` theme values, and the
 * `.animate-*` classes and `@utility animate-*` rules of a stylesheet.
 */
export function animationUtilitiesIn(css: string): Map<string, string> {
  const found = new Map<string, string>();
  const source = withoutComments(css);
  for (const [, name, value] of source.matchAll(/--animate-([\w-]+)\s*:\s*([^;]+);/g)) {
    found.set(name, value.trim());
  }
  for (const [, selectors, body] of source.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const declaration = (property: string) =>
      new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`).exec(body.trim())?.[1].trim();
    const longhands = ['name', 'duration', 'timing-function', 'iteration-count', 'fill-mode'];
    const shorthand =
      declaration('animation') ??
      longhands.flatMap((part) => declaration(`animation-${part}`) ?? []).join(' ');
    if (!shorthand) continue;
    for (const [, name] of selectors.matchAll(/(?:\.|@utility\s+)animate-([\w-]+)/g)) {
      found.set(name, shorthand);
    }
  }
  return found;
}

/**
 * Whether an animation leaves what it animates part-transparent: a keyframe holds an opacity between
 * 0 and 1, or a loop interpolates between two opacities instead of stepping. A single run from or to
 * 0, such as a reveal, passes through partial values only on its way.
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
    const steps = words.some((word) => /^(steps\(.*\)|step-start|step-end)$/.test(word));
    return words
      .flatMap((word) => keyframes.get(word) ?? [])
      .some(
        (opacities) => opacities.some(partial) || (loops && !steps && new Set(opacities).size > 1),
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

const tailwindTheme = readFileSync(path.join(appDir, TAILWIND_THEME), 'utf8');
const globalsCss = readFileSync(path.join(appDir, GLOBALS_CSS), 'utf8');

/** What classes and styles can name, read from Tailwind's theme and from globals.css. */
export const vocabulary = {
  colours: new Set(
    [tailwindTheme, globalsCss].flatMap((css) =>
      [...withoutComments(css).matchAll(/--color-([\w-]+)\s*:/g)].map(([, name]) => name),
    ),
  ),
  properties: merged(customPropertiesIn(tailwindTheme), customPropertiesIn(globalsCss)),
  keyframes: merged(keyframesIn(tailwindTheme), keyframesIn(globalsCss)),
  animations: new Map([
    ...animationUtilitiesIn(tailwindTheme),
    ...animationUtilitiesIn(globalsCss),
  ]),
};

// --- Which class tokens dim ----------------------------------------------------------------------

/** What a dimming acts on: the colour text inherits, the fill SVG text takes, or everything. */
type Kind = 'color' | 'fill' | 'opacity' | 'animation';

/**
 * Whether a variant points its utility away from the element's own text: at a pseudo-element, or at
 * a descendant or sibling through `*:` or an arbitrary selector (`[&_svg]:`, `[&>li]:`).
 */
function aimsElsewhere(variant: string): boolean {
  if (/^(before|after|backdrop|\*|\*\*)$/.test(variant)) return true;
  const selector = /^\[(.*)\]$/.exec(variant)?.[1].replace(/_/g, ' ');
  return selector !== undefined && /&(\s+|\s*[>+~])/.test(selector);
}

/** A variant for an inactive control, whose text WCAG 1.4.3 exempts and axe does not measure. */
const INACTIVE = /^(group-|peer-)?(aria-)?disabled(\/[\w-]+)?$/;

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
  if (arbitrary) return hasPartialAlpha(arbitrary[1]);
  const variable = /^\((?:color:)?(--[\w-]+)\)$/.exec(value);
  if (variable) return hasPartialAlpha(`var(${variable[1]})`);
  return vocabulary.colours.has(value) && hasPartialAlpha(`var(--color-${value})`);
}

/**
 * Whether an `animate-*` value dims: a named utility, an arbitrary value, or a variable, which counts
 * when globals.css does not declare it.
 */
function animateDims(value: string): boolean {
  const arbitrary = /^\[(.*)\]$/.exec(value);
  const variable = /^\((--[\w-]+)\)$/.exec(value);
  const shorthand = arbitrary
    ? arbitrary[1].replace(/_/g, ' ')
    : variable
      ? vocabulary.properties.get(variable[1])?.join(', ')
      : vocabulary.animations.get(value);
  if (shorthand === undefined) return variable !== null;
  return animationDims(shorthand, vocabulary.keyframes);
}

/** What a class token dims, or null when it dims nothing of the element's text. */
function dimmingKind(token: string): Kind | null {
  const variants = splitOutside(token, ':');
  const utility = (variants.pop() ?? '').replace(/^!|!$/g, '');
  if (variants.some((variant) => aimsElsewhere(variant) || INACTIVE.test(variant))) return null;
  const property = /^\[(opacity|color|fill|animation):(.+)\]$/.exec(utility);
  if (property) {
    const [, name, value] = property;
    if (name === 'opacity') return partial(fraction(value.replace(/_/g, ' '))) ? 'opacity' : null;
    if (name === 'animation') {
      return animationDims(value.replace(/_/g, ' '), vocabulary.keyframes) ? 'animation' : null;
    }
    if (!hasPartialAlpha(value)) return null;
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

// --- Where a class lands -------------------------------------------------------------------------

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement;

type StringNode =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail;

/** A piece of source text that may hold class names, and the offset its text starts at. */
interface Chunk {
  node: ts.Node;
  text: string;
  start: number;
}

const openingOf = (element: JsxTag) =>
  ts.isJsxElement(element) ? element.openingElement : element;

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
 * The source text of a string between its delimiters: a quote, a backtick, or a substitution's `}`
 * and `${`. Raw rather than cooked, so that every offset matches the file.
 */
function chunkOf(node: StringNode | ts.Identifier): Chunk {
  const raw = node.getText();
  const start = node.getStart();
  if (ts.isIdentifier(node)) return { node, text: raw, start };
  const closing = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) ? 2 : 1;
  return { node, text: raw.slice(1, raw.length - closing), start: start + 1 };
}

const tokensIn = (chunk: Chunk) =>
  [...chunk.text.matchAll(/\S+/g)].map((match) => ({
    token: match[0],
    at: chunk.start + match.index,
  }));

/** Attributes and props that hold classes: `className`, `classNames`, `titleClass`, `labelClassName`. */
const isClassName = (name: string) => /^class(Name)?(es|s)?$|Class(Name)?(es|s)?$/.test(name);

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

/** A property's value; a shorthand property's is the name it repeats. */
function propertyValue(property: ts.ObjectLiteralElementLike): ts.Node | undefined {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

const propertyNamed = (object: ts.ObjectLiteralExpression, key: string) =>
  object.properties.find(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      propertyKey(property) === key,
  );

/** The object literal an expression is, or names within the module. */
function objectLiteralOf(
  node: ts.Node | undefined,
  seen = new Set<ts.Node>(),
): ts.ObjectLiteralExpression | undefined {
  if (!node || seen.has(node) || !ts.isExpression(node)) return undefined;
  seen.add(node);
  const expression = unwrap(node);
  if (ts.isObjectLiteralExpression(expression)) return expression;
  return ts.isIdentifier(expression) ? objectLiteralOf(declarationOf(expression), seen) : undefined;
}

/** The value `const { key } = object` gives a name, or the whole initializer when that is unclear. */
function destructured(declaration: ts.VariableDeclaration, binding: Binding): ts.Node | undefined {
  const object = objectLiteralOf(declaration.initializer);
  const key =
    ts.isBindingElement(binding) && binding.parent.parent === declaration
      ? (binding.propertyName ?? binding.name)
      : undefined;
  const keyText = key && (ts.isIdentifier(key) || ts.isStringLiteral(key)) ? key.text : undefined;
  const property = object && keyText !== undefined ? propertyNamed(object, keyText) : undefined;
  return property ? propertyValue(property) : declaration.initializer;
}

/**
 * The initializer or function a name refers to, found by walking out through the scopes around it.
 * A parameter without a default, or a loop or `catch` binding, resolves to nothing: its value is not
 * in the source.
 */
function declarationOf(name: ts.Identifier): ts.Node | undefined {
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
          return statement;
        }
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          const binding = bindingNamed(declaration, name.text);
          if (binding === declaration) return declaration.initializer;
          if (binding) return destructured(declaration, binding);
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
        if (binding) return binding.initializer;
      }
    }
  }
  return undefined;
}

function propertyChunks(property: ts.ObjectLiteralElementLike, seen: Set<ts.Node>): Chunk[] {
  if (ts.isSpreadAssignment(property)) return classChunks(property.expression, seen);
  const name = property.name;
  // clsx and friends read a key as a class name, so keys are read as well as values.
  const key =
    name && (ts.isStringLiteral(name) || ts.isIdentifier(name))
      ? [chunkOf(name)]
      : name && ts.isComputedPropertyName(name)
        ? classChunks(name.expression, seen)
        : [];
  return [...key, ...classChunks(propertyValue(property), seen)];
}

/**
 * The strings a class value can be built from: its literals, both branches of every condition, the
 * pieces of a template, clsx arguments and keys, and, through the names they use, the constants,
 * map entries and helper functions of the same module.
 */
function classChunks(node: ts.Node | undefined, seen = new Set<ts.Node>()): Chunk[] {
  if (!node || seen.has(node)) return [];
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [chunkOf(node)];
  if (ts.isJsxExpression(node)) return classChunks(node.expression, seen);
  if (ts.isTemplateExpression(node)) {
    return [
      chunkOf(node.head),
      ...node.templateSpans.flatMap((span) => [
        ...classChunks(span.expression, seen),
        chunkOf(span.literal),
      ]),
    ];
  }
  if (ts.isTaggedTemplateExpression(node)) return classChunks(node.template, seen);
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSpreadElement(node)
  ) {
    return classChunks(node.expression, seen);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    // `STYLES.icon` reads that entry alone; `tones[tone]` could be any of them.
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isStringLiteralLike(node.argumentExpression)
        ? node.argumentExpression.text
        : undefined;
    const object = key === undefined ? undefined : objectLiteralOf(node.expression);
    const property = object && key !== undefined ? propertyNamed(object, key) : undefined;
    return classChunks(property ? propertyValue(property) : node.expression, seen);
  }
  if (ts.isConditionalExpression(node)) {
    return [...classChunks(node.whenTrue, seen), ...classChunks(node.whenFalse, seen)];
  }
  if (ts.isBinaryExpression(node)) {
    return [...classChunks(node.left, seen), ...classChunks(node.right, seen)];
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => classChunks(element, seen));
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => propertyChunks(property, seen));
  }
  if (ts.isCallExpression(node)) {
    // The callee too: `[…].join(' ')` reaches the array, a local helper reaches what it returns.
    return [
      ...classChunks(node.expression, seen),
      ...node.arguments.flatMap((argument) => classChunks(argument, seen)),
    ];
  }
  if (ts.isIdentifier(node)) return classChunks(declarationOf(node), seen);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    return returnedExpressions(node).flatMap((expression) => classChunks(expression, seen));
  }
  return [];
}

/** The values that set an element's classes: its class attributes, and classes in an object it spreads. */
function classValues(opening: ts.JsxOpeningLikeElement): ts.Node[] {
  return opening.attributes.properties.flatMap((attribute): ts.Node[] => {
    if (ts.isJsxAttribute(attribute)) {
      return isClassName(attribute.name.getText()) && attribute.initializer
        ? [attribute.initializer]
        : [];
    }
    return (objectLiteralOf(attribute.expression)?.properties ?? []).flatMap((property) => {
      const key = propertyKey(property);
      const value = propertyValue(property);
      return key !== undefined && isClassName(key) && value ? [value] : [];
    });
  });
}

const classTokensOf = (opening: ts.JsxOpeningLikeElement) =>
  classValues(opening).flatMap((value) =>
    classChunks(value).flatMap((chunk) => chunk.text.match(/\S+/g) ?? []),
  );

/**
 * Whether a string can be skipped because it never becomes a class: the value of a DOM attribute
 * such as `d` or `href`, or text rendered as a child. A component's props are read, since any of
 * them might carry a class.
 */
function neverAClass(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isTypeNode(current)) return true;
    if (ts.isJsxAttribute(current)) {
      const tag = current.parent.parent.tagName.getText();
      return !isClassName(current.name.getText()) && /^[a-z]/.test(tag);
    }
    if (ts.isJsxElement(current) || ts.isJsxFragment(current)) return true;
    if (ts.isFunctionLike(current) || ts.isJsxSelfClosingElement(current)) return false;
  }
  return false;
}

// --- Styles and attributes -----------------------------------------------------------------------

/** SVG elements whose `fill` reaches text: text itself, and the containers that pass it down. */
const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);
const FILL_HOSTS = new Set(['svg', 'g', 'symbol', 'switch', ...SVG_TEXT]);

/**
 * Every opacity a value can take that the scan can read: literals, both branches of a condition,
 * and names defined in the module. A value it cannot read, such as a prop or state, gives nothing.
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
  return ts.isIdentifier(expression) ? amountsOf(declarationOf(expression), seen) : [];
}

interface Declared {
  token: string;
  kind: Kind;
  node: ts.Node;
}

/** Dimming set in an element's `style`, or in the SVG `opacity`, `fill` and `fill-opacity` attributes. */
function declaredDimmings(opening: ts.JsxOpeningLikeElement): Declared[] {
  const found: Declared[] = [];
  const judge = (name: string, value: ts.Node, token: string, node: ts.Node) => {
    if (name === 'opacity' && amountsOf(value).some(partial)) {
      found.push({ token, kind: 'opacity', node });
    } else if (
      (name === 'fillOpacity' || name === 'fill-opacity') &&
      amountsOf(value).some(partial)
    ) {
      found.push({ token, kind: 'fill', node });
    } else if (
      (name === 'color' || name === 'fill') &&
      classChunks(value).some((chunk) => hasPartialAlpha(chunk.text))
    ) {
      found.push({ token, kind: name === 'fill' ? 'fill' : 'color', node });
    }
  };
  for (const attribute of opening.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
    const name = attribute.name.getText();
    if (name !== 'style') {
      if (name !== 'color') judge(name, attribute.initializer, attribute.getText(), attribute);
      continue;
    }
    const style = ts.isJsxExpression(attribute.initializer)
      ? objectLiteralOf(attribute.initializer.expression)
      : undefined;
    for (const property of style?.properties ?? []) {
      const key = propertyKey(property);
      const value = propertyValue(property);
      if (key !== undefined && value) {
        judge(key, value, `style.${key}: ${value.getText()}`, property);
      }
    }
  }
  return found;
}

// --- Whether an element renders text ------------------------------------------------------------

/** Tags that render a value or a label as text without a text child. */
const TEXT_CONTROLS = new Set(['textarea', 'select', 'optgroup']);
/** `<input>` types that render no text. */
const TEXTLESS_INPUTS = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'hidden', 'image']);
/** Content that is never painted. */
const UNPAINTED = new Set(['title', 'desc', 'metadata']);
/** Tags that draw content the scan cannot read: another document, a canvas, a referenced symbol. */
const OPAQUE = new Set(['iframe', 'object', 'embed', 'canvas', 'use']);
/** SVG shapes, which render no text whatever they are given. */
const SHAPES = new Set([
  ...['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'image', 'stop'],
  ...['animate', 'animateMotion', 'animateTransform', 'set', 'mpath'],
]);

/** What a dimming reaches: everything under the element, or what takes its colour or its fill. */
type Scope = 'all' | 'color' | 'fill';

interface Pass {
  scope: Scope;
  /** Whether content the scan cannot see, such as an imported component's output, counts. */
  opaque: boolean;
  /** Functions already entered, so that a recursive one ends. */
  entered: Set<ts.Node>;
}

/** Whether plain text at this point takes the dimmed paint: a fill paints only SVG text. */
interface Place {
  root: boolean;
  painted: boolean;
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

/** The `::before` or `::after` text an element's own classes generate, which inherits its dimming. */
function generatedContent(token: string): string | undefined {
  const variants = splitOutside(token, ':');
  const content = /^content-\[(.*)\]$/.exec(variants.pop() ?? '')?.[1];
  const pseudo = variants.find((variant) => variant === 'before' || variant === 'after');
  return pseudo && content && !/^(''|""|none)$/.test(content)
    ? `the ::${pseudo} content ${content}`
    : undefined;
}

/**
 * Whether an element sets the paint the dimming would pass down to it: its own text colour, or, on
 * an SVG element, a fill of its own (one that is not `currentColor`, for a colour).
 */
function setsOwnPaint(opening: ts.JsxOpeningLikeElement, tokens: string[], scope: Scope): boolean {
  if (scope === 'all') return false;
  const own = (pattern: RegExp) =>
    tokens.some((token) => splitOutside(token, ':').length === 1 && pattern.test(token));
  const style = (key: string) =>
    (
      objectLiteralOf(
        (attributeNamed(opening, 'style')?.initializer as ts.JsxExpression | undefined)?.expression,
      )?.properties ?? []
    ).some((property) => propertyKey(property) === key);
  const fill = attributeNamed(opening, 'fill')?.initializer;
  const currentFill =
    (fill !== undefined && ts.isStringLiteral(fill) && /^currentcolor$/i.test(fill.text)) ||
    own(/^fill-current$/);
  const ownFill =
    FILL_HOSTS.has(opening.tagName.getText()) &&
    (fill !== undefined || own(/^(fill-|\[fill:)/) || style('fill'));
  if (scope === 'fill') return ownFill;
  const ownColour =
    own(/^\[color:/) ||
    tokens.some(
      (token) =>
        splitOutside(token, ':').length === 1 &&
        /^text-/.test(token) &&
        isTextColour(token.replace(/^text-/, '').split('/')[0]),
    ) ||
    style('color');
  return ownColour || (ownFill && !currentFill);
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

/** A function literal, or the same-module function a name refers to. */
function callableOf(node: ts.Node | undefined): ts.FunctionLikeDeclaration | undefined {
  const target = node && ts.isIdentifier(node) ? declarationOf(node) : node;
  return target &&
    (ts.isArrowFunction(target) ||
      ts.isFunctionExpression(target) ||
      ts.isFunctionDeclaration(target))
    ? target
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

/**
 * What makes `element` count as rendering text under a dimming of `scope`, or null when nothing
 * under it can. The first pass leaves out content the scan cannot see, so that the message names
 * actual text when there is any.
 */
function textEvidence(element: JsxTag, scope: Scope): string | null {
  for (const opaque of [false, true]) {
    const pass = { scope, opaque, entered: new Set<ts.Node>() };
    const evidence = tagEvidence(element, pass, { root: true, painted: scope !== 'fill' });
    if (evidence) return evidence;
  }
  return null;
}

function tagEvidence(element: JsxTag, pass: Pass, place: Place): string | null {
  const opening = openingOf(element);
  const tag = opening.tagName.getText();
  const tokens = classTokensOf(opening);
  if (UNPAINTED.has(tag) || tokens.includes('sr-only') || isHidden(opening)) return null;
  if (!place.root && setsOwnPaint(opening, tokens, pass.scope)) return null;
  const painted = place.painted || SVG_TEXT.has(tag);
  const generated = tokens.map(generatedContent).find(Boolean);
  if (generated && painted) return generated;
  for (const attribute of opening.attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      if (pass.opaque && !SHAPES.has(tag)) {
        return `{...${clip(attribute.expression.getText())}}, whose content this scan cannot see`;
      }
      continue;
    }
    const name = attribute.name.getText();
    if (name === 'dangerouslySetInnerHTML' && painted) return 'dangerouslySetInnerHTML';
    if (name === 'children' && attribute.initializer) {
      const evidence = nodeEvidence(attribute.initializer, pass, { root: false, painted });
      if (evidence) return evidence;
    }
  }
  const children = ts.isJsxElement(element) ? element.children : [];
  const inside = { root: false, painted };
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
  if (/^[a-z]/.test(tag) || tag === 'Fragment' || tag === 'React.Fragment') {
    return firstEvidence(children, pass, inside);
  }
  const local = localComponent(opening.tagName);
  if (local) {
    if (pass.entered.has(local)) return null;
    pass.entered.add(local);
    return firstEvidence(returnedExpressions(local), pass, inside);
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
 * unless it is a literal, JSX the scan can read, a condition over those, a name for them, or a list
 * built from them with `.map` or `Array.from`.
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
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      // React renders a falsy number on the left, so `{items.length && …}` can show "0".
      const count = /\.(length|size)$/.test(expression.left.getText());
      return count && place.painted
        ? `{${clip(expression.left.getText())}}, which renders 0 when empty`
        : nodeEvidence(expression.right, pass, place);
    }
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return (
        nodeEvidence(expression.left, pass, place) ?? nodeEvidence(expression.right, pass, place)
      );
    }
  }
  if (ts.isArrayLiteralExpression(expression)) {
    return firstEvidence(expression.elements, pass, place);
  }
  const callback = mapCallback(expression);
  const name = ts.isIdentifier(expression) ? expression : undefined;
  const declared = name && declarationOf(name);
  const followed = callback ?? declared;
  if (followed && pass.entered.has(followed)) return null;
  if (callback) {
    pass.entered.add(callback);
    return firstEvidence(returnedExpressions(callback), pass, place);
  }
  if (name && declared && ts.isExpression(declared) && !ts.isFunctionLike(declared)) {
    pass.entered.add(declared);
    // A name for JSX or a literal is judged by what it names; for anything else, the name reads best.
    const named = nodeEvidence(declared, pass, place);
    return named?.startsWith('{') ? `{${name.text}}` : named;
  }
  const list = listBehind(expression);
  if (list) return nodeEvidence(list, pass, place);
  return place.painted || pass.opaque ? `{${clip(expression.getText())}}` : null;
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
  /** What under the element counts as text, for the failure message. */
  evidence: string;
}

export interface Scan {
  /** Every class token the scan traced to an element, dimming or not. */
  tokens: string[];
  /** Every dimming, with whether the element it lands on renders text. */
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

  const land = (element: JsxTag, kind: Kind, token: string, position: number) => {
    const tag = openingOf(element).tagName.getText();
    // A fill paints SVG text only, so on anything else it dims no text.
    if (kind === 'fill' && !FILL_HOSTS.has(tag)) return;
    const scope = kind === 'color' || kind === 'fill' ? kind : 'all';
    const evidence = textEvidence(element, scope);
    sites.push({
      file,
      line: lineOf(position),
      component: componentOf(element),
      element: tag,
      token,
      verdict: evidence ? 'text' : 'no-text',
      evidence: evidence ?? '',
    });
  };

  const visitElements = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = openingOf(node);
      for (const value of classValues(opening)) {
        for (const chunk of classChunks(value)) {
          traced.add(chunk.node);
          for (const { token, at } of tokensIn(chunk)) {
            tokens.push(token);
            const kind = dimmingKind(token);
            if (kind) land(node, kind, token, at);
          }
        }
      }
      for (const declared of declaredDimmings(opening)) {
        land(node, declared.kind, declared.token, declared.node.getStart());
      }
    }
    ts.forEachChild(node, visitElements);
  };
  visitElements(sourceFile);

  const visitStrings = (node: ts.Node): void => {
    if (isStringNode(node) && !traced.has(node) && !neverAClass(node)) {
      for (const { token, at } of tokensIn(chunkOf(node))) {
        // Prose ends a class name with punctuation that no class name has.
        const bare = token.replace(/[.,;]+$/, '');
        if (!dimmingKind(bare)) continue;
        sites.push({
          file,
          line: lineOf(at),
          component: componentOf(node),
          element: '',
          token: bare,
          verdict: 'unattributed',
          evidence: '',
        });
      }
    }
    ts.forEachChild(node, visitStrings);
  };
  visitStrings(sourceFile);

  return { tokens, sites };
}
