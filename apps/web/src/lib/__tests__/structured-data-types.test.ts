/**
 * The type gate on the JSON-LD payloads (#57 AC 8, ADR 0031).
 *
 * `lib/structured-data.ts` ends every builder's object with `satisfies WithContext<T>`, `T` being
 * its schema-dts type, so a misspelled predicate fails `pnpm typecheck` on the line that wrote it.
 * A conditional spread is not checked by the object around it, so each spread's own object carries
 * a `satisfies Partial<…Leaf>`, and each ListItem a trail maps to carries `satisfies ListItem`.
 *
 * Everything here is checked by `pnpm typecheck` (the web tsconfig includes every `.ts` file),
 * not by `pnpm test`, where the types compile away and these rows pass whatever they hold. Each
 * `@ts-expect-error` below must meet an error, or tsc fails on the unused directive. So the rows
 * are a canary for schema-dts itself: a release that stops checking a misspelled predicate on a
 * node, in a nested object, in a list item or in a spread's object, or stops checking `@type`,
 * fails the typecheck on the row that lost its error. The `toExtend` rows hold every builder's
 * return type to its node type, which is also what lets `components/json-ld.tsx` render it.
 *
 * What it does not guard: a builder losing its `satisfies`. That builder's misspellings then
 * compile. Its `toExtend` row fails only by accident, because the `@type` widens to `string`
 * without the `satisfies`; a `@type` kept literal some other way (`as const`) passes the row with
 * any misspelling beside it, since an object with extra keys still extends its node type. The
 * `satisfies` on each builder is the gate; this file shows that schema-dts still gives it teeth.
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
import { describe, expectTypeOf, it } from 'vitest';
import {
  breadcrumbList,
  person,
  profilePage,
  techArticle,
  webPage,
  website,
  type JsonLdNode,
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
      // @ts-expect-error: keywordz is not a TechArticle predicate (TS2561)
      ...(keywords !== undefined && ({ keywordz: keywords } satisfies Partial<TechArticleLeaf>)),
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
