/**
 * The type gate on the JSON-LD payloads (#57 AC 8, ADR 0031).
 *
 * `lib/structured-data.ts` ends every builder's object with `satisfies WithContext<T>`, `T` being
 * its schema-dts type, so a misspelled predicate fails `pnpm typecheck` on the line that wrote it.
 * A conditional spread is not checked by the object around it, so each spread's own object carries
 * a `satisfies SpreadPredicates<…Leaf>`, and each ListItem a trail maps to carries
 * `satisfies ListItem`.
 *
 * The type rows here are checked by `pnpm typecheck` (the web tsconfig includes every `.ts` file,
 * and the last test below fails if it stops including this one), not by `pnpm test`, where the
 * types compile away and these rows pass whatever they hold. Each
 * `@ts-expect-error` below must meet an error, or tsc fails on the unused directive. So the rows
 * are a canary for schema-dts itself: a release that stops checking a misspelled predicate on a
 * node, in a nested object, in a list item or in a spread's object, or stops checking `@type`,
 * fails the typecheck on the row that lost its error. The `toExtend` rows hold every builder's
 * return type to its node type, which is also what lets `components/json-ld.tsx` render it.
 *
 * The type rows cannot see a builder losing its `satisfies`: its misspellings then compile, and
 * its `toExtend` row fails only by accident (the `@type` widens to `string`; kept literal another
 * way, it passes with any misspelling beside it, since an object with extra keys still extends its
 * node type). So the module's source is read too, under `pnpm test`: each builder must return its
 * literal through `satisfies WithContext<T>` of its own type, every literal with an `@type` must
 * sit inside a `satisfies`, and every conditional spread's object must be a
 * `satisfies SpreadPredicates<…>`. Deleting any of them fails a test.
 *
 * @vitest-environment node
 */
import type {
  BreadcrumbList,
  ListItem,
  Person,
  ProfilePage,
  TechArticle,
  TechArticleLeaf,
  WebPage,
  WebSite,
  WithContext,
} from 'schema-dts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  breadcrumbList,
  person,
  profilePage,
  techArticle,
  webPage,
  website,
  type JsonLdNode,
  type SpreadPredicates,
} from '../structured-data';

const CONTEXT = 'https://schema.org';

describe('the JSON-LD builders', () => {
  it('each return their schema-dts node type, which the renderer takes', () => {
    expectTypeOf(person).returns.toExtend<WithContext<Person>>();
    expectTypeOf(website).returns.toExtend<WithContext<WebSite>>();
    expectTypeOf(webPage).returns.toExtend<WithContext<WebPage>>();
    expectTypeOf(profilePage).returns.toExtend<WithContext<ProfilePage>>();
    expectTypeOf(techArticle).returns.toExtend<WithContext<TechArticle>>();
    expectTypeOf(breadcrumbList).returns.toExtend<WithContext<BreadcrumbList>>();
    expectTypeOf<
      | ReturnType<typeof person>
      | ReturnType<typeof website>
      | ReturnType<typeof webPage>
      | ReturnType<typeof profilePage>
      | ReturnType<typeof techArticle>
      | ReturnType<typeof breadcrumbList>
    >().toExtend<JsonLdNode>();
  });
});

// Each row's object is wrapped in `expectTypeOf` only to make it an expression a test holds: the
// check is its `satisfies`, and the directive above the line where tsc reports the error.
describe('schema-dts, as the builders use it', () => {
  it('refuses a misspelled predicate on a node', () => {
    expectTypeOf({
      '@context': CONTEXT,
      '@type': 'Person',
      name: 'A',
      // @ts-expect-error: jobTitel is not a Person predicate (TS2561, "Did you mean 'jobTitle'?")
      jobTitel: 'B',
    } satisfies WithContext<Person>).not.toBeNever();
  });

  it('refuses a misspelled predicate in a nested object', () => {
    expectTypeOf({
      '@context': CONTEXT,
      '@type': 'Person',
      name: 'A',
      // @ts-expect-error: addressLocalty is not a PostalAddress predicate (TS1360)
      address: { '@type': 'PostalAddress', addressLocalty: 'B' },
    } satisfies WithContext<Person>).not.toBeNever();
  });

  it('refuses a misspelled predicate in a list item', () => {
    expectTypeOf({
      '@type': 'ListItem',
      // @ts-expect-error: positon is not a ListItem predicate (TS2561, "Did you mean 'position'?")
      positon: 1,
      name: 'A',
    } satisfies ListItem).not.toBeNever();
  });

  it("refuses a misspelled predicate in a spread's own object", () => {
    const keywords: readonly string[] | undefined = ['A'];
    expectTypeOf({
      '@context': CONTEXT,
      '@type': 'TechArticle',
      headline: 'A',
      ...(keywords !== undefined &&
        ({
          // @ts-expect-error: keywordz is not a TechArticle predicate (TS2561)
          keywordz: keywords,
        } satisfies SpreadPredicates<TechArticleLeaf>)),
    } satisfies WithContext<TechArticle>).not.toBeNever();
  });

  it("refuses a spread that would overwrite the node's @id", () => {
    const description: string | undefined = 'A';
    expectTypeOf({
      '@context': CONTEXT,
      '@type': 'TechArticle',
      '@id': 'https://example.com/#article',
      headline: 'A',
      ...(description !== undefined &&
        ({
          description,
          // @ts-expect-error: a spread adds predicates, never the node's identity (TS2353)
          '@id': 'https://example.com/#other',
        } satisfies SpreadPredicates<TechArticleLeaf>)),
    } satisfies WithContext<TechArticle>).not.toBeNever();
  });

  it('refuses a node type that is not one', () => {
    // schema-dts's WebPage is the union of it and its subtypes, so a subtype's name, ProfilePage's
    // for one, satisfies it: the row needs a name that is no type at all.
    expectTypeOf({
      '@context': CONTEXT,
      // @ts-expect-error: Persn is no schema.org type (TS2322)
      '@type': 'Persn',
      name: 'A',
    } satisfies WithContext<WebPage>).not.toBeNever();
  });
});

const THIS_FILE = fileURLToPath(import.meta.url);
const MODULE = join(dirname(THIS_FILE), '..', 'structured-data.ts');
const WEB_DIR = join(dirname(THIS_FILE), '..', '..', '..');

/** Each builder and the schema-dts type its literal must satisfy. */
const BUILDERS = {
  person: 'WithContext<Person>',
  website: 'WithContext<WebSite>',
  webPage: 'WithContext<WebPage>',
  profilePage: 'WithContext<ProfilePage>',
  techArticle: 'WithContext<TechArticle>',
  breadcrumbList: 'WithContext<BreadcrumbList>',
};

describe('the gate in lib/structured-data.ts', () => {
  const tree = ts.createSourceFile(
    MODULE,
    readFileSync(MODULE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const nodes: ts.Node[] = [];
  const collect = (node: ts.Node) => {
    nodes.push(node);
    ts.forEachChild(node, collect);
  };
  collect(tree);
  const unwrap = (expression: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(expression) ? unwrap(expression.expression) : expression;
  const at = (node: ts.Node) =>
    `line ${tree.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

  /** The type a literal is checked against: its own `satisfies`, or that of a literal it is in. */
  const checkedBy = (literal: ts.Node): string | undefined => {
    let node: ts.Node = literal;
    for (;;) {
      const parent = node.parent;
      if (ts.isParenthesizedExpression(parent) || ts.isArrayLiteralExpression(parent)) {
        node = parent;
      } else if (ts.isSatisfiesExpression(parent) && parent.expression === node) {
        return parent.type.getText(tree);
      } else if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
        node = parent.parent;
      } else {
        return undefined;
      }
    }
  };

  it('has each builder return its literal through satisfies WithContext<its type>', () => {
    // Every exported function that returns an object literal is a builder, so a new one without a
    // `satisfies` shows up here as well as a builder that lost its own.
    const builders: Record<string, string> = {};
    for (const node of nodes) {
      if (!ts.isReturnStatement(node) || node.expression === undefined) continue;
      const returned = unwrap(node.expression);
      const literal = ts.isSatisfiesExpression(returned) ? unwrap(returned.expression) : returned;
      if (!ts.isObjectLiteralExpression(literal)) continue;
      const fn = ts.findAncestor(node, ts.isFunctionDeclaration);
      if (fn?.name === undefined) continue;
      builders[fn.name.text] = ts.isSatisfiesExpression(returned)
        ? returned.type.getText(tree)
        : `no satisfies (${at(node)})`;
    }
    expect(builders).toEqual(BUILDERS);
  });

  it("has every literal with an @type checked by a satisfies, its own or its node's", () => {
    const unchecked = nodes
      .filter(ts.isObjectLiteralExpression)
      .filter((literal) =>
        literal.properties.some(
          (property) =>
            ts.isPropertyAssignment(property) &&
            ts.isStringLiteral(property.name) &&
            property.name.text === '@type',
        ),
      )
      .filter((literal) => checkedBy(literal) === undefined)
      .map(at);
    expect(unchecked).toEqual([]);
  });

  it("has every conditional spread's object checked as SpreadPredicates", () => {
    const spreads = nodes.filter(ts.isSpreadAssignment);
    expect(spreads.length).toBeGreaterThan(0);
    const unchecked = spreads
      .filter((spread) => {
        const expression = unwrap(spread.expression);
        if (!ts.isBinaryExpression(expression)) return true;
        const added = unwrap(expression.right);
        return !(
          expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
          ts.isSatisfiesExpression(added) &&
          added.type.getText(tree).startsWith('SpreadPredicates<')
        );
      })
      .map(at);
    expect(unchecked).toEqual([]);
  });
});

describe('this file', () => {
  it('is among the files pnpm typecheck checks, or its type rows check nothing', () => {
    const { config, error } = ts.readConfigFile(join(WEB_DIR, 'tsconfig.json'), ts.sys.readFile);
    expect(error).toBeUndefined();
    const { fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, WEB_DIR);
    expect(fileNames).toContain(THIS_FILE);
  });
});
