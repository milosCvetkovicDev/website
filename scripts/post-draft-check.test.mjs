// Tests for the publish check. Run with `pnpm test:scripts` (node:test, no dependency).
//
// The cases that matter are the ones where a naive comparison passes a changed post: a number or a
// word changed, a block dropped, kept bold that the twin escapes and the canonical form unescapes
// again, a link, code span or heading that the entry flattened into plain text, block syntax inside
// a list item or quote that flattens to the same text on both sides, an escape slipped into inline
// code, a `---` inside a code block taken for the footer rule, and a missing disclosure line.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FOOTER_LINES, check, differences, lineDiff } from './post-draft-check.mjs';

const ORIGIN = 'https://miloscvetkovic.dev';
const TITLE = 'Where the tokens go: one week';
const SUMMARY = 'A fixture for the publish check, long enough to be a summary, with a colon: here.';

/** @param {string[]} lines */
const md = (lines) => `${lines.join('\n')}\n`;

/** The front matter, as the writing room writes it; the title quoted because it holds a colon. */
const FRONT = [
  '---',
  `title: "${TITLE}"`,
  'slug: where-the-tokens-go',
  `description: ${SUMMARY}`,
  'date: 2026-10-06',
  '---',
  '',
];

/** The approved body, as a draft writes it. Its first line is line 8 of the draft. */
const BODY = [
  'A paragraph with `inline code`, a [link to the work page](/work) and 1,234 tokens.',
  '',
  '## Results',
  '',
  'Table: Tokens per day',
  '',
  '| Day | Tokens | Cost |',
  '| --- | ---: | --- |',
  '| Monday | 1,234 | $0.10 |',
  '',
  '- First item',
  '- Second item',
  '',
  '```yaml',
  'key: value',
  '---',
  'other: value',
  '```',
  '',
  '> A quote.',
];

/** The same body as `postToMarkdown` serves it. */
const SERVED = [
  `A paragraph with \`inline code\`, a [link to the work page](${ORIGIN}/work) and 1,234 tokens.`,
  ...BODY.slice(1, 7),
  '| --- | --- | --- |',
  ...BODY.slice(8),
];

/**
 * A twin as `postToMarkdown` writes it.
 * @param {{ body?: string[], kind?: 'own' | 'jev', title?: string, summary?: string }} [parts]
 */
function twin({ body = SERVED, kind = 'own', title = TITLE, summary = SUMMARY } = {}) {
  const footer =
    FOOTER_LINES[kind].length > 0
      ? ['', '---', ...FOOTER_LINES[kind].flatMap((line) => ['', line])]
      : [];
  return md([
    `# ${title}`,
    '',
    summary,
    '',
    `Source: ${ORIGIN}/blog/where-the-tokens-go`,
    '',
    '- Published: 2026-10-06',
    '- Updated: 2026-10-06',
    '',
    ...body,
    ...footer,
  ]);
}

/** @param {string[]} [body] @param {string[]} [front] */
const draft = (body = BODY, front = FRONT) => md([...front, ...body]);

/**
 * `lines` with the line at `index` replaced by `replacement`, which may be several lines or none.
 * @param {string[]} lines @param {number} index @param {...string} replacement
 */
const replace = (lines, index, ...replacement) => [
  ...lines.slice(0, index),
  ...replacement,
  ...lines.slice(index + 1),
];

/**
 * A `read` for `check()` over the given files, failing as `readFileSync` does on any other path.
 * @param {Record<string, string>} files
 */
const reader = (files) => (/** @type {string} */ path) => {
  if (!(path in files)) {
    throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: 'ENOENT' });
  }
  return files[path];
};

describe('the publish check', () => {
  it('finds nothing when the twin serves the approved draft', () => {
    assert.deepEqual(differences(draft(), twin(), 'own'), []);
  });

  it('finds nothing for a jev post whose twin ends with the disclosure line', () => {
    assert.deepEqual(differences(draft(), twin({ kind: 'jev' }), 'jev'), []);
  });

  describe('compares as equal what the serialiser changes on purpose', () => {
    /** @type {[string, string, string][]} */
    const cases = [
      [
        'the escapes the twin adds',
        draft(replace(BODY, 0, 'Brackets [like these] and C# stay text.')),
        twin({ body: replace(SERVED, 0, 'Brackets \\[like these\\] and C# stay text.') }),
      ],
      [
        'a paragraph wrapped over two lines',
        draft(
          replace(
            BODY,
            0,
            'A paragraph with `inline code`, a [link to the work page](/work)',
            'and 1,234 tokens.',
          ),
        ),
        twin(),
      ],
      [
        '* list markers',
        draft(replace(replace(BODY, 10, '* First item'), 11, '* Second item')),
        twin(),
      ],
      [
        '+ list markers',
        draft(replace(replace(BODY, 10, '+ First item'), 11, '+ Second item')),
        twin(),
      ],
      ['a list item wrapped over two lines', draft(replace(BODY, 10, '- First', '  item')), twin()],
      [
        'an ordered list numbered 1, 1',
        draft(replace(replace(BODY, 10, '1. First item'), 11, '1. Second item')),
        twin({ body: replace(replace(SERVED, 10, '1. First item'), 11, '2. Second item') }),
      ],
      [
        'padded cells and no outer pipes',
        draft(replace(replace(BODY, 6, 'Day    | Tokens | Cost'), 8, 'Monday | 1,234  | $0.10')),
        twin(),
      ],
      ['a Table: line directly above its table', draft(replace(BODY, 5)), twin()],
      [
        'a link and a code span wrapped onto the next line',
        draft(replace(BODY, 0, 'See [the', 'docs](https://example.com/docs) and `a *', 'b` here.')),
        twin({
          body: replace(SERVED, 0, 'See [the docs](https://example.com/docs) and `a * b` here.'),
        }),
      ],
      ['a ~~~ fence', draft(replace(replace(BODY, 13, '~~~yaml'), 17, '~~~')), twin()],
      [
        'a code fence of four backticks',
        draft(replace(replace(BODY, 13, '````yaml'), 17, '````')),
        twin(),
      ],
      ['CRLF line endings and a byte-order mark', `﻿${draft().replace(/\n/g, '\r\n')}`, twin()],
      ["an absolute link on the twin's origin", draft(replace(BODY, 0, SERVED[0])), twin()],
      [
        'a no-break space on both sides',
        draft(replace(BODY, 0, BODY[0].replace('1,234 tokens', '1,234 tokens'))),
        twin({ body: replace(SERVED, 0, SERVED[0].replace('1,234 tokens', '1,234 tokens')) }),
      ],
      [
        'a single-quoted title with a doubled quote, as Prettier writes YAML',
        draft(BODY, replace(FRONT, 1, "title: 'Where the tokens go: one week''s count'")),
        twin({ title: "Where the tokens go: one week's count" }),
      ],
    ];
    for (const [name, approved, served] of cases) {
      it(name, () => assert.deepEqual(differences(approved, served, 'own'), []));
    }
  });

  describe('reports a changed post', () => {
    /** @type {[string, string, string, 'own' | 'jev', RegExp][]} */
    const cases = [
      [
        'a changed number',
        draft(),
        twin({ body: replace(SERVED, 0, SERVED[0].replace('1,234', '1,243')) }),
        'own',
        /^\+ A paragraph .* 1,243 tokens\.$/m,
      ],
      [
        'a changed word',
        draft(),
        twin({ body: replace(SERVED, 19, '> A quotation.') }),
        'own',
        /^\+ > A quotation\.$/m,
      ],
      ['a dropped block', draft(), twin({ body: SERVED.slice(0, 18) }), 'own', /^- > A quote\.$/m],
      [
        'an added block',
        draft(),
        twin({ body: [...SERVED, '', 'An added paragraph.'] }),
        'own',
        /^\+ An added paragraph\.$/m,
      ],
      [
        'a changed table cell',
        draft(),
        twin({ body: replace(SERVED, 8, '| Monday | 1,234 | $0.01 |') }),
        'own',
        /^\+ \| Monday \| 1,234 \| \$0\.01 \|$/m,
      ],
      [
        'a link moved to another page',
        draft(),
        twin({ body: replace(SERVED, 0, SERVED[0].replace(`${ORIGIN}/work`, `${ORIGIN}/about`)) }),
        'own',
        /^\+ .*\]\(\/about\)/m,
      ],
      [
        'an escape slipped into inline code',
        draft(replace(BODY, 0, 'Call `snake_case` here.')),
        twin({ body: replace(SERVED, 0, 'Call `snake\\_case` here.') }),
        'own',
        /^\+ Call `snake\\_case` here\.$/m,
      ],
      [
        'a no-break space in the draft where the twin has a plain space',
        draft(replace(BODY, 0, BODY[0].replace('1,234 tokens', '1,234 tokens'))),
        twin(),
        'own',
        /^- A paragraph .* 1,234 tokens\.$/m,
      ],
      [
        'a no-break space in the body, pointed at under its line',
        draft(replace(BODY, 0, BODY[0].replace('1,234 tokens', '1,234\u00A0tokens'))),
        twin(),
        'own',
        /^- A paragraph .* 1,234\u00A0tokens\.\n\? +\^ U\+00A0\n\+ A paragraph .* 1,234 tokens\.$/m,
      ],
      [
        'a no-break space in the summary, pointed at under its line',
        draft(
          BODY,
          replace(FRONT, 3, `description: ${SUMMARY.replace('a summary', 'a\u00A0summary')}`),
        ),
        twin(),
        'own',
        /^the summary differs \(- draft, \+ twin\):\n- .* a\u00A0summary, .*\n\? +\^ U\+00A0\n\+ /m,
      ],
      [
        'kept bold, which the comparison alone would pass',
        draft(replace(BODY, 0, 'Some **bold** text.')),
        twin({ body: replace(SERVED, 0, 'Some \\*\\*bold\\*\\* text.') }),
        'own',
        /^line 8: an emphasis marker \*/m,
      ],
      [
        "a slug that is not the twin's",
        draft(BODY, replace(FRONT, 2, 'slug: where-the-tokens-went')),
        twin(),
        'own',
        /^the slug differs \(- draft, \+ twin\):\n- where-the-tokens-went\n\+ where-the-tokens-go$/m,
      ],
      [
        'a changed title',
        draft(),
        twin({ title: 'Where the tokens went: one week' }),
        'own',
        /^the title differs/m,
      ],
      [
        'a changed summary',
        draft(),
        twin({ summary: 'A different summary for the publish check, long enough to be one.' }),
        'own',
        /^the summary differs/m,
      ],
      [
        'a jev post without its disclosure line',
        draft(),
        twin(),
        'jev',
        /^the footer is \[\], but a post of kind jev ends with \["I have no relationship with TypeSafe\."\]$/m,
      ],
      [
        'an own post with a disclosure line',
        draft(),
        twin({ kind: 'jev' }),
        'own',
        /^the footer is \["I have/m,
      ],
    ];
    for (const [name, approved, served, kind, pattern] of cases) {
      it(name, () => {
        const problems = differences(approved, served, kind);
        assert.ok(problems.length > 0, `${name} passed`);
        assert.match(problems.join('\n\n'), pattern);
      });
    }
  });

  describe('exits 1 when the entry flattened syntax into text or changed a block kind', () => {
    /** @type {[string, string[], string[], RegExp][]} */
    const cases = [
      [
        'a link written as plain text',
        replace(BODY, 0, 'See [the work page](/work).'),
        replace(SERVED, 0, 'See \\[the work page\\](/work).'),
        /^- See \[the work page\]\(\/work\)\.\n\+ See \\\[the work page\\\]\(\/work\)\.$/m,
      ],
      [
        'a code span written as plain text',
        replace(BODY, 0, 'Run `foo` now.'),
        replace(SERVED, 0, 'Run \\`foo\\` now.'),
        /^- Run `foo` now\.\n\+ Run \\`foo\\` now\.$/m,
      ],
      [
        'a heading written as a paragraph',
        BODY,
        replace(SERVED, 2, '\\## Results'),
        /^- heading 2:\n\+ paragraph:\n {2}## Results$/m,
      ],
      [
        'a quote written as a paragraph',
        BODY,
        replace(SERVED, 19, '\\> A quote.'),
        /^- quote:\n\+ paragraph:\n {2}> A quote\.$/m,
      ],
      [
        'a one-item list written as a paragraph',
        replace(BODY, 11),
        replace(replace(SERVED, 11), 10, '\\- First item'),
        /^- list bullet:\n\+ paragraph:\n {2}- First item$/m,
      ],
    ];
    for (const [name, approved, served, pattern] of cases) {
      it(name, () => {
        const files = { 'draft.md': draft(approved), 'twin.md': twin({ body: served }) };
        const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
        assert.equal(status, 1);
        assert.match(output, /^the body differs/m);
        assert.match(output, pattern);
      });
    }
  });

  describe('exits 1 on block syntax in a list item or quote, which flattens to equal text', () => {
    // The entry holds the syntax as text and the twin escapes its first mark, so the bodies agree
    // and only the refusal catches it.
    /** @type {[string, string[], string[], RegExp][]} */
    const cases = [
      [
        'a heading inside a quote',
        ['> ## Results'],
        ['> \\## Results'],
        /^line 29: a heading inside a quote$/m,
      ],
      [
        'a list inside a quote',
        ['> - An item'],
        ['> \\- An item'],
        /^line 29: a list inside a quote$/m,
      ],
      [
        'an ordered list inside a quote',
        ['> 1. A step'],
        ['> 1\\. A step'],
        /^line 29: a list inside a quote$/m,
      ],
      [
        'a quote inside a quote',
        ['> > Nested.'],
        ['> \\> Nested.'],
        /^line 29: a quote inside a quote$/m,
      ],
      [
        'a code fence inside a quote',
        ['> ```', '> code', '> ```'],
        ['> `code`'],
        /^line 29: a code fence inside a quote$/m,
      ],
      [
        'indented code inside a quote',
        ['>     code'],
        ['> code'],
        /^line 29: indented code inside a quote$/m,
      ],
      [
        'a --- rule inside a quote',
        ['> ---'],
        ['> \\---'],
        /^line 29: a --- rule inside a quote$/m,
      ],
      [
        'a setext underline inside a quote',
        ['> Results', '> ---'],
        ['> Results ---'],
        /^line 30: a setext heading underline inside a quote$/m,
      ],
      [
        'a table inside a quote',
        ['> | Day | Tokens |', '> | --- | --- |'],
        ['> \\| Day \\| Tokens \\| \\| --- \\| --- \\|'],
        /^line 30: a table inside a quote$/m,
      ],
      [
        'a heading inside a list item',
        ['- ## Results'],
        ['- \\## Results'],
        /^line 29: a heading inside a list item$/m,
      ],
      [
        'a quote inside a list item',
        ['- > Quoted.'],
        ['- \\> Quoted.'],
        /^line 29: a quote inside a list item$/m,
      ],
      [
        'a list inside a list item',
        ['- - Inner'],
        ['- \\- Inner'],
        /^line 29: a list inside a list item$/m,
      ],
      [
        'indented code inside a list item',
        ['-     code'],
        ['- code'],
        /^line 29: indented code inside a list item$/m,
      ],
      [
        'a --- rule inside an ordered item',
        ['1. ---'],
        ['1. \\---'],
        /^line 29: a --- rule inside a list item$/m,
      ],
    ];
    for (const [name, approved, served, pattern] of cases) {
      it(name, () => {
        const files = {
          'draft.md': draft([...BODY, '', ...approved]),
          'twin.md': twin({ body: [...SERVED, '', ...served] }),
        };
        const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
        assert.equal(status, 1);
        assert.match(output, pattern);
        assert.doesNotMatch(output, /^the body differs/m);
      });
    }

    it('reads a later quote line as CommonMark does: only an item from 1 opens a list', () => {
      const approved = draft([...BODY, '', '> It was cold in', '> 1995. Then it was not.']);
      const served = twin({ body: [...SERVED, '', '> It was cold in 1995. Then it was not.'] });
      assert.deepEqual(differences(approved, served, 'own'), []);
    });

    for (const [marker, indent] of [
      ['-', '  '],
      ['1.', '   '],
    ]) {
      it(`reads a later line of a ${marker} item as CommonMark does: only an item from 1 interrupts`, () => {
        // Indented to the item's text, the line is inside the item, where `1995.` cannot interrupt
        // its paragraph, so the line continues it.
        const lines = [`${marker} It was cold in`, `${indent}1995. It was a good year.`];
        const served = twin({
          body: [...SERVED, '', `${marker} It was cold in 1995. It was a good year.`],
        });
        assert.deepEqual(differences(draft([...BODY, '', ...lines]), served, 'own'), []);
      });
    }

    it("starts the next item at a marker left of the item's text, whatever its number", () => {
      const approved = draft([...BODY, '', '1. It was cold in', '1995. It was a good year.']);
      const served = twin({ body: [...SERVED, '', '1. It was cold in', '2. It was a good year.'] });
      assert.deepEqual(differences(approved, served, 'own'), []);
    });

    /** @type {[string, string[], string[], RegExp][]} */
    const interrupted = [
      ['a list item', ['- It was', '  01. b'], ['- It was 01. b'], /^line 30: a nested list$/m],
      ['a quote', ['> It was', '> 01. b'], ['> It was 01. b'], /^line 30: a list inside a quote$/m],
      [
        'a paragraph',
        ['It was', '01. b'],
        ['It was 01. b'],
        /^line 30: start each block after a blank line$/m,
      ],
    ];
    for (const [where, approved, served, pattern] of interrupted) {
      it(`reads 01. in ${where} as CommonMark does: an item from 1, which interrupts it`, () => {
        const files = {
          'draft.md': draft([...BODY, '', ...approved]),
          'twin.md': twin({ body: [...SERVED, '', ...served] }),
        };
        const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
        assert.equal(status, 1);
        assert.match(output, pattern);
      });
    }

    it('reports a whole-line --- rule once, as a rule, not as a list item holding one', () => {
      const problems = differences(draft([...BODY, '', '- ---']), twin(), 'own');
      assert.deepEqual(
        problems.filter((problem) => problem.startsWith('line 29:')),
        ["line 29: a --- rule; the site adds the footer's rule itself"],
      );
    });
  });

  describe('reports syntax the post format refuses, in the draft as written', () => {
    /** @type {[string, string | string[], RegExp][]} */
    const cases = [
      ['an image', '![A chart](https://example.com/chart.png)', /an image/],
      ['raw HTML', 'Some <em>markup</em>.', /raw HTML/],
      ['an HTML comment', '<!-- a note -->', /an HTML comment/],
      ['an autolink', 'See <https://example.com>.', /an autolink/],
      ['a bare URL', 'See https://example.com for more.', /a bare URL/],
      ['a bare www. address', 'See www.example.com for more.', /^line 29: a bare URL/],
      [
        'a bare www. address in brackets',
        'See [www.example.com] for more.',
        /^line 29: a bare URL/,
      ],
      ['a bare email address', 'Write to name@example.com today.', /^line 29: an email address/],
      [
        "a link inside a link's text",
        'See [the [work](/work) page](/work).',
        /^line 29: a link inside a link's text$/,
      ],
      [
        "code in a link's text",
        'See [the `--kind` flag](/work).',
        /^line 29: link text is plain text: no code$/,
      ],
      ['an entity reference', 'Fish &amp; chips, &#169; and &#x2014;.', /an entity reference/],
      ['a footnote', 'A claim.[^1]', /a footnote/],
      ['a reference-style link', 'See [the docs][docs].', /a reference-style link/],
      [
        'a link reference definition in a quote',
        '> [docs]: /work',
        /^line 29: a reference-style link definition/,
      ],
      [
        'a link reference definition in a list item',
        '- [docs]: /work',
        /^line 29: a reference-style link definition/,
      ],
      [
        'a link reference definition in a quote in an ordered item',
        '1. > [docs]: /work',
        /^line 29: a reference-style link definition/,
      ],
      ['a level-1 heading', '# A second title', /a level-1 heading/],
      ['a level-4 heading', '#### Too deep', /a heading below level 3/],
      ['a setext heading', ['A heading', '---'], /a setext heading underline/],
      ['a --- rule', ['---'], /a --- rule/],
      ['a nested list', ['- An item', '  - A nested item'], /a nested list/],
      ['a nested ordered list', ['1. An item', '   1. A nested item'], /^line 30: a nested list$/],
      ['an ordered list that starts at 3', ['3. Third', '4. Fourth'], /starts at 3/],
      ['a quote of two paragraphs', ['> One.', '>', '> Two.'], /an empty quote line/],
      ['a hard line break', ['A line that breaks  ', 'here.'], /a hard line break/],
      ['a line indented with a tab', '\tIndented text.', /a line indented with a tab/],
      ['a tab inside a line', 'Tokens:\t1,234 a day.', /^line 29: a tab; /],
      [
        'a tab after a list marker, which CommonMark reads as a list',
        '-\tAn item',
        /^line 29: a tab; /,
      ],
      ['a tab in a code span', 'Run `make\tall` now.', /^line 29: a tab; /],
      ['italics with underscores', 'Some _italic_ text.', /an emphasis marker _/],
      ['strikethrough', 'Some ~~struck~~ text.', /strikethrough/],
      [
        'a second paragraph in a list item',
        ['- An item', '', '  A second paragraph.'],
        /an indented block/,
      ],
      [
        'a heading straight after a paragraph line',
        ['A paragraph line.', '## A heading'],
        /^line 30: start each block after a blank line$/,
      ],
      [
        'a list straight after a paragraph line',
        ['A paragraph line.', '- An item'],
        /^line 30: start each block after a blank line$/,
      ],
      [
        'a code span in a table cell',
        ['| Flag | Effect |', '| --- | --- |', '| `--kind` | Picks the footer |'],
        /^line 31: a table's caption and cells are plain text: no code or links$/,
      ],
      [
        'a link in a table cell',
        ['| Page | Note |', '| --- | --- |', '| [Work](/work) | The case studies |'],
        /^line 31: a table's caption and cells are plain text: no code or links$/,
      ],
      [
        'code in a table caption',
        [
          'Table: The `--kind` flag',
          '| Flag | Effect |',
          '| --- | --- |',
          '| kind | Picks the footer |',
        ],
        /^line 29: a table's caption and cells are plain text: no code or links$/,
      ],
      [
        'code in a heading',
        '## The `--kind` flag',
        /^line 29: a heading is plain text: no code or links$/,
      ],
    ];
    for (const [name, lines, pattern] of cases) {
      it(name, () => {
        const problems = differences(draft([...BODY, '', ...[lines].flat()]), twin(), 'own');
        assert.ok(
          problems.some((problem) => pattern.test(problem)),
          problems.join('\n'),
        );
      });
    }

    it('accepts the same characters escaped, inside code, or inside a word', () => {
      const approved = draft([
        ...BODY,
        '',
        'Escaped \\* and \\_, then `<b>`, `**` and `_x_`, and snake_case.',
      ]);
      const served = twin({
        body: [...SERVED, '', 'Escaped \\* and \\_, then `<b>`, `**` and `_x_`, and snake\\_case.'],
      });
      assert.deepEqual(differences(approved, served, 'own'), []);
    });

    it("accepts brackets and an escape in a link's text that make no link of their own", () => {
      const approved = draft([...BODY, '', 'See [a [b]\\!(c) d](/work).']);
      const served = twin({ body: [...SERVED, '', `See [a \\[b\\]!(c) d](${ORIGIN}/work).`] });
      assert.deepEqual(differences(approved, served, 'own'), []);
    });

    for (const [form, approved, served] of [
      [
        'a title',
        'See [the docs](/work "Work page") now.',
        'See \\[the docs\\](/work "Work page") now.',
      ],
      [
        'spaces around its destination',
        'See [the docs]( /work ) now.',
        'See \\[the docs\\]( /work ) now.',
      ],
    ]) {
      it(`reports a link with ${form}, which the twin serves as text`, () => {
        const files = {
          'draft.md': draft([...BODY, '', approved]),
          'twin.md': twin({ body: [...SERVED, '', served] }),
        };
        const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
        assert.equal(status, 1);
        assert.match(output, /^line 29: a link title or spaces around a link's destination; /m);
      });
    }

    for (const [approved, served] of [
      ['- [ ] write the post', '- \\[ \\] write the post'],
      ['- [x] done', '- \\[x\\] done'],
      ['1. [X] done', '1. \\[X\\] done'],
    ]) {
      it(`reports a task list item, which GFM renders as a checkbox: ${approved}`, () => {
        const files = {
          'draft.md': draft([...BODY, '', approved]),
          'twin.md': twin({ body: [...SERVED, '', served] }),
        };
        const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
        assert.equal(status, 1);
        assert.match(output, /^line 29: a task list item, which GFM renders as a checkbox; /m);
      });
    }

    it('accepts escaped brackets before a parenthesis, which make no link', () => {
      const line = 'Brackets \\[like these\\](/work "Work page") stay text.';
      const served = twin({ body: [...SERVED, '', line] });
      assert.deepEqual(differences(draft([...BODY, '', line]), served, 'own'), []);
    });

    it('reports an email autolink once, whatever its address starts with', () => {
      for (const address of ['name@example.com', '2026@example.com']) {
        const problems = differences(draft([...BODY, '', `Write to <${address}>.`]), twin(), 'own');
        assert.deepEqual(
          problems.filter((problem) => problem.startsWith('line 29:')),
          ['line 29: raw HTML, an HTML comment or an autolink'],
          address,
        );
      }
    });

    it('accepts an email address as a link or as code', () => {
      const line = 'Write to [name@example.com](mailto:name@example.com) or `name@example.com`.';
      const served = twin({ body: [...SERVED, '', line] });
      assert.deepEqual(differences(draft([...BODY, '', line]), served, 'own'), []);
    });

    it('reports a tab in the front matter by its line', () => {
      const front = replace(FRONT, 1, `title: "Where the tokens go:\tone week"`);
      const problems = differences(draft(BODY, front), twin(), 'own');
      assert.ok(
        problems.some((problem) => /^line 2: a tab in the front matter; /.test(problem)),
        problems.join('\n'),
      );
    });

    it('reports a blank line that holds a tab, as it does in the front matter', () => {
      const files = {
        'draft.md': draft([...BODY, '', 'One.', ' \t', 'Two.']),
        'twin.md': twin({ body: [...SERVED, '', 'One.', '', 'Two.'] }),
      };
      const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
      assert.equal(status, 1);
      assert.match(output, /^line 30: a tab on a blank line; /m);
    });

    it('accepts a blank line that holds a tab inside a code fence', () => {
      const code = ['```make', 'all:', '\t', '\tnode build.mjs', '```'];
      const served = twin({ body: [...SERVED, '', ...code] });
      assert.deepEqual(differences(draft([...BODY, '', ...code]), served, 'own'), []);
    });

    it('accepts a tab inside a code fence, where it is code', () => {
      const code = ['```make', 'all:', '\tnode build.mjs', '```'];
      const served = twin({ body: [...SERVED, '', ...code] });
      assert.deepEqual(differences(draft([...BODY, '', ...code]), served, 'own'), []);
    });
  });
});

describe('lineDiff()', () => {
  it('points at a no-break space, which prints like a space, and names it', () => {
    assert.equal(
      lineDiff(['1,234\u00A0tokens'], ['1,234 tokens']),
      ['- 1,234\u00A0tokens', `? ${' '.repeat(5)}^ U+00A0`, '+ 1,234 tokens'].join('\n'),
    );
  });

  it('keeps a tab in its guide line, so the mark stays under its character', () => {
    assert.equal(
      lineDiff(['\tx\u2009y\u00A0z'], ['\tx y z']),
      ['- \tx\u2009y\u00A0z', '? \t ^ ^ U+2009, U+00A0', '+ \tx y z'].join('\n'),
    );
  });
});

describe('check()', () => {
  const files = { 'draft.md': draft(), 'twin.md': twin({ kind: 'jev' }) };

  it('exits 0 quietly when the two agree', () => {
    assert.deepEqual(check(['--kind', 'jev', 'draft.md', 'twin.md'], reader(files)), {
      status: 0,
      output: '',
    });
  });

  it('exits 1 and prints each difference', () => {
    const { status, output } = check(['--kind', 'own', 'draft.md', 'twin.md'], reader(files));
    assert.equal(status, 1);
    assert.match(output, /^the footer is/m);
  });

  /** @type {[string, string[], Record<string, string>, RegExp][]} */
  const cannotRun = [
    ['no --kind', ['draft.md', 'twin.md'], files, /^usage:/],
    ['a kind that is not own or jev', ['--kind', 'Jev', 'draft.md', 'twin.md'], files, /^usage:/],
    ['one file', ['--kind', 'own', 'draft.md'], files, /^usage:/],
    ['a missing file', ['--kind', 'own', 'draft.md', 'gone.md'], files, /ENOENT/],
    [
      'a draft with no front matter',
      ['--kind', 'own', 'draft.md', 'twin.md'],
      { ...files, 'draft.md': md(BODY) },
      /front matter/,
    ],
    [
      'front matter without a description',
      ['--kind', 'own', 'draft.md', 'twin.md'],
      {
        ...files,
        'draft.md': draft(
          BODY,
          FRONT.filter((line) => !line.startsWith('description:')),
        ),
      },
      /needs a title, a slug and a description/,
    ],
    [
      'a twin that does not open with its title',
      ['--kind', 'own', 'draft.md', 'twin.md'],
      { ...files, 'twin.md': md(SERVED) },
      /does not open with a # title/,
    ],
  ];
  for (const [name, argv, given, pattern] of cannotRun) {
    it(`exits 2 for ${name}`, () => {
      const { status, output } = check(argv, reader(given));
      assert.equal(status, 2);
      assert.match(output, pattern);
    });
  }

  it('exits 2, not 1, for an error that is not a difference: a directory as the draft', () => {
    const dir = mkdtempSync(join(tmpdir(), 'post-draft-check-'));
    try {
      writeFileSync(join(dir, 'twin.md'), twin());
      const { status, output } = check(['--kind', 'own', dir, join(dir, 'twin.md')]);
      assert.equal(status, 2);
      assert.match(output, /^post-draft-check: EISDIR/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the command', () => {
  it("exits with check()'s status when run with node", () => {
    const dir = mkdtempSync(join(tmpdir(), 'post-draft-check-'));
    try {
      writeFileSync(join(dir, 'draft.md'), draft());
      writeFileSync(join(dir, 'twin.md'), twin());
      const script = fileURLToPath(new URL('./post-draft-check.mjs', import.meta.url));
      /** @param {string[]} args */
      const run = (...args) =>
        spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' }).status;
      assert.equal(run('--kind', 'own', join(dir, 'draft.md'), join(dir, 'twin.md')), 0);
      assert.equal(run('--kind', 'jev', join(dir, 'draft.md'), join(dir, 'twin.md')), 1);
      assert.equal(run('--kind', 'own', dir, join(dir, 'twin.md')), 2);
      assert.equal(run(), 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
