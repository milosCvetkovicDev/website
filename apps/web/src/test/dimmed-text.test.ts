/**
 * Guard for the colour rule ADR 0008 set and ADR 0011 carried over, which CLAUDE.md restates under
 * Conventions: text is not dimmed with an opacity modifier, "decorative or `aria-hidden` text
 * included, since axe measures it either way". The axe gate (`e2e/accessibility.spec.ts`) can only
 * enforce it on what a route renders, at the moment it samples. `CodeLine` painted its line numbers
 * `text-[var(--muted)]/50`, 2.74:1 on the Terminal, and nothing noticed because no route renders it
 * (#110). This reads the source instead, so it sees every component whether a page uses it or not.
 *
 * It flags a class token in any module under `src/components`, outside `__tests__`, that dims:
 *
 * - an alpha modifier on a text colour: `text-[var(--muted)]/50`, `text-white/60`,
 *   `text-green-800/70`, a theme colour such as `text-muted/50`, or `text-(--muted)/50`;
 * - an `opacity-*` below 100, where `opacity-0` hides rather than dims and starts the reveal the rule
 *   allows;
 * - an animation whose keyframes hold its element part-transparent, such as `animate-pulse` (see
 *   OPACITY_ANIMATIONS);
 *
 * in any variant (`dark:`, `hover:`, `group-hover:`), when it lands on an element that may render
 * text: text or an expression anywhere under it, SVG `<text>` included, or a component whose output
 * the scan cannot see. The whole subtree counts because `opacity` composites everything under the
 * element, which is how `DataStream`'s `opacity-10` wrapper dims digits one element down. An element
 * with only shapes under it does not count, so a decorative SVG can keep a dimmed `currentColor`, as
 * the section progress corners do. A dimming token the scan cannot trace to an element is flagged as
 * well, since it cannot tell what that element renders.
 *
 * A class-string scan cannot see the rest, so it is out of scope: GSAP tweens (ADR 0008's separate
 * rule that a reveal starts from 0), inline `style` colours and opacities, and CSS outside the
 * `animate-*` utilities.
 *
 * The violations present when the guard landed are expected failures in KNOWN_DEFECTS, and the change
 * that fixes one deletes its entry. Nothing here needs a DOM, and building a jsdom window costs about
 * two seconds per file.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMPONENTS_DIR = 'src/components';
const GLOBALS_CSS = 'src/app/globals.css';

// --- Which class tokens dim ----------------------------------------------------------------------

interface Vocabulary {
  /** The colour names the theme adds to Tailwind's, from the `--color-*` declarations. */
  themeColours: ReadonlySet<string>;
  /** The `animate-*` utilities that hold what they animate part-transparent. */
  dimmingAnimations: ReadonlySet<string>;
}

/**
 * Every animation utility whose keyframes set an opacity, and whether it dims what it animates.
 * Tailwind's own two come first. The rest are the `animate-*` classes in globals.css, and a test
 * below fails when globals.css gains an opacity animation this table does not classify, so a new one
 * gets a decision instead of a pass.
 */
const OPACITY_ANIMATIONS: Record<
  string,
  { dims: boolean; source: 'tailwind' | 'globals.css'; why: string }
> = {
  pulse: { dims: true, source: 'tailwind', why: 'holds opacity 0.5 halfway through every cycle' },
  ping: { dims: true, source: 'tailwind', why: 'fades to 0 as it scales up, on a loop' },
  blink: { dims: false, source: 'globals.css', why: 'steps between 1 and 0, never in between' },
  'fade-in': { dims: false, source: 'globals.css', why: 'a reveal from 0, held at 1' },
  'scale-in': { dims: false, source: 'globals.css', why: 'a reveal from 0, held at 1' },
  'slide-in-left': { dims: false, source: 'globals.css', why: 'a reveal from 0, held at 1' },
  'slide-in-right': { dims: false, source: 'globals.css', why: 'a reveal from 0, held at 1' },
};

function readVocabulary(css: string): Vocabulary {
  return {
    themeColours: new Set([...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((match) => match[1])),
    dimmingAnimations: new Set(
      Object.entries(OPACITY_ANIMATIONS)
        .filter(([, animation]) => animation.dims)
        .map(([name]) => name),
    ),
  };
}

/** The `animate-*` utilities `css` defines whose keyframes set an opacity. */
function opacityAnimationsIn(css: string): string[] {
  const keyframes = new Map<string, string>();
  for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let end = match.index + match[0].length;
    while (depth > 0 && end < css.length) {
      if (css[end] === '{') depth++;
      else if (css[end] === '}') depth--;
      end++;
    }
    keyframes.set(match[1], css.slice(match.index, end));
  }
  const utilities: [string, string | undefined][] = [
    ...[...css.matchAll(/\.animate-([\w-]+)\s*\{([^}]*)\}/g)].map(
      (match): [string, string | undefined] => [
        match[1],
        /animation(?:-name)?\s*:\s*([\w-]+)/.exec(match[2])?.[1],
      ],
    ),
    ...[...css.matchAll(/--animate-([\w-]+)\s*:\s*([\w-]+)/g)].map((match): [string, string] => [
      match[1],
      match[2],
    ]),
  ];
  return utilities
    .filter(([, name]) => name !== undefined && /\bopacity\s*:/.test(keyframes.get(name) ?? ''))
    .map(([utility]) => utility);
}

const globalsCss = readFileSync(path.join(appDir, GLOBALS_CSS), 'utf8');
const vocabulary = readVocabulary(globalsCss);

/** The utility a token applies once its variants (`dark:`, `group-hover:`, `md:`) and `!` are gone. */
function utilityOf(token: string): string {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < token.length; index++) {
    const char = token[index];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) start = index + 1;
  }
  return token.slice(start).replace(/^!|!$/g, '');
}

const SHADES = new Set('50 100 200 300 400 500 600 700 800 900 950'.split(' '));

/** Arbitrary `text-[…]` values Tailwind v4 reads as a font size: a length, a math function, a keyword. */
const FONT_SIZE = /^(-?[\d.]+[a-z%]*|(calc|clamp|min|max)\(.*)$/;
const FONT_SIZE_KEYWORD = /^((x{1,3}-)?(small|medium|large)|smaller|larger)$/;

/**
 * Whether `text-<value>` sets a colour rather than a font size, the other thing a slash can follow:
 * `text-sm/6` is a size with a line height. An arbitrary value is read the way Tailwind v4 reads it:
 * a length, a math function, a size keyword or a type hint such as `length:` makes a size, and
 * anything else, a bare `var()` included, is a colour.
 */
function isTextColour(value: string, themeColours: ReadonlySet<string>): boolean {
  const arbitrary = /^\[(.*)\]$/.exec(value);
  if (arbitrary) {
    const inner = arbitrary[1];
    if (inner.startsWith('color:')) return true;
    if (/^[a-z-]+:/.test(inner)) return false;
    return !FONT_SIZE.test(inner) && !FONT_SIZE_KEYWORD.test(inner);
  }
  const variable = /^\((.*)\)$/.exec(value);
  if (variable) return /^(color:)?--/.test(variable[1]);
  if (['white', 'black', 'current'].includes(value) || themeColours.has(value)) return true;
  const palette = /^[a-z]+-(\d+)$/.exec(value);
  return palette !== null && SHADES.has(palette[1]);
}

/**
 * Whether an opacity or an alpha is strictly between none and all. Tailwind reads a bare number as a
 * percentage and an arbitrary one as a fraction. An amount this cannot read, such as a variable,
 * counts as partial.
 */
function isPartial(amount: string): boolean {
  const percent = /^(\d+(?:\.\d+)?)$/.exec(amount) ?? /^\[(\d*\.?\d+)%\]$/.exec(amount);
  if (percent) return Number(percent[1]) > 0 && Number(percent[1]) < 100;
  const fraction = /^\[(\d*\.?\d+)\]$/.exec(amount);
  if (fraction) return Number(fraction[1]) > 0 && Number(fraction[1]) < 1;
  return true;
}

/** Whether a class token dims what it lands on. */
function dims(token: string): boolean {
  const utility = utilityOf(token);
  const alpha = /^text-(.+)\/([^/]+)$/.exec(utility);
  if (alpha) return isTextColour(alpha[1], vocabulary.themeColours) && isPartial(alpha[2]);
  const opacity = /^opacity-(.+)$/.exec(utility);
  if (opacity) return isPartial(opacity[1]);
  const animation = /^animate-(.+)$/.exec(utility);
  return animation !== null && vocabulary.dimmingAnimations.has(animation[1]);
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

function isStringNode(node: ts.Node): node is StringNode {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  );
}

/** Every string-like node opens with one delimiter: a quote, a backtick or a substitution's `}`. */
function chunkOf(node: StringNode | ts.Identifier): Chunk {
  return { node, text: node.text, start: node.getStart() + (ts.isIdentifier(node) ? 0 : 1) };
}

function isClassAttribute(attribute: ts.JsxAttribute): boolean {
  return /^(class|className)$|ClassName$/.test(attribute.name.getText());
}

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

function bindingNamed(
  node: ts.ParameterDeclaration | ts.BindingElement,
  text: string,
): ts.ParameterDeclaration | ts.BindingElement | undefined {
  if (ts.isIdentifier(node.name)) return node.name.text === text ? node : undefined;
  for (const element of node.name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    const found = bindingNamed(element, text);
    if (found) return found;
  }
  return undefined;
}

/**
 * The initializer or function a name refers to, found by walking out through the scopes around it.
 * A parameter without a default resolves to nothing, which is what a prop is: a class the scan
 * cannot see from here.
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
          if (ts.isIdentifier(declaration.name) && declaration.name.text === name.text) {
            return declaration.initializer;
          }
        }
      }
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
  if (ts.isPropertyAssignment(property)) {
    // clsx and friends read a key as a class name, so keys are read as well as values.
    const key =
      ts.isStringLiteral(property.name) || ts.isIdentifier(property.name)
        ? [chunkOf(property.name)]
        : [];
    return [...key, ...classChunks(property.initializer, seen)];
  }
  if (ts.isShorthandPropertyAssignment(property)) {
    return [chunkOf(property.name), ...classChunks(property.name, seen)];
  }
  if (ts.isSpreadAssignment(property)) return classChunks(property.expression, seen);
  return [];
}

/**
 * The strings a class attribute's value can be built from: its literals, both branches of every
 * condition, the pieces of a template, clsx arguments and keys, and, through the names they use, the
 * constants, maps and helper functions of the same module.
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
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSpreadElement(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return classChunks(node.expression, seen);
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

/** Whether a string is the value of an attribute that never becomes a class, such as `d` or `href`. */
function isOtherAttributeValue(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return !isClassAttribute(current);
    if (
      ts.isFunctionLike(current) ||
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current)
    ) {
      return false;
    }
  }
  return false;
}

// --- Whether an element renders text ------------------------------------------------------------

/** Tags that render a value or a placeholder as text without a text child. */
const TEXT_CONTROLS = new Set(['input', 'textarea', 'select']);

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 40 ? `${flat.slice(0, 39)}…` : flat;
}

/**
 * What makes `element` count as rendering text, or null when nothing under it can. An expression
 * counts unless it is a literal, JSX this can read, a condition over those or a `.map` whose callback
 * returns them; a component counts because its output is out of sight here. The first pass skips
 * components, so that the message names the text itself when there is any.
 */
function textEvidence(element: JsxTag): string | null {
  return tagEvidence(element, false) ?? tagEvidence(element, true);
}

function tagEvidence(element: JsxTag, components: boolean): string | null {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const tag = opening.tagName.getText();
  if (!/^[a-z][\w-]*$/.test(tag) && components) {
    return `<${tag}>, whose output this scan cannot see`;
  }
  if (TEXT_CONTROLS.has(tag)) return `a <${tag}>, which renders its value as text`;
  const innerHtml = opening.attributes.properties.some(
    (attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText() === 'dangerouslySetInnerHTML',
  );
  if (innerHtml) return 'dangerouslySetInnerHTML';
  return ts.isJsxElement(element) ? childrenEvidence(element.children, components) : null;
}

function childrenEvidence(children: readonly ts.JsxChild[], components: boolean): string | null {
  for (const child of children) {
    const evidence = childEvidence(child, components);
    if (evidence) return evidence;
  }
  return null;
}

function childEvidence(child: ts.JsxChild, components: boolean): string | null {
  if (ts.isJsxText(child)) {
    return child.containsOnlyTriviaWhiteSpaces ? null : `the text "${clip(child.text)}"`;
  }
  if (ts.isJsxExpression(child)) {
    return child.expression ? expressionEvidence(child.expression, components) : null;
  }
  if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) {
    return tagEvidence(child, components);
  }
  if (ts.isJsxFragment(child)) return childrenEvidence(child.children, components);
  return null;
}

/** What a `list.map(…)` or `list.flatMap(…)` callback returns, or undefined for anything else. */
function mappedResults(expression: ts.Expression): ts.Expression[] | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined;
  }
  if (!['map', 'flatMap'].includes(expression.expression.name.text)) return undefined;
  const callback = expression.arguments.find(
    (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
  );
  return callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
    ? returnedExpressions(callback)
    : undefined;
}

function expressionEvidence(node: ts.Expression, components: boolean): string | null {
  const expression = unwrap(node);
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text.trim() ? `the string "${clip(expression.text)}"` : null;
  }
  if (
    expression.kind === ts.SyntaxKind.NullKeyword ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    (ts.isIdentifier(expression) && expression.text === 'undefined')
  ) {
    return null;
  }
  if (ts.isJsxElement(expression) || ts.isJsxSelfClosingElement(expression)) {
    return tagEvidence(expression, components);
  }
  if (ts.isJsxFragment(expression)) return childrenEvidence(expression.children, components);
  if (ts.isConditionalExpression(expression)) {
    return (
      expressionEvidence(expression.whenTrue, components) ??
      expressionEvidence(expression.whenFalse, components)
    );
  }
  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    // `a && <X />` renders <X /> or nothing: the left side is the condition.
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return expressionEvidence(expression.right, components);
    }
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return (
        expressionEvidence(expression.left, components) ??
        expressionEvidence(expression.right, components)
      );
    }
  }
  const mapped = mappedResults(expression);
  if (mapped) {
    for (const result of mapped) {
      const evidence = expressionEvidence(result, components);
      if (evidence) return evidence;
    }
    return null;
  }
  return `{${clip(expression.getText())}}`;
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

type Verdict = 'text' | 'no-text' | 'unattributed';

interface Site {
  file: string;
  line: number;
  component: string;
  /** The tag the class lands on, or '' when the scan could not trace it to one. */
  element: string;
  token: string;
  verdict: Verdict;
  /** What under the element counts as text, for the failure message. */
  evidence: string;
}

interface Scan {
  /** Every class token the scan traced to an element, dimming or not. */
  tokens: string[];
  /** Every dimming token, with whether the element it lands on renders text. */
  sites: Site[];
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

function scanSource(source: string, file: string): Scan {
  assertParses(source, file);
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const tokens: string[] = [];
  const sites: Site[] = [];
  const traced = new Set<ts.Node>();
  const evidenceOf = new Map<JsxTag, string | null>();
  const lineOf = (position: number) => sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const tokensIn = (chunk: Chunk) =>
    [...chunk.text.matchAll(/\S+/g)].map((match) => ({
      token: match[0],
      at: chunk.start + match.index,
    }));

  const visitElements = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      for (const attribute of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !isClassAttribute(attribute)) continue;
        for (const chunk of classChunks(attribute.initializer)) {
          traced.add(chunk.node);
          for (const { token, at } of tokensIn(chunk)) {
            tokens.push(token);
            if (!dims(token)) continue;
            if (!evidenceOf.has(node)) evidenceOf.set(node, textEvidence(node));
            const evidence = evidenceOf.get(node) ?? null;
            sites.push({
              file,
              line: lineOf(at),
              component: componentOf(node),
              element: opening.tagName.getText(),
              token,
              verdict: evidence ? 'text' : 'no-text',
              evidence: evidence ?? '',
            });
          }
        }
      }
    }
    ts.forEachChild(node, visitElements);
  };
  visitElements(sourceFile);

  const visitStrings = (node: ts.Node): void => {
    if (isStringNode(node) && !traced.has(node) && !isOtherAttributeValue(node)) {
      for (const { token, at } of tokensIn(chunkOf(node))) {
        if (!dims(token)) continue;
        sites.push({
          file,
          line: lineOf(at),
          component: componentOf(node),
          element: '',
          token,
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

// --- The fixtures --------------------------------------------------------------------------------

function scan(source: string, file = 'src/components/fixture.tsx'): Scan {
  return scanSource(source, file);
}

/** The dimming tokens the scan reports, with why: over text, or not traced to an element. */
const flagged = (result: Scan) =>
  result.sites
    .filter((site) => site.verdict !== 'no-text')
    .map((site) => [site.token, site.verdict]);

describe('what the scan flags', () => {
  it.each<[string, string, string[]]>([
    [
      "CodeLine's gutter as it was before #110",
      `export function CodeLine({ lineNumber }: { lineNumber?: number }) {
        return (
          <div className="group flex">
            {lineNumber !== undefined && (
              <span className="w-8 text-right text-[var(--muted)]/50 group-hover:text-[var(--muted)]">
                {lineNumber}
              </span>
            )}
          </div>
        );
      }`,
      ['text-[var(--muted)]/50'],
    ],
    [
      'an alpha on white, on a palette shade and on a theme colour',
      `export const Labels = () => (
        <p>
          <span className="text-white/60">one</span>
          <span className="text-green-800/70">two</span>
          <span className="text-muted/50 text-accent-text/60">three</span>
        </p>
      );`,
      ['text-white/60', 'text-green-800/70', 'text-muted/50', 'text-accent-text/60'],
    ],
    [
      "arbitrary colours, arbitrary alphas and Tailwind v4's variable shorthand",
      `export const Labels = () => (
        <p>
          <span className="text-[#8b949e]/50 text-[color:var(--x)]/50 text-[rgb(1_2_3)]/50">a</span>
          <span className="text-(--muted)/50 text-[var(--muted)]/[0.6] text-white/(--alpha)">b</span>
        </p>
      );`,
      [
        'text-[#8b949e]/50',
        'text-[color:var(--x)]/50',
        'text-[rgb(1_2_3)]/50',
        'text-(--muted)/50',
        'text-[var(--muted)]/[0.6]',
        'text-white/(--alpha)',
      ],
    ],
    [
      'variants and the important marker',
      `export const Label = () => (
        <span className="dark:text-white/50 hover:text-[var(--muted)]/60 md:opacity-60 group-hover:opacity-50 !opacity-40 opacity-30!">
          x
        </span>
      );`,
      [
        'dark:text-white/50',
        'hover:text-[var(--muted)]/60',
        'md:opacity-60',
        'group-hover:opacity-50',
        '!opacity-40',
        'opacity-30!',
      ],
    ],
    [
      'an opacity below 100 in every spelling Tailwind v4 reads',
      `export const Label = () => (
        <span className="opacity-60 opacity-2.5 opacity-[.5] opacity-[50%] opacity-(--dim)">x</span>
      );`,
      ['opacity-60', 'opacity-2.5', 'opacity-[.5]', 'opacity-[50%]', 'opacity-(--dim)'],
    ],
    [
      'a reveal that stops short of full opacity',
      `export const Label = () => (
        <span className="opacity-0 transition-opacity group-hover:opacity-50">x</span>
      );`,
      ['group-hover:opacity-50'],
    ],
    [
      "an opacity on an ancestor of the text, as DataStream's wrapper has",
      `export function DataStream({ className = '' }: { className?: string }) {
        const lines = '0101';
        return (
          <div className={\`pointer-events-none absolute inset-0 opacity-10 \${className}\`}>
            <div className="animate-scroll-up font-mono">{lines}</div>
          </div>
        );
      }`,
      ['opacity-10'],
    ],
    [
      'an opacity over SVG text drawn from a list, as the featured work diagram has',
      `const NODES = [{ id: 'api', label: 'API' }];
      export function Diagram() {
        return (
          <div aria-hidden="true" className="absolute inset-0 opacity-40 dark:opacity-60">
            <svg viewBox="0 0 10 10">
              <g>
                {NODES.map((node) => (
                  <text key={node.id} y={8}>
                    {node.label}
                  </text>
                ))}
              </g>
            </svg>
          </div>
        );
      }`,
      ['opacity-40', 'dark:opacity-60'],
    ],
    [
      'a pulse on text, as StatDisplay has when highlighted',
      `export function Stat({ value, highlight }: { value: string; highlight?: boolean }) {
        return (
          <span
            className={\`font-mono \${
              highlight ? 'animate-pulse font-bold text-[var(--accent-text)]' : 'text-[var(--accent-text)]'
            }\`}
          >
            {value}
          </span>
        );
      }`,
      ['animate-pulse'],
    ],
    [
      'a ping on text',
      `export const Badge = () => <span className="animate-ping">New</span>;`,
      ['animate-ping'],
    ],
    [
      'a class that reaches the element through a map, a helper or clsx',
      `import { cn } from '@/lib/utils';
      const tones = { dim: 'text-white/50', loud: 'text-white' };
      function mutedIf(muted: boolean) {
        return muted ? 'opacity-60' : '';
      }
      export function Label({ tone, muted, label }: { tone: 'dim' | 'loud'; muted: boolean; label: string }) {
        return (
          <p>
            <span className={tones[tone]}>{label}</span>
            <span className={mutedIf(muted)}>{label}</span>
            <span className={cn('font-mono', { 'opacity-70': muted })}>{label}</span>
          </p>
        );
      }`,
      ['text-white/50', 'opacity-60', 'opacity-70'],
    ],
    [
      'an element whose content the scan cannot see, and a text input',
      `export function Row({ children }: { children: React.ReactNode }) {
        return (
          <div>
            <div className="opacity-50">{children}</div>
            <div className="opacity-60">
              <Label />
            </div>
            <Badge className="opacity-70" />
            <input className="placeholder:text-white/40" placeholder="Search" />
          </div>
        );
      }`,
      ['opacity-50', 'opacity-60', 'opacity-70', 'placeholder:text-white/40'],
    ],
  ])('%s', (_name, source, tokens) => {
    expect(flagged(scan(source))).toEqual(tokens.map((token) => [token, 'text']));
  });

  it('a dimming class in a string it cannot trace to an element', () => {
    const source = `export const dimmedLabel = 'font-mono text-white/50';`;
    expect(flagged(scan(source, 'src/components/styles.ts'))).toEqual([
      ['text-white/50', 'unattributed'],
    ]);
  });
});

describe('what the scan leaves alone', () => {
  it.each<[string, string, string[]]>([
    [
      'a decorative SVG frame that keeps a dimmed currentColor, as the section progress corners do',
      `export const Corner = () => (
        <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
          <path d="M0 20 L0 0 L20 0" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      );`,
      ['text-[var(--accent)]/30'],
    ],
    [
      "an aria-hidden bracket whose opacity a condition picks, as FeaturedWork's corners do",
      `export function CornerBrackets({ active }: { active: boolean }) {
        return (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={\`absolute h-3 w-3 \${
              active ? 'text-[var(--accent)] opacity-100' : 'text-[var(--tmux-border)] opacity-50'
            }\`}
          >
            <path d="M0 6 L0 0 L6 0" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        );
      }`,
      ['opacity-100', 'opacity-50'],
    ],
    [
      "shapes inside an SVG beside text that is not dimmed, as HexBadge's polygons are",
      `export function HexBadge({ children }: { children: React.ReactNode }) {
        return (
          <div className="relative inline-flex">
            <svg viewBox="0 0 100 100" className="h-16 w-16 text-[var(--accent)]">
              <polygon points="50 3, 93 25" fill="none" stroke="currentColor" className="opacity-50" />
              <polygon points="50 10, 85 28" fill="currentColor" className="opacity-10" />
            </svg>
            <span className="absolute text-lg">{children}</span>
          </div>
        );
      }`,
      ['opacity-50', 'opacity-10', 'absolute', 'text-lg'],
    ],
    [
      'shapes an SVG draws from a list',
      `const PATHS = ['M0 0 L1 1', 'M1 1 L2 2'];
      export const Circuit = () => (
        <svg className="text-[var(--accent)]/40 opacity-60" viewBox="0 0 2 2">
          {PATHS.map((d) => (
            <path key={d} d={d} stroke="currentColor" />
          ))}
        </svg>
      );`,
      ['text-[var(--accent)]/40', 'opacity-60'],
    ],
    [
      'hidden and full opacity, which do not dim',
      `export const Reveal = ({ shown }: { shown: boolean }) => (
        <span
          className={\`transition-opacity \${shown ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 opacity-[1] text-white/100\`}
        >
          x
        </span>
      );`,
      ['opacity-100', 'opacity-0', 'group-hover:opacity-100', 'opacity-[1]', 'text-white/100'],
    ],
    [
      'tints, borders, decoration and shadows with an alpha, none of which is the text colour',
      `export const Pill = () => (
        <span className="border border-[var(--status-ok)]/50 bg-[var(--accent)]/10 decoration-[var(--status-ok)]/50 hover:bg-[var(--accent)]/5 shadow-black/20 text-shadow-lg/50">
          ok
        </span>
      );`,
      [
        'border-[var(--status-ok)]/50',
        'bg-[var(--accent)]/10',
        'decoration-[var(--status-ok)]/50',
        'hover:bg-[var(--accent)]/5',
        'shadow-black/20',
        'text-shadow-lg/50',
      ],
    ],
    [
      'a font size with a line height, which is also written after a slash',
      `export const Title = () => (
        <h2 className="text-sm/6 text-2xl/[1.1] text-[10px]/4 text-[length:var(--size)]/7 text-(length:--size)/7 text-[clamp(1rem,2vw,2rem)]/8">
          Title
        </h2>
      );`,
      [
        'text-sm/6',
        'text-2xl/[1.1]',
        'text-[10px]/4',
        'text-[length:var(--size)]/7',
        'text-(length:--size)/7',
        'text-[clamp(1rem,2vw,2rem)]/8',
      ],
    ],
    [
      'animations that do not hold text part-transparent, and a pulse on a dot',
      `export const Status = () => (
        <p className="animate-bounce">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          <span className="animate-spin">↻</span>
          <span className="animate-blink ml-0.5 inline-block h-5 w-2 bg-[var(--accent)]" />
          Live
        </p>
      );`,
      ['animate-bounce', 'animate-pulse', 'animate-spin', 'animate-blink'],
    ],
    [
      'whitespace, comments, null and a condition that renders a shape',
      `export const Spacer = ({ show }: { show: boolean }) => (
        <span className="opacity-50">
          {' '}
          {/* a comment */}
          {show && (
            <svg>
              <path d="M0 0" />
            </svg>
          )}
          {null}
        </span>
      );`,
      ['opacity-50'],
    ],
    [
      'class-like words in attributes that are not classes',
      `export const Go = () => (
        <a className="font-mono" href="/opacity-50" aria-label="text-white/50 as prose" data-state="opacity-40">
          Go
        </a>
      );`,
      ['font-mono'],
    ],
  ])('%s', (_name, source, seen) => {
    const result = scan(source);
    expect(result.tokens).toEqual(expect.arrayContaining(seen));
    expect(flagged(result)).toEqual([]);
  });
});

describe('what the scan cannot pass by not seeing', () => {
  it('refuses a module it cannot parse', () => {
    expect(() => scan('export const A = () => <div className="opacity-50">x</span>;')).toThrow(
      /did not parse/,
    );
  });

  it('reads the theme colours from globals.css', () => {
    expect([...vocabulary.themeColours]).toEqual(
      expect.arrayContaining(['muted', 'accent', 'accent-text', 'status-ok', 'foreground']),
    );
  });

  it('classifies every opacity animation globals.css defines, and no animation it does not', () => {
    const defined = opacityAnimationsIn(globalsCss);
    const classified = Object.entries(OPACITY_ANIMATIONS)
      .filter(([, animation]) => animation.source === 'globals.css')
      .map(([name]) => name);
    expect(defined.toSorted()).toEqual(classified.toSorted());
  });
});

// --- The components ------------------------------------------------------------------------------

const RULE =
  'Text is not dimmed with an opacity modifier, decorative and aria-hidden text included (ADR 0008, ' +
  'carried over by ADR 0011). Paint secondary text with --muted at full opacity, or move the ' +
  'dimming onto an element with no text under it, such as the decorative SVG itself.';

interface KnownDefect {
  id: string;
  file: string;
  component: string;
  tokens: string[];
  /** The change that removes it, or `unassigned`. */
  fixedBy: string;
  why: string;
}

/**
 * The violations present when this guard landed. Each is an expected failure until the change that
 * fixes it deletes the entry, which it has to: an expected failure that passes fails the run. Adding
 * an entry ships a known defect on purpose, so it names what fixes it.
 */
const KNOWN_DEFECTS: KnownDefect[] = [
  {
    id: 'DIM1',
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'CodeLine',
    tokens: ['text-[var(--muted)]/50'],
    fixedBy: '#110',
    why: 'the line-number gutter, which #110 paints with --muted at full opacity',
  },
  {
    id: 'DIM2',
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'DataStream',
    tokens: ['opacity-10'],
    fixedBy: 'unassigned',
    why: 'fifty lines of --accent-text digits under an opacity-10 wrapper, a texture made of text',
  },
  {
    id: 'DIM3',
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'StatDisplay',
    tokens: ['animate-pulse'],
    fixedBy: 'unassigned',
    why: 'a highlighted value pulses its glyphs down to opacity 0.5 and back',
  },
  {
    id: 'DIM4',
    file: 'src/components/animated-hero/animated-text.tsx',
    component: 'GlitchText',
    tokens: ['opacity-70'],
    fixedBy: 'unassigned',
    why: 'the two aria-hidden copies of its text drawn while it glitches on hover',
  },
  {
    id: 'DIM5',
    file: 'src/components/featured-work/architecture-background.tsx',
    component: 'ArchitectureBackground',
    tokens: ['opacity-40', 'dark:opacity-60'],
    fixedBy: 'unassigned',
    why: 'the diagram behind the featured work draws its node labels as SVG <text> under this wrapper',
  },
];

/**
 * Dimmed classes the rule allows because nothing under them renders text, the three this guard was
 * written to leave alone. Pinned with their counts to show the scan reaching and judging them rather
 * than missing them. A <text> added under one turns it into a finding.
 */
const DECORATIVE = [
  {
    file: 'src/components/animated-hero/section-progress.tsx',
    component: 'SectionProgress',
    element: 'svg',
    token: 'text-[var(--accent)]/30',
    count: 4,
  },
  {
    file: 'src/components/featured-work.tsx',
    component: 'CornerBrackets',
    element: 'svg',
    token: 'opacity-50',
    count: 1,
  },
  {
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'HexBadge',
    element: 'polygon',
    token: 'opacity-50',
    count: 1,
  },
  {
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'HexBadge',
    element: 'polygon',
    token: 'opacity-10',
    count: 1,
  },
];

/**
 * Floors on what the scan reads, well under today's 28 modules and 2,081 class tokens so that
 * deleting a component does not trip them, and far over what a walk that lost a directory or an
 * attribute visitor that stopped firing would read.
 */
const MODULE_FLOOR = 20;
const TOKEN_FLOOR = 1500;

/** Every module under src/components outside the test folders, relative to apps/web. */
function componentModules(): string[] {
  const found: string[] = [];
  const descend = (relative: string): void => {
    for (const entry of readdirSync(path.join(appDir, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') descend(child);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(child);
      }
    }
  };
  descend(COMPONENTS_DIR);
  return found.sort();
}

let components: { modules: string[]; tokens: number; sites: Site[] } | undefined;

function scanComponents() {
  if (!components) {
    const modules = componentModules();
    const scans = modules.map((module) =>
      scanSource(readFileSync(path.join(appDir, module), 'utf8'), module),
    );
    components = {
      modules,
      tokens: scans.reduce((sum, result) => sum + result.tokens.length, 0),
      sites: scans.flatMap((result) => result.sites),
    };
  }
  return components;
}

const findings = () => scanComponents().sites.filter((site) => site.verdict !== 'no-text');

const covers = (known: KnownDefect, site: Site) =>
  site.file === known.file &&
  site.component === known.component &&
  known.tokens.includes(site.token);

function describeSite(site: Site): string {
  const where = `apps/web/${site.file}:${site.line} ${site.component}`;
  return site.verdict === 'unattributed'
    ? `${where} ${site.token}, in a class string the scan cannot trace to an element`
    : `${where} <${site.element}> ${site.token}, over ${site.evidence}`;
}

describe('the components', () => {
  // Parsing every module twice over, once to prove it parses and once to walk it, is the one costly
  // step: 0.4 s on its own at a load average of 3.5, while the whole file took 4 s inside a full
  // `pnpm test` at a load average near 10. So it runs once, here, under a timeout that says what it
  // is for, and no case pays for it against the 5 s default; eslint-config.test.ts does the same for
  // loading ESLint.
  beforeAll(() => {
    scanComponents();
  }, 60_000);

  it('reads every component module and the classes in them', () => {
    const { modules, tokens } = scanComponents();
    expect(modules.length).toBeGreaterThanOrEqual(MODULE_FLOOR);
    expect(tokens).toBeGreaterThanOrEqual(TOKEN_FLOOR);
  });

  it('dims no text, apart from the known defects', () => {
    const unexpected = findings().filter(
      (site) => !KNOWN_DEFECTS.some((known) => covers(known, site)),
    );
    expect(unexpected.map(describeSite), RULE).toEqual([]);
  });

  it.each(DECORATIVE)('finds no text under $component <$element> $token', (decorative) => {
    const verdicts = scanComponents()
      .sites.filter(
        (site) =>
          site.file === decorative.file &&
          site.component === decorative.component &&
          site.element === decorative.element &&
          site.token === decorative.token,
      )
      .map((site) => site.verdict);
    expect(verdicts).toEqual(Array.from({ length: decorative.count }, () => 'no-text'));
  });

  // When one of these fails with "Expect test to fail", its defect is gone: delete the entry.
  for (const known of KNOWN_DEFECTS) {
    it.fails(`${known.id} (${known.fixedBy}): ${known.component} dims no text`, () => {
      expect(
        findings()
          .filter((site) => covers(known, site))
          .map(describeSite),
      ).toEqual([]);
    });
  }
});
