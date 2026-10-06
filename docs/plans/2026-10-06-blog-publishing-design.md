# Blog publishing — design

**Date:** 2026-10-06
**Status:** Accepted (2026-10-06)
**Branch:** one per slice, listed under Slices; this design ships with the first,
`docs/blog-publishing-design`
**Related:** #61, [ADR 0028](../adr/0028-blog-posts-as-typed-data.md),
[ADR 0033](../adr/0033-blog-posts-drafted-with-claude.md),
[the blog engine design](2026-09-28-blog-engine-design.md), ADR 0012 (how a decision is superseded)

## Context

The blog engine of #61 is mostly on `main`: the typed post model (#171), the post pages (#215), the
`/blog` list with its indexing switch (#219) and the Atom feed (#220). Its Markdown twins (61e) and
post JSON-LD (61f) are still open, and `posts` is empty.

Three things have changed since the engine was designed.

- **How posts are written.** The owner now writes posts with Claude, in a private writing room
  outside this repository: Claude drafts each article from the owner's own explanation of the
  finding, every fact is checked against its source, and the owner approves every line. An approved
  article reaches this repository only through a pull request. ADR 0028's decision 5, "No agent
  writes post prose, drafts included", says the opposite, and stays in force until a record
  supersedes it.
- **Disclosure.** Some articles review TypeSafe's Jev model. Each of those ends with the owner's
  line "I have no relationship with TypeSafe." It is the only footer line.
- **Numbers.** The planned articles rest on measured numbers, and the model has no table.

The approved article arrives as a Markdown file, `draft.md`, with front matter. Publishing turns it
into an entry in `apps/web/src/data/posts.ts`, and the published body must equal the approved one,
apart from the front matter and the footer line.

## Goals

1. An approved draft reaches `posts.ts` with its words unchanged, shown by a check that compares
   text mechanically, not by someone reading both.
2. A post that names Jev or TypeSafe cannot be published without the disclosure line.
3. A post can show results as a table, accessible and readable on a phone.
4. Publishing a post stays a data commit to `posts.ts` and `static-routes.ts` (ADR 0028, decision
   4).

## Non-goals

- Bold, italics, images, footnotes, raw HTML, or headings below level 3.
- Any change to the `/blog` list or its copy. Tags appear only on a post's social card until there
  are enough posts for tag pages; the list does not label Jev posts.
- A per-article line about how the post was written, or a page about it. The owner decided against
  both.
- Post JSON-LD. 61f stays in [the engine plan](2026-09-28-blog-engine-plan.md) and does not gate the
  first post.
- The writing room itself: its agents, its style check and its tracker live outside this repository.
  The writing room's own changes are tracked outside this repository.

## Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                         | Why                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | ADR 0033 supersedes ADR 0028. It states that posts are drafted with Claude from the owner's own explanation of each finding, every fact is checked against its source, and the owner approves every line; drafting happens outside this repository, and only an approved post reaches `posts.ts`, by pull request. It also records D2 to D5 and D8. ADR 0028's status becomes `Superseded by ADR-0033`, with the pointer line ADR 0012 requires. | ADR 0012 has no partial supersession: a changed decision supersedes its record. The pointer says that decision 5 and decision 1's list of block kinds no longer apply, and that the rest of ADR 0028 still applies.                                                                                                                                                                                         |
| D2  | Every post, draft or published, carries `kind: 'own' \| 'jev'`, required, with the values the writing room's tracker uses.                                                                                                                                                                                                                                                                                                                       | Publishing copies the value across unchanged, and a required field forces the choice for every post.                                                                                                                                                                                                                                                                                                        |
| D3  | `FOOTER_LINES`, beside `posts` in `posts.ts`, maps each kind to its lines: none for `own`, "I have no relationship with TypeSafe." for `jev`. The post page renders them as a `<footer>`, last inside `<article>`, above a top border, in `--muted` text; a kind with no lines renders no footer. The twin ends with them (D6). The feed carries summaries only, so no line appears there.                                                       | The line is set once, in data the twin and the page both read. Inside `<article>`, a reader that extracts the article keeps the disclosure. `--muted` follows ADR 0011: text is never dimmed with an opacity step.                                                                                                                                                                                          |
| D4  | `posts.test.ts` fails when any text of a published post names Jev or TypeSafe as a whole word (`/(?<![\p{L}\p{M}\p{N}_])(?:Jev\|TypeSafe)(?![\p{L}\p{M}\p{N}_])/u`: no letter, mark, digit or underscore of any script on either side) and its kind is not `jev`: the title, `metaTitle`, summary, tags, headings, inline text, link text, code, and a table's caption, columns and cells.                                                       | A published post that names Jev or TypeSafe as their owners write them cannot leave the flag out. The match is case-sensitive, so "typesafe" or "type-safe" in a post about TypeScript does not trip it, and neither does a surname such as Jevtić or Jevđević, whose `đ` an ASCII `\b` would take for a word edge. The cost: another casing ("JEV", "Typesafe") or a name joined to a digit is not caught. |
| D5  | A sixth block, `table`: `{ kind: 'table'; caption: string; columns: readonly string[]; rows: readonly (readonly [string, ...string[]])[] }`, plain-text cells only. `PostBody` renders it through `components/data-table.tsx`. `posts.test.ts` holds it to the serialiser's table rules: a caption, at least two columns, every row as wide as the columns, a row header in every row, no blank cell in a table of three or more columns.        | `DataTable` already gives a caption, row and column headers, and a stacked layout on a phone (#226). Cells stay plain because a pipe table in `draft.md` cannot express chips, leads, icons, code or links.                                                                                                                                                                                                 |
| D6  | 61e's `postToMarkdown(post)` writes the opening every twin shares (`# <title>`, the summary, the `Source:` line) and the post's dates, then `postBodyToMarkdown(body, slug)`, then, for a kind with lines, a `---` rule and each line. A table is a `Table: <caption>` line and a pipe table, the caption line always written.                                                                                                                   | One serialiser for the page's twin and the publish check. A post's table keeps its caption line even under a heading of the same words, so every table in a draft has one and the two sides compare line for line.                                                                                                                                                                                          |
| D7  | The post format below is the contract the writing room's publish mode reads. It lives in this document, and `.claude/rules/app-router-and-content.md` points to it.                                                                                                                                                                                                                                                                              | The publish mode already reads the post format from this repository's `docs/`. One copy, versioned with the code that enforces it.                                                                                                                                                                                                                                                                          |
| D8  | `scripts/post-draft-check.mjs --kind own\|jev <draft.md> <twin.md>` compares an approved draft with the served twin (the publish check below). Plain Node, no dependencies, with a `node:test` suite.                                                                                                                                                                                                                                            | Chosen on 2026-10-06: an agent writes the `posts.ts` entry, and a deterministic check proves it. No Markdown parser is added anywhere.                                                                                                                                                                                                                                                                      |
| D9  | A post's `publishedAt` and `updatedAt`, and `STATIC_ROUTE_UPDATED['/blog']`, are the day its pull request opens, as a UTC day (`date -u +%F`). If it merges on a later day, a last commit before the merge moves all three to that day.                                                                                                                                                                                                          | `posts.test.ts` refuses a date in the future, so the merge day cannot be written in advance, and the dates must say when the post went live. It counts a day as begun once it has begun in UTC+14, so the UTC day always passes, whatever zone the machine is in.                                                                                                                                           |
| D10 | A publish pull request uses the branch `feat/blog-<nn>-<slug>` and the title `feat(blog): publish <nn> <slug>`. Only the owner merges it.                                                                                                                                                                                                                                                                                                        | The branch prefix follows the repository's convention. The writing room's status mode finds the merged pull request by that title.                                                                                                                                                                                                                                                                          |

## The post format

This is what an approved `draft.md` may hold, and where each part goes.

### Front matter

Flat `key: value` lines between two `---` lines; a value may be double-quoted; `tags` is a list in
brackets, `[a, b]`.

| `draft.md`    | `posts.ts`  | Rule                                                                                                                                                   |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`       | `title`     | The page's `h1`.                                                                                                                                       |
| `metaTitle`   | `metaTitle` | Required when `title` plus ` \| Milos Cvetkovic` would pass 60 characters. The writer leaves it out otherwise; nothing in this repository checks that. |
| `slug`        | `slug`      | Lowercase words joined by hyphens. Never changes once published. The check compares it with the last path segment of the twin's `Source:` URL.         |
| `description` | `summary`   | 50 to 300 characters.                                                                                                                                  |
| `tags`        | `tags`      | Optional; none blank, none repeated. The twin does not carry them, so the publish pull request quotes them beside the entry's.                         |
| `date`        | (none)      | Not used: the dates follow D9.                                                                                                                         |
| (tracker)     | `kind`      | Read from the writing room's tracker, not from the front matter (D2).                                                                                  |

The owner approves the front matter with the article. The check compares the slug, the title and
the summary as well as the body. `metaTitle` and `tags`, which the twin does not carry, are copied as
written, and the pull request's description quotes each beside the entry's.

### Body

Blocks are separated by a blank line. A paragraph or a list item may wrap onto more lines, but a
line that starts a heading, a list, a quote, a fence or a table row straight after a paragraph's line
is refused: start each block after a blank line.

| `draft.md`                                                     | Post block or piece        |
| -------------------------------------------------------------- | -------------------------- |
| `## ` or `### ` heading, plain text                            | `heading`, level 2 or 3    |
| A paragraph                                                    | `paragraph`                |
| `- ` or `1. ` list, each item one run of text                  | `list`, `ordered` for `1.` |
| A fenced code block, optionally with a language                | `code`                     |
| `> ` quote, one paragraph                                      | `quote`                    |
| A `Table: <caption>` line, then a pipe table, plain-text cells | `table`                    |
| `` `inline code` ``                                            | `{ code }`                 |
| An inline link to an `https://` URL or a path on this site     | `{ text, href }`           |

The rules `posts.test.ts` holds a post to apply to the draft as written: headings at level 2 or 3,
no level 3 before the first level 2, no heading twice; a link's text says where it goes; a link on
this site names a page that exists. The first column of a table is its row headers.

Not allowed, and caught by the check when present: bold or italics, images, raw HTML or HTML
comments, entity references such as `&amp;`, footnotes, `#` or `####` and deeper headings, setext
headings, code or links in a heading or a table cell, nested lists, an ordered list that does not
start at 1, a list item or quote of more than one paragraph, hard line breaks, reference-style
links, autolinks and bare `http://` or `https://` URLs, a line indented with a tab, a block that
does not start after a blank line, and a `---` rule inside the body. The disclosure line is not
written in `draft.md`: the site adds it (D3).

## The publish check

`scripts/post-draft-check.mjs` reads the approved draft and the served twin. It first reports every
use of the syntax the format above refuses, in the draft as written: unescaped emphasis markers,
`![`, a tag or comment, a footnote, a heading outside levels 2 and 3, and the rest of that list.
This comes first because the comparison cannot see it: a literal `**bold**` kept in the entry is
serialised as `\*\*bold\*\*`, which canonicalises to the draft's own `**bold**`. It then compares:

1. the draft's `slug` with the last path segment of the twin's `Source:` URL, its `title` with the
   twin's `#` line, and its `description` with the twin's summary;
2. the draft's body with the twin's body, which runs from after the opening and the dates to the
   footer rule;
3. the twin's footer with the kind passed on the command line (`--kind own|jev`).

Both sides are first canonicalised by the inverse of what the serialiser does on purpose, and
nothing else: backslash escapes are removed from text, an absolute URL on the origin the twin's
`Source:` line names becomes its path, whitespace inside a paragraph or list item collapses, `*` and
`+` list markers become `-`, an ordered list is renumbered from 1, table cells are trimmed and the
delimiter row is normalised, and a code fence is reduced to the shortest that holds its content.

The canonical form keeps kinds apart. Each block is written under a line naming its kind (`heading
2:`, `paragraph:`, `list ordered:`, `quote:`, `code ts:`, `table:` and so on), and running text is
split into text, code spans and links, honouring escapes: an escaped backtick or bracket is text.
Escapes are removed from text alone, and text is written back with every backslash, backtick and
bracket escaped, which no code span or link produces. So a changed block kind, such as a heading,
quote or list item that the entry wrote as a paragraph, is a difference, and so is syntax flattened
into plain text, such as a link or code span that the entry holds as a string. Anything else that
differs is reported too: a changed word or number, a dropped or added block, a moved link, a slug
that is not the page's.

Exit codes follow the repository's checks: 0 when the two agree, quietly; 1 with a line diff of
each difference, and for nothing else; 2 when the check could not run, whatever stopped it: a
missing or unreadable file, no front matter, an opening it cannot find, or an error in the check
itself.

At publish time the twin is the served file: `pnpm --filter web build`, then `next start` on a free
port, then the twin at `/blog/<slug>/index.md`. The check runs against what will deploy.

A test in the web suite ties the check to the serialiser: it runs a fixture post through
`postToMarkdown` and compares it, through the same canonicaliser, with a committed
`apps/web/src/test/fixtures/post-draft.md`. A later change to the serialiser's escaping fails CI,
not the next publish.

## Slices

| Slice | Branch                        | Delivers                                                                                                                                                                                                                 | Builds on |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| P1    | `docs/blog-publishing-design` | ADR 0033 and ADR 0028's status and pointer (D1), the `posts.ts` header comment, dated notes in the engine design's Context, in its Owner decisions and in its index row, this design and its plan, and their index rows. | `main`    |
| P2    | `feat/blog-post-kind`         | D2 to D4: `kind`, `FOOTER_LINES`, the footer on the post page, the naming check, and fixtures of both kinds.                                                                                                             | P1        |
| P3    | `feat/blog-table-block`       | D5: the type, `PostBody`, the fixtures and the rules. After P2, since both edit the same four files.                                                                                                                     | P2        |
| P4    | `feat/blog-markdown-twins`    | 61e with D6, `post-draft-check.mjs` (D8) and its tests, the fixture draft and the round-trip test, and D7's pointer in the rule file. It lands before the first post, as the engine plan requires.                       | P3        |
| P5    | `feat/blog-01-<slug>`         | The first post, once the owner has approved it in the writing room (D9, D10).                                                                                                                                            | P4        |

## Testing

- `posts.test.ts`: each copy of a fixture broken in one way is named. A Jev name in an `own` post
  (in each of the places D4 lists), a table with one column, a short row, an empty caption, an
  empty row header, and a blank cell in a wide table.
- The post page test, `post-page.test.tsx`: a `jev` fixture renders its footer inside `<article>`,
  and an `own` fixture renders none.
- The post body test, `post-body.test.tsx`: a table renders with its caption and its row and column
  headers.
- The serialiser test: every block and inline kind of every fixture, the table's caption line, and
  the footer rule and line for `jev` and none for `own`.
- The round-trip test, `post-draft.test.ts`: the fixture post through `postToMarkdown` and the check.
- `scripts/post-draft-check.test.mjs`: one case per canonicalisation rule that must compare equal,
  and one per change that must be caught: a number, a word, a dropped block, kept bold, a table
  cell, a missing or extra footer line, a changed slug, title or summary, a changed block kind, and
  a link or code span flattened into text. One case per refused syntax. Exit 2 for a missing file,
  no front matter, an opening it cannot find, and any other error, such as a directory given as the
  draft.
- End to end: while `posts` is empty there is no post to load, so the footer and the table are
  proven by the component tests, with screenshots in light, dark and a phone viewport from a scratch
  post added to `posts.ts` in the working tree and never committed. P5 brings the first real post
  under the console and axe gates in both colour schemes.

## Owner decisions (2026-10-06)

- ADR 0028's decision 5 is superseded with the plain wording in D1.
- A table block, and the Markdown subset above.
- `kind: 'own' | 'jev'`, as the tracker has it, with the naming check.
- The `/blog` list stays as it is.
- An agent writes the entry, and a deterministic check proves it.
