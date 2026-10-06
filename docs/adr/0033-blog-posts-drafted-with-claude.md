# 0033. Blog posts are drafted with Claude and approved by the owner, line by line

## Status

Accepted

## Date

2026-10-06

## Context

[ADR 0028](0028-blog-posts-as-typed-data.md) made posts typed data in `apps/web/src/data/posts.ts`,
and its decision 5 ruled that no agent writes post prose, drafts included. The owner has since
chosen to write posts with Claude, in a private writing room outside this repository. Claude drafts
each article from the owner's own explanation of the finding, every fact is checked against its
source, and the owner approves every line.

Some of the planned articles review TypeSafe's Jev model, and each of those must say that the owner
has no relationship with TypeSafe. Most rest on measured numbers that read best as a table, and the
five block kinds of decision 1 cannot hold a table.

ADR 0012 has no partial supersession, so changing decision 5 and decision 1's list of block kinds
supersedes the whole record.
[The publishing design](../plans/2026-10-06-blog-publishing-design.md) holds the post format and the
publish check in full.

## Decision

1. Posts are drafted with Claude from the owner's own explanation of each finding. Every fact is
   checked against its source, and the owner approves every line. Drafting happens outside this
   repository, and only an approved post reaches `posts.ts`, by a pull request that only the owner
   merges. Tests still prove the code that renders posts against the fixtures in
   `apps/web/src/test/fixtures/posts.ts`, whose copy describes the fixtures and nothing else.
2. A post's words are the approved ones, and this is shown mechanically.
   `scripts/post-draft-check.mjs` compares the approved draft with the post's served Markdown twin,
   after undoing on both sides only what the serialiser does on purpose. A publish pull request
   carries the check's output.
3. Every post, draft or published, carries `kind: 'own' | 'jev'`, and the field is required. `jev`
   marks an article that reviews TypeSafe's Jev model. `posts.test.ts` fails when a published post
   that is not `jev` names Jev or TypeSafe in any text it shows, matched case-sensitively and as a
   whole word.
4. `FOOTER_LINES` in `posts.ts` maps each kind to the lines its posts end with: none for `own`, and
   "I have no relationship with TypeSafe." for `jev`. The post page renders them in a `<footer>`,
   last inside its `<article>`. The twin ends with them after a `---` rule. The feed carries only
   summaries, so it has none.
5. A post's body is built from six block kinds: `heading` (level 2 or 3), `paragraph`, `list`,
   `code`, `quote` and `table`. A table has a caption, two or more columns, and rows of plain-text
   cells whose first cell is the row header. It is rendered by `components/data-table.tsx`.

ADR 0028's decisions 2, 3, 4 and 6 still apply, and so does its decision 1 apart from the list of
block kinds.

## Consequences

### Positive

- The owner can publish as fast as the writing room drafts. Every Jev article tells its reader
  plainly that the owner has no relationship with TypeSafe, and a post that names Jev or TypeSafe
  as their owners write them cannot leave the flag out.
- A post that changes on its way into `posts.ts` fails a check. Nobody has to reread it to notice.
- Measured results get a table with real row and column headers, and the stacked phone layout that
  the site's other tables have.

### Trade-offs

- The check reads the served twin, so publishing needs a production build and a local server.
- The check keeps its own copy of `FOOTER_LINES`, because a plain script cannot import the app's
  TypeScript. A test in the web suite fails when the two copies differ.
- The naming check is a word match. It cannot tell a post about Jev from one that names it in
  passing, and both must be `jev`. It is case-sensitive and needs a non-word character on each
  side, so another casing ("JEV", "Typesafe") or a name joined to a digit is not caught.
- Table cells are plain text, with no code, links, chips or icons, because a pipe table in a draft
  cannot express them.

## Alternatives considered

- **Keep decision 5 and have the owner retype each approved draft.** Rejected: retyping is where the
  words drift, and nothing would show that they had not.
- **A Markdown or MDX body parsed at build time.** Rejected for ADR 0028's reasons: it puts a parser
  in the build and gives one post's text two sources.
- **An agent writes the entry and a person compares it with the draft by eye.** Rejected: the
  comparison is the step most likely to be skimmed, and the check does it mechanically.
- **A line in each article about how it was written, or a page about it.** The owner decided against
  both.
- **A boolean `jev` flag.** Rejected: the writing room's tracker already uses `own` and `jev`, and a
  required field makes the choice explicit for every post.
