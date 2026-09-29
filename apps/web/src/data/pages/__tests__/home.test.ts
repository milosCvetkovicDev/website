/**
 * The home page record: what it holds, what its twin and its head make of it, and what it imports.
 * Pure data and one module's syntax tree, so no jsdom window. The phases that render the record's
 * closing pairs are tested in `components/animated-hero/__tests__/story-phases.test.tsx`.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { metadata } from '@/app/page';
import { pageToMarkdown } from '@/lib/serialise';
import { homePage, storyClosings } from '../home';

describe('the home page record', () => {
  it.each(Object.entries(storyClosings))(
    'the %s closing pair has a headline and a line with words in them',
    (_, { heading, paragraphs }) => {
      // An empty headline renders an empty h2 on `/` (an axe failure) and a bare `##` in the twin,
      // and a render test comparing '' with '' would not notice.
      expect(heading.trim()).not.toBe('');
      for (const paragraph of paragraphs) expect(paragraph.trim()).not.toBe('');
    },
  );

  it("the twin carries every closing pair, each headline a heading with its line under it, in the story's order", () => {
    const twin = pageToMarkdown(homePage);
    let from = 0;
    for (const { heading, paragraphs } of Object.values(storyClosings)) {
      for (const block of [`## ${heading}`, ...paragraphs]) {
        const at = twin.indexOf(`\n\n${block}\n`, from);
        expect(at, `the twin carries "${block}" after what comes before it`).toBeGreaterThan(-1);
        from = at + block.length;
      }
    }
  });

  it("the page's head reads its title, description and canonical from the record", () => {
    // An absolute title: a plain string would go through the root template.
    expect(metadata.title).toEqual({ absolute: homePage.title.absolute });
    expect(metadata.description).toBe(homePage.summary);
    expect(metadata.alternates?.canonical).toBe('/');
    expect(metadata.openGraph?.title).toBe(homePage.title.absolute);
    expect(metadata.openGraph?.description).toBe(homePage.summary);
  });

  it('imports nothing at runtime, because the client sections import it', () => {
    // Whatever the record imports ships in the home page's client chunk with it. Read from the syntax
    // tree rather than the text, so copy that mentions `from "..."` is not taken for an import.
    const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'home.ts');
    const tree = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    const typeOnly: string[] = [];
    const runtime: string[] = [];
    const visit = (node: ts.Node) => {
      const text = () => node.getText(tree);
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        // `import type { … }` is erased. `import { type X }` is not: it leaves an import behind.
        (clause?.isTypeOnly ? typeOnly : runtime).push(text());
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        (node.isTypeOnly ? typeOnly : runtime).push(text());
      } else if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      ) {
        runtime.push(text());
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(runtime).toEqual([]);
    // And the check reads the module it means to: the type import it does have is found.
    expect(typeOnly).toEqual(["import type { PageRecord, ProseSection } from './types';"]);
  });
});
