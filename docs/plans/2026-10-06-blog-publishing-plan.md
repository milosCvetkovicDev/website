# Blog Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An article approved in the writing room becomes a published post, and a check proves its
words are the approved ones. Every Jev article ends with the TypeSafe disclosure, and measured
results can be shown as tables.

**Architecture:** Posts stay typed data in `apps/web/src/data/posts.ts`, as ADR 0028 has it. P2 adds
a required `kind` and `FOOTER_LINES`, P3 adds a `table` block, and P4 adds the post's Markdown twin,
written by `serialise.ts`. P4 also adds a plain Node script, `scripts/post-draft-check.mjs`, that
canonicalises the approved `draft.md` and the served twin and compares them. A test in the web suite
ties that script to the serialiser.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Vitest (jsdom and node),
Playwright, and Node 22 for `node:test` and for plain `.mjs` with JSDoc that `tsc` checks.

**Spec:** [the publishing design](2026-10-06-blog-publishing-design.md), decisions D1 to D10. Read
it first: every task here argues from it.

**Branches:** one per slice, named in the design's Slices table. Branch each slice from `main` once
the one before it has merged. If the owner wants two in flight at once, stack the later branch on
the earlier one and open its pull request as a draft with that branch as its base.

**Stop condition for the whole plan (all must hold):**

```bash
pnpm check:allowbuilds && pnpm check:adrs && pnpm test:scripts && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web build && CI=true pnpm --filter web test:e2e                                                                                    # exit 0, all three projects
node scripts/check-docs-drift.ts --skip-requires admin                                                                                          # 0 drift, 0 uncatalogued
```

After P5 merges, the first post also has to pass these checks in production:

- it is listed on `/blog`;
- `/blog` has no `noindex`;
- the post's twin answers at `/blog/<slug>/index.md` as `text/markdown`;
- a Jev article's page ends with the disclosure line.

## Global Constraints

- Load nvm before any node, pnpm or npx command (`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"`),
  then run `nvm use`, so that Node 22 from `.nvmrc` runs and not Node 20.
- The repository is public. Commits, pull request bodies and code comments carry no machine paths,
  no writing-room paths or notes, and no personal data. Call it "the writing room".
- The footer line, word for word: `I have no relationship with TypeSafe.` It is the only footer
  line, and `own` posts have none.
- `kind` is exactly `'own' | 'jev'`, the values the writing room's tracker uses.
- The naming check matches `Jev` or `TypeSafe` case-sensitively and as a whole word. No letter, mark,
  digit or underscore may stand on either side, in any script, so `Jevtić` and `Jevđević` are not
  matches.
- The footer's text is `--muted`, never dimmed with an opacity modifier (ADR 0011); links use
  `--accent-text`. Everything added here is a server component: add no `'use client'`.
- `eslint-disable` is never a fix. `pnpm lint:fix` drops `--max-warnings 0`, so always finish with
  `pnpm lint`.
- Commits follow Conventional Commits. They are signed, their body lines stay under 100 characters,
  and they never use `--no-verify`. Branch prefixes match the commit type.
- Every pull request goes through the checklist in `.github/pull_request_template.md`, with the real
  output of each command, and gets a reviewer other than its author:
  - `adversarial-reviewer` on the diff;
  - `ui-reviewer` on any changed component or route page, named file by file.

  UI changes also need screenshots in light, dark and a phone viewport, taken from a scratch change
  that is never committed. Only the owner merges: hand over
  `gh pr merge <N> --squash --match-head-commit <sha>`.

- Under `docs/`, every new relative link, every backticked `pnpm` command outside a fenced block and
  every path:line citation needs an entry in `docs/drift-manifest.json`. Check with
  `node scripts/check-docs-drift.ts --skip-requires admin`, not through pnpm, which rejects the `--`.
- ADR 0034 was the next free number on 2026-10-06, once #233 had taken 0033 for its Dependabot
  record. Re-check it on `origin/main` and in the open pull requests before writing the record.
- Run verification one suite at a time: parallel sessions load this machine enough to fail timing
  assertions that pass in CI.
- Only P5 changes what a page visibly says, so only P5 bumps content dates.
- Each task ticks its own steps' checkboxes in this plan in its own commit, so this plan is in every
  task's `git add`. Task 5, which changes no code, commits its ticks on their own.

## Review Focus

1. **Words that start like the names.** A Serbian surname such as `Jevtić` or `Jevđević` begins
   with `Jev`. An ASCII `\b` treats `đ` as a word edge, so `/\bJev\b/` would flag `Jevđević` in an
   `own` post. The check uses Unicode-aware edges. Pinned in Task 2.
2. **A code block that holds `---` or runs of backticks.** The twin's fence must be longer than the
   code's longest backtick run. The check must not mistake a `---` line inside a fence for the
   footer rule. Pinned in Tasks 6 and 8.
3. **A draft saved with CRLF line endings or a byte-order mark.** It must compare equal to the twin.
   Pinned in Task 8.
4. **An escape slipped into inline code.** Backslashes are literal inside a code span, so an entry
   `{ code: 'snake\\_case' }` for a draft's `` `snake_case` `` changes what the reader sees. The
   check must report it. Pinned in Task 8.
5. **Front matter with a colon or quotes in a value**, as in `title: "Where the tokens go: one
week"`. It must parse to the title the twin serves. Pinned in Task 8.

## File map

| Slice | Creates                                                                                                                                                                                                            | Modifies                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1    | `docs/adr/0034-blog-posts-drafted-with-claude.md`                                                                                                                                                                  | `docs/adr/0028-blog-posts-as-typed-data.md`, `docs/adr/README.md`, `apps/web/src/data/posts.ts` (comment only), `docs/plans/2026-09-28-blog-engine-design.md`, `docs/plans/2026-10-06-blog-publishing-design.md`, `docs/plans/README.md`, `docs/drift-manifest.json`                                                                                                                                                                                                                                 |
| P2    |                                                                                                                                                                                                                    | `apps/web/src/data/posts.ts`, `apps/web/src/test/fixtures/posts.ts`, `apps/web/src/data/__tests__/posts.test.ts`, `apps/web/src/app/blog/[slug]/page.tsx`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`                                                                                                                                                                                                                                                                                      |
| P3    |                                                                                                                                                                                                                    | `apps/web/src/data/posts.ts`, `apps/web/src/test/fixtures/posts.ts`, `apps/web/src/data/__tests__/posts.test.ts`, `apps/web/src/components/post-body.tsx`, `apps/web/src/components/__tests__/post-body.test.tsx`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`                                                                                                                                                                                                                              |
| P4    | `apps/web/src/app/blog/[slug]/index.md/route.ts`, `scripts/post-draft-check.mjs`, `scripts/post-draft-check.test.mjs`, `apps/web/src/test/fixtures/post-draft.md`, `apps/web/src/lib/__tests__/post-draft.test.ts` | `apps/web/src/lib/serialise.ts`, `apps/web/src/lib/__tests__/serialise.test.ts`, `apps/web/src/app/blog/index.md/route.ts`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`, `apps/web/src/data/__tests__/pages.test.ts`, `apps/web/next.config.ts`, `apps/web/src/test/next-config.test.ts`, `apps/web/e2e/endpoints.ts`, `.prettierignore`, `.claude/rules/app-router-and-content.md`, `.claude/rules/ci-and-scripts.md`, `docs/plans/2026-09-28-blog-engine-plan.md`, `docs/plans/README.md` |
| P5    |                                                                                                                                                                                                                    | `apps/web/src/data/posts.ts`, `apps/web/src/data/static-routes.ts`, `docs/plans/README.md`, `docs/plans/2026-10-06-blog-publishing-plan.md`                                                                                                                                                                                                                                                                                                                                                          |

---

### Task 1: P1, ADR 0034 and the records it changes

**Files:**

- Create: `docs/adr/0034-blog-posts-drafted-with-claude.md`
- Modify: `docs/adr/0028-blog-posts-as-typed-data.md` (Status), `docs/adr/README.md` (row 0028, a new
  row 0034), `apps/web/src/data/posts.ts` (the header comment), the Context section and the Owner
  decisions of `docs/plans/2026-09-28-blog-engine-design.md`, the header of
  `docs/plans/2026-10-06-blog-publishing-design.md`, `docs/plans/README.md` (the engine design's
  row), `docs/drift-manifest.json`, `docs/plans/2026-10-06-blog-publishing-plan.md` (this task's
  boxes)
- Branch: `docs/blog-publishing-design`, which already holds the design and this plan.

**Interfaces:**

- Produces: ADR 0034, which the code comments of Tasks 2 to 10 cite.

- [x] **Step 1: Confirm that 0034 is free**

```bash
git fetch origin
git ls-tree --name-only origin/main docs/adr/ | grep -E '/00(3[4-9]|[4-9][0-9])-'
gh pr list --state open --json number,files --jq '.[] | select(any(.files[]; .path | test("^docs/adr/00(3[4-9]|[4-9][0-9])-"))) | .number'
```

Expected: no output from either command. If 0034 is taken, use the next free number everywhere this
plan says 0034: the file name, the H1, the index row, the pointers and the code comments.

- [x] **Step 2: Write the record**

Create `docs/adr/0034-blog-posts-drafted-with-claude.md`:

```markdown
# 0034. Blog posts are drafted with Claude and approved by the owner, line by line

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
```

- [x] **Step 3: Supersede ADR 0028**

In `docs/adr/0028-blog-posts-as-typed-data.md`, replace the line `Accepted` under `## Status` with:

```markdown
Superseded by ADR-0034

Two of the decisions below no longer apply, and
[ADR 0034](0034-blog-posts-drafted-with-claude.md) replaces both. Decision 5 goes, because posts
are now drafted with Claude and approved by the owner line by line. Decision 1's list of block kinds
gains a `table`. The rest of this record still applies.
```

Leave the H1 and every other section as they are: ADR 0012 forbids editing an accepted
`## Decision`.

- [x] **Step 4: Update the ADR index**

In `docs/adr/README.md`, set row 0028's status cell to `Superseded by ADR-0034` and add this row
after the last one:

```markdown
| 0034 | [Blog posts are drafted with Claude and approved by the owner, line by line](0034-blog-posts-drafted-with-claude.md) | Accepted | 2026-10-06 |
```

The Prettier hook pads the table.

- [x] **Step 5: Rewrite the comment at the top of `posts.ts`**

In `apps/web/src/data/posts.ts`, replace the line
` * For the owner, who writes every post; no agent drafts one (ADR 0028):` with:

```ts
 * For whoever adds a post. A post is drafted with Claude outside this repository, approved line by
 * line by the owner, and added here by a pull request that only the owner merges (ADR 0034):
```

In the first bullet under it, replace these two lines:

```ts
 * - Add a post to `posts` as `draft: true` while it is being written. A draft renders nowhere and
 *   needs no dates. Everything that shows posts reads `publishedPosts` or `getPost`, never `posts`.
```

with these, which keep the rest of the bullet:

```ts
 * - A post can wait in `posts` as `draft: true`: a draft renders nowhere and needs no dates.
 *   Everything that shows posts reads `publishedPosts` or `getPost`, never `posts`.
```

- [x] **Step 6: Add the dated notes**

At the end of the Context section of `docs/plans/2026-09-28-blog-engine-design.md`, before its next
`##` heading, add:

```markdown
> **2026-10-06:** the bullet "No agent writes a post" no longer holds.
> [ADR 0034](../adr/0034-blog-posts-drafted-with-claude.md) supersedes ADR 0028: posts are drafted
> with Claude and approved by the owner line by line.
> [The publishing design](2026-10-06-blog-publishing-design.md) adds the `kind` flag, the disclosure
> footer, a table block and the publish check.
```

In the same design's Owner decisions, append to the bullet
`Typed blocks over MDX, and that no agent writes a post (ADR 0028).`, without rewriting it:

```markdown
**2026-10-06:** the second half no longer holds:
[ADR 0034](../adr/0034-blog-posts-drafted-with-claude.md) supersedes ADR 0028.
```

In `docs/plans/README.md`, append to the notes of the engine design's row, without rewriting them:
`2026-10-06: ADR 0034 supersedes ADR 0028; posts are drafted with Claude and approved line by line by the owner.`

In the header of `docs/plans/2026-10-06-blog-publishing-design.md`, whose status already reads
`Accepted (2026-10-06)`, add `[ADR 0034](../adr/0034-blog-posts-drafted-with-claude.md)` to the
**Related** line.

- [x] **Step 7: Catalogue the new links**

```bash
node scripts/check-docs-drift.ts --skip-requires admin
```

Expected: exit 1, with the new links reported `uncatalogued`. Give each one an entry in
`docs/drift-manifest.json`, shaped like `blog-publishing-design-link-adr-0028`: `method`
`file-line`, `evaluation` `live`, `covers` naming the link token, and `check.path` the file the link
resolves to from the repository root.

The plan already links ADR 0034 in the text it quotes. Its two entries,
`blog-publishing-plan-link-adr-0034` and `blog-publishing-plan-link-adr-0034-from-plans`, check
that the plan creates the record, because it did not exist when the plan was written. Now that it
exists, point both at it: set each `check` to `{ "path": "docs/adr/0034-blog-posts-drafted-with-claude.md" }`
and each `claim` to say that the link resolves to that record. Run the check again.

Expected: `0 drift, 0 uncatalogued`.

- [x] **Step 8: Run the gates this slice touches**

```bash
pnpm check:adrs
pnpm format:check
pnpm lint
```

Expected: exit 0 from each. `check:adrs` passes only if row 0028's status matches its record and
the pointer links an accepted record with a later number.

- [x] **Step 9: Commit, review and open the pull request**

```bash
git add docs/adr/0034-blog-posts-drafted-with-claude.md docs/adr/0028-blog-posts-as-typed-data.md docs/adr/README.md apps/web/src/data/posts.ts docs/plans/2026-09-28-blog-engine-design.md docs/plans/2026-10-06-blog-publishing-design.md docs/plans/README.md docs/drift-manifest.json docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "docs(adr): supersede ADR 0028 with ADR 0034, posts drafted with Claude"
```

Run `adversarial-reviewer` on `git diff origin/main...HEAD`. Then follow
`.claude/skills/open-pr/SKILL.md` with the title
`docs(adr): supersede ADR 0028 with ADR 0034 and plan blog publishing`. In `docs/plans/README.md`,
leave the rows of this design and this plan `In review`: they stay so until Task 10's pull request,
which sets both to `Shipped`.

---

### Task 2: P2, `kind`, `FOOTER_LINES` and the naming check

**Files:**

- Modify: `apps/web/src/data/posts.ts`, `apps/web/src/test/fixtures/posts.ts`,
  `apps/web/src/data/__tests__/posts.test.ts`
- Branch: `feat/blog-post-kind` from `origin/main` after P1 merges.

**Interfaces:**

- Produces, from `@/data/posts`:
  - `type PostKind = 'own' | 'jev'`;
  - `kind: PostKind` on every `Post`;
  - `FOOTER_LINES: Readonly<Record<PostKind, readonly string[]>>`.
- Produces, in the fixtures: `everyBlockPost.kind === 'own'`, `hostileTitlePost.kind === 'jev'` and
  `draftPost.kind === 'own'`.

- [x] **Step 1: Write the failing tests**

In `apps/web/src/data/__tests__/posts.test.ts`, add `FOOTER_LINES` and `type PostKind` to the
existing import from `'../posts'`, and this helper beside the other test helpers:

```ts
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

Add to the end of `defects`:

```ts
  // Each with the value the problem has to report, written out rather than computed.
  ...(
    [
      [undefined, 'undefined'],
      ['Jev', '"Jev"'],
      ['typesafe', '"typesafe"'],
      ['', '""'],
    ] as const
  ).map(([kind, reported]): [string, Post[], RegExp] => [
    `the kind ${reported}`,
    [published({ kind })],
    new RegExp(`^fixture-every-block: kind must be "own" or "jev", not ${escapeRegExp(reported)}$`),
  ]),
  // A draft's kind is checked too: it keeps its kind when it is published.
  [
    'the kind "x" on a draft',
    [{ ...draftPost, kind: 'x' } as unknown as Post],
    /^fixture-draft: kind must be "own" or "jev", not "x"$/,
  ],
  // Each place a post shows text. A name in any of them makes an `own` post a defect (ADR 0034).
  ...(
    [
      ['the title', { title: 'Fixture: what TypeSafe measures' }, 'title', 'TypeSafe'],
      ['metaTitle', { title: 'Fixture: a title', metaTitle: 'Fixture: Jev in short' }, 'metaTitle', 'Jev'],
      ['the summary', { summary: `${everyBlockPost.summary} It mentions Jev.` }, 'summary', 'Jev'],
      ['a tag', { tags: ['Fixture', 'Jev'] }, 'tags[1]', 'Jev'],
      ['a heading', { body: [heading(2, 'What Jev gets right')] }, 'body[0].text', 'Jev'],
      ['a paragraph', { body: [paragraph("Jev's numbers.")] }, 'body[0].content[0]', 'Jev'],
      [
        'link text',
        { body: [paragraph('See ', { text: 'the TypeSafe docs', href: 'https://example.com' }, '.')] },
        'body[0].content[1].text',
        'TypeSafe',
      ],
      // The twin prints a link's URL after its text, so the URL is text the post shows too.
      [
        'a link target',
        { body: [paragraph('See ', { text: 'the example page', href: 'https://example.com/TypeSafe' }, '.')] },
        'body[0].content[1].href',
        'TypeSafe',
      ],
      [
        'inline code',
        { body: [paragraph('Run ', { code: 'TypeSafe.check()' }, '.')] },
        'body[0].content[1].code',
        'TypeSafe',
      ],
      [
        'a list item',
        // Numbered, because a body may not open with a bulleted list.
        { body: [{ kind: 'list', ordered: true, items: [['Ask Jev.']] }] },
        'body[0].items[0][0]',
        'Jev',
      ],
      ['a code block', { body: [{ kind: 'code', code: 'model = "Jev"' }] }, 'body[0].code', 'Jev'],
      // The page names the code figure by its language, and the twin's fence carries it.
      [
        'a code language',
        { body: [{ kind: 'code', language: 'TypeSafe', code: 'x' }] },
        'body[0].language',
        'TypeSafe',
      ],
      ['a quote', { body: [{ kind: 'quote', content: ['TypeSafe said so.'] }] }, 'body[0].content[0]', 'TypeSafe'],
    ] as const
  ).map(([place, fields, path, name]): [string, Post[], RegExp] => [
    `${name} named in ${place} of an own post`,
    [published(fields)],
    new RegExp(
      `^fixture-every-block: ${escapeRegExp(path)} names "${name}", so its kind must be "jev", not "own"$`,
    ),
  ]),
```

Add to the end of `accepted`:

```ts
  ['a jev post that names TypeSafe and Jev', [published({ kind: 'jev', title: 'Fixture: TypeSafe and Jev' })]],
  ['a jev post that names neither', [published({ kind: 'jev' })]],
  // A draft renders nowhere, so the names are checked once it is published.
  ['a draft that names Jev', [{ ...draftPost, title: 'Fixture: Jev' }]],
  // Not the names: a surname that starts with one, whether the letter after it is ASCII or not, a
  // longer word, another case.
  ...['Jevtić', 'Jevđević', 'Jevremović', 'TypeSafety', 'typesafe', 'type-safe', 'JEV'].map(
    (word): [string, Post[]] => [
      `${word} in an own post`,
      [withBody(paragraph(`A sentence with ${word} in it.`))],
    ],
  ),
  // Not the names either: a letter, digit, underscore or combining mark against one edge.
  ...[
    ['a letter before Jev', 'ŠJev'],
    ['a digit before Jev', '2Jev'],
    ['an underscore before Jev', '_Jev'],
    ['a combining acute accent before Jev', 'e\u0301Jev'],
    ['a letter before TypeSafe', 'MyTypeSafe'],
    ['a digit after Jev', 'Jev2'],
    ['an underscore after Jev', 'Jev_'],
    ['a combining acute accent after Jev', 'Jev\u0301'],
    ['a digit after TypeSafe', 'TypeSafe2'],
    ['an underscore after TypeSafe', 'TypeSafe_'],
  ].map(([edge, word]): [string, Post[]] => [
    `${edge} in an own post`,
    [withBody(paragraph(`A sentence with ${word} in it.`))],
  ]),
  // The match is case-sensitive (ADR 0034), so a lowercase domain in a link's URL is not the name.
  ['an own post linking to a lowercase typesafe domain', [withLink('https://typesafe.dev/docs', 'their docs')]],
```

In `describe('the post fixtures')`, add:

```ts
it('hold a published post of each kind', () => {
  // `satisfies` fails typecheck when a kind is added to PostKind without being added here.
  const kinds = { own: true, jev: true } satisfies Record<PostKind, true>;
  expect(new Set(publishedFixtures.map(({ kind }) => kind))).toEqual(new Set(Object.keys(kinds)));
});
```

At the end of the file, add:

```ts
describe('FOOTER_LINES', () => {
  it("ends a jev post with the owner's disclosure, word for word, and an own post with nothing", () => {
    expect(FOOTER_LINES).toEqual({ own: [], jev: ['I have no relationship with TypeSafe.'] });
  });

  it('holds lines the post checker accepts as text', () => {
    for (const line of Object.values(FOOTER_LINES).flat()) {
      expect(lineProblems(line, 'a footer line')).toEqual([]);
    }
  });
});
```

- [x] **Step 2: Run them to see them fail**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts
```

Expected: FAIL. The new defect rows report no problem (`expected [] to have a length of 1`), the
fixtures have no `kind`, and `FOOTER_LINES` is undefined.

- [x] **Step 3: Add the kind and the footer lines to the model**

In `apps/web/src/data/posts.ts`, add this bullet to the header comment, after the bullet that begins
`Every string is plain text`:

```ts
 * - Every post, draft or published, has a `kind`: `jev` for an article that reviews TypeSafe's Jev
 *   model, `own` otherwise. `posts.test.ts` fails when a published post that is not `jev` names Jev
 *   or TypeSafe in any text it shows, matched case-sensitively and as a whole word (ADR 0034).
```

Above `interface PostContent`:

```ts
/**
 * Which kind of article a post is, as the writing room's tracker names it: `jev` for an article
 * that reviews TypeSafe's Jev model, `own` for every other (ADR 0034).
 */
export type PostKind = 'own' | 'jev';
```

In `PostContent`, after `tags`:

```ts
  /** `jev` when the post reviews TypeSafe's Jev model, so that it ends with `FOOTER_LINES.jev`. */
  readonly kind: PostKind;
```

After `export type Post = PublishedPost | DraftPost;`:

```ts
/**
 * The lines a post of each kind ends with, in order (ADR 0034), in the owner's own words. The post
 * page renders them in a `<footer>`, last inside its `<article>`, and ADR 0034 has the post's
 * Markdown twin end with them after a `---` rule. The feed carries only summaries, so no line
 * reaches it.
 */
export const FOOTER_LINES: Readonly<Record<PostKind, readonly string[]>> = {
  own: [],
  jev: ['I have no relationship with TypeSafe.'],
};
```

In the doc comment of `posts`, replace `The owner writes them; see the top of this file.` with
`The top of this file says how a post is drafted and added.`

- [x] **Step 4: Give the fixtures their kinds**

In `apps/web/src/test/fixtures/posts.ts`:

- add `kind: 'own',` after `draft: false,` in `everyBlockPost` and after `draft: true,` in `draftPost`;
- add `kind: 'jev',` after `draft: false,` in `hostileTitlePost`;
- in the header comment, change `a draft, and two published posts with different dates` to
  `a draft, and two published posts with different dates, one of each kind`.

- [x] **Step 5: Add the kind and naming rules to the checker**

In `posts.test.ts`, after `dateProblems`:

```ts
/** The kinds a post may have: the keys of `FOOTER_LINES`, which names every kind once. */
const KINDS: readonly unknown[] = Object.keys(FOOTER_LINES);

/**
 * Jev or TypeSafe as their owners write them, as a whole word. No letter, mark, digit or underscore
 * may stand on either side, in any script: an ASCII `\b` would take the `đ` of "Jevđević" for a
 * word edge. So "Jevtić" and "TypeSafety" are not the names, and "Jev's" is.
 */
const JEV_NAMES = /(?<![\p{L}\p{M}\p{N}_])(?:Jev|TypeSafe)(?![\p{L}\p{M}\p{N}_])/u;

/**
 * Fields whose values a reader is never shown as text: identifiers, dates, flags. A link's `href`
 * is not one of them, because the Markdown twin prints a link's URL after its text. `slug` stays:
 * `SLUG` allows lowercase letters, digits and hyphens only, so a slug can never hold either name.
 */
const NOT_SHOWN = new Set([
  'slug',
  'kind',
  'draft',
  'publishedAt',
  'updatedAt',
  'level',
  'ordered',
]);

/**
 * Every string a post shows, each with its path in the post (`body[2].content[1].text`). The walk
 * is generic, so a block kind added later is covered without a change here.
 */
function shownTexts(value: unknown, path: string): [path: string, text: string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => shownTexts(item, `${path}[${index}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      NOT_SHOWN.has(key) ? [] : shownTexts(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function kindProblems(post: Post): string[] {
  const { kind }: { kind: unknown } = post;
  if (KINDS.includes(kind)) return [];
  const known = KINDS.map((each) => JSON.stringify(each)).join(' or ');
  return [`${post.slug}: kind must be ${known}, not ${JSON.stringify(kind)}`];
}

/** A published post that names Jev or TypeSafe must be `jev`, so that it carries the disclosure. */
function namingProblems(post: PublishedPost): string[] {
  if (post.kind === 'jev') return [];
  return shownTexts(post, '').flatMap(([path, text]) => {
    const name = JEV_NAMES.exec(text)?.[0];
    return name
      ? [
          `${post.slug}: ${path} names "${name}", so its kind must be "jev", not ${JSON.stringify(post.kind)}`,
        ]
      : [];
  });
}
```

In `problemsIn`, replace the two lines

```ts
problems.push(...dateProblems(post, today));
if (post.draft === false) problems.push(...contentProblems(post, pages));
```

with:

```ts
problems.push(...kindProblems(post));
problems.push(...dateProblems(post, today));
if (post.draft === false) problems.push(...contentProblems(post, pages), ...namingProblems(post));
```

In the doc comment of `problemsIn`, add after its first sentence: `A kind is checked on every post,
and the names only on a published one.`

- [x] **Step 6: Run the tests until they pass, then typecheck**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts
pnpm typecheck
```

Expected: PASS, and typecheck exits 0. If typecheck names another post literal without `kind`, give
it `kind: 'own'`: every other test file spreads a fixture, so there should be none.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/data/posts.ts apps/web/src/test/fixtures/posts.ts apps/web/src/data/__tests__/posts.test.ts docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(blog): give every post a kind and check that a jev post is marked jev"
```

---

### Task 3: P2, the footer on the post page, and P2's pull request

**Files:**

- Modify: `apps/web/src/app/blog/[slug]/page.tsx`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`

**Interfaces:**

- Consumes: `FOOTER_LINES` and `post.kind` from Task 2.
- Produces: `<footer>` as the last child of the post page's `<article>` for a kind with lines, with
  one `<p>` per line.

- [x] **Step 1: Write the failing tests**

In `post-page.test.tsx`, add `FOOTER_LINES` to the import from `'@/data/posts'`. In the file's
`vi.mock` of `'@/data/posts'`, which spreads `actual`, override `FOOTER_LINES` with two fixture
lines, so that the test below proves one paragraph per line (`posts.test.ts` pins the real lines):

```ts
const list = [...fixturePosts, withMetaTitle];
// Two closing lines rather than the real one, so that the footer test can tell one paragraph per
// line from the lines joined into one; `posts.test.ts` pins the real lines.
const FOOTER_LINES: typeof actual.FOOTER_LINES = {
  own: [],
  jev: ['Fixture: the first closing line.', 'Fixture: the second closing line.'],
};
return { ...actual, FOOTER_LINES, posts: list, ...actual.buildPostIndex(list) };
```

Then add after the test `keeps the way back out of the article, …`:

```tsx
it('ends a jev post with its footer lines, last inside the article, in --muted text', async () => {
  // The control: with one line, a footer that joined its lines into one paragraph would pass.
  expect(FOOTER_LINES.jev.length).toBeGreaterThan(1);
  render(await PostPage(paramsOf(hostileTitlePost.slug)));
  const footer = document.querySelector('article')!.lastElementChild!;
  expect(footer.tagName).toBe('FOOTER');
  expect([...footer.children].map((line) => [line.tagName, line.textContent])).toEqual(
    FOOTER_LINES.jev.map((line) => ['P', line]),
  );
  expect(footer.className).toContain('border-t');
  expect(footer.className).toContain('text-[var(--muted)]');
  // Neither an opacity step nor a text alpha, numeric (`/60`) or arbitrary (`/[0.6]`).
  for (const element of [footer, ...footer.children]) {
    expect(element.className).not.toMatch(/opacity-|text-\S+\/[\d[]/);
  }
});

it('gives an own post no footer', async () => {
  render(await PostPage(paramsOf(everyBlockPost.slug)));
  expect(document.querySelector('article footer')).toBeNull();
});
```

- [x] **Step 2: Run them to see them fail**

```bash
pnpm --filter web exec vitest run src/app/blog/__tests__/post-page.test.tsx
```

Expected: FAIL. The article's last child is the post body's `DIV`, not a `FOOTER`.

- [x] **Step 3: Render the footer**

In `apps/web/src/app/blog/[slug]/page.tsx`, import `FOOTER_LINES` beside `getPost`, and bind
`const footerLines = FOOTER_LINES[post.kind];` once in the component body, after `published` and
`updated`. Then add the footer as the last child of `<article>`, after
`<PostBody blocks={post.body} />`, so that the `<article>` element reads:

```tsx
<article>
  <header className="mb-12">
    <h1 className="mb-6 text-4xl font-bold wrap-break-word md:text-5xl">{post.title}</h1>
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <div className="flex gap-2">
        <dt className="text-[var(--muted)]">Published</dt>
        <dd>
          <time dateTime={post.publishedAt}>{published}</time>
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="text-[var(--muted)]">Updated</dt>
        <dd>
          <time dateTime={post.updatedAt}>{updated}</time>
        </dd>
      </div>
    </dl>
  </header>

  <PostBody blocks={post.body} />
  {/* The kind's closing lines, last inside the article (ADR 0034). Readers that strip
      every `<footer>`, as Readability and trafilatura do, drop them. `--muted` rather
      than an opacity step (ADR 0011). */}
  {footerLines.length > 0 ? (
    <footer className="mt-12 space-y-2 border-t border-[var(--border)] pt-6 text-[var(--muted)]">
      {footerLines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </footer>
  ) : null}
</article>
```

- [x] **Step 4: Run the tests until they pass**

```bash
pnpm --filter web exec vitest run src/app/blog/__tests__/post-page.test.tsx
```

Expected: PASS.

- [x] **Step 5: Take the screenshots from a scratch change that is never committed**

No post is published, so for the screenshots the scratch post below is published in the working
tree only. In `apps/web/src/data/posts.ts`, replace `export const posts: readonly Post[] = [];`
with:

```ts
export const posts: readonly Post[] = [
  {
    slug: 'scratch-footer',
    draft: false,
    kind: 'jev',
    title: 'Scratch: the disclosure footer',
    summary:
      'A scratch post for screenshots of the footer in light, dark and a phone; never committed.',
    tags: [],
    publishedAt: '2026-10-06',
    updatedAt: '2026-10-06',
    body: [{ kind: 'paragraph', content: ['A paragraph above the footer, as a post body ends.'] }],
  },
];
```

```bash
pnpm --filter web build
pnpm --filter web exec next start -p 3217    # in a second shell; stop it with Ctrl-C after the screenshots
OUT="$(mktemp -d)"
pnpm --filter web exec playwright screenshot --color-scheme=light --viewport-size=1280,900 --full-page http://localhost:3217/blog/scratch-footer "$OUT/footer-light.png"
pnpm --filter web exec playwright screenshot --color-scheme=dark --viewport-size=1280,900 --full-page http://localhost:3217/blog/scratch-footer "$OUT/footer-dark.png"
pnpm --filter web exec playwright screenshot --device="Pixel 7" --full-page http://localhost:3217/blog/scratch-footer "$OUT/footer-mobile.png"
echo "$OUT"
```

Read each PNG. Check that the footer sits below the body, above a top border, in readable muted text,
in both schemes and on the phone. Then restore the file, after checking that its diff is only the
scratch post:

```bash
git diff apps/web/src/data/posts.ts
git restore apps/web/src/data/posts.ts
git status --short    # clean
```

- [x] **Step 6: Review the change and run the gates**

Run `ui-reviewer` on `apps/web/src/app/blog/[slug]/page.tsx`, naming the file. Then run, one at a
time:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: exit 0 from each.

- [x] **Step 7: Commit and open the pull request**

```bash
git add 'apps/web/src/app/blog/[slug]/page.tsx' apps/web/src/app/blog/__tests__/post-page.test.tsx docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(blog): end a jev post with its disclosure line in the article footer"
```

Run `adversarial-reviewer` on `git diff origin/main...HEAD`. Then follow
`.claude/skills/open-pr/SKILL.md` with the title
`feat(blog): give posts a kind and end jev posts with the disclosure line`. Its body:

- cites D2 to D4 and ADR 0034;
- pastes the gate output;
- describes the three screenshots;
- triages the review findings as fixed, deferred with a reason, or rejected with a reason.

---

### Task 4: P3, the `table` block, its rules and its renderer

**Files:**

- Modify: `apps/web/src/data/posts.ts`, `apps/web/src/test/fixtures/posts.ts`,
  `apps/web/src/data/__tests__/posts.test.ts`, `apps/web/src/components/post-body.tsx`,
  `apps/web/src/components/__tests__/post-body.test.tsx`,
  `apps/web/src/app/blog/__tests__/post-page.test.tsx`
- Branch: `feat/blog-table-block` from `origin/main` after P2 merges.

**Interfaces:**

- Consumes: `DataTable({ caption, columns, rows }: Table)` from `components/data-table.tsx`.
- Produces, from `@/data/posts`:

  ```ts
  interface TableBlock {
    kind: 'table';
    caption: string;
    columns: readonly string[];
    rows: readonly (readonly [header: string, ...cells: string[]])[];
  }
  ```

  Every field is `readonly`. `PostBlock` gains `TableBlock`.

- Produces, in the fixtures: the last block of `everyBlockPost` is the table below. Task 6 asserts it
  verbatim.

- [x] **Step 1: Write the failing rule tests**

In `posts.test.ts`, beside the other helpers:

```ts
const tableBlock = (fields: Record<string, unknown> = {}) => ({
  kind: 'table',
  caption: 'Fixture results',
  columns: ['Run', 'Tokens', 'Cost'],
  rows: [['First run', '1,234', '$0.10']],
  ...fields,
});
const withTable = (fields: Record<string, unknown>) => withBody(tableBlock(fields));
```

Add to `defects`:

```ts
  ['a table with no caption', [withTable({ caption: '' })], /: block 1: the table caption is empty$/],
  [
    'a table with one column',
    [withTable({ columns: ['Run'], rows: [['First run']] })],
    /: block 1: the table has 1 column; it needs the row headers and a column of values$/,
  ],
  ['a table with an empty column name', [withTable({ columns: ['Run', '', 'Cost'] })], /: block 1: column 2 is empty$/],
  ['a table with no rows', [withTable({ rows: [] })], /: block 1: the table has no rows$/],
  ['a short table row', [withTable({ rows: [['First run', '1,234']] })], /: block 1: row 1 has 2 cells for 3 columns$/],
  ['a table row with no header', [withTable({ rows: [['', '1,234', '$0.10']] })], /: block 1: row 1: the row header is empty$/],
  [
    'a blank cell in a table of three columns',
    [withTable({ rows: [['First run', ' ', '$0.10']] })],
    /: block 1: row 1, column 2 is blank, and a table of three or more columns cannot show a blank cell on a phone$/,
  ],
  [
    'a table cell with a line break',
    [withTable({ rows: [['First run', '1,234\n5', '$0.10']] })],
    /: block 1: row 1, column 2 holds a line break, a control or a direction character$/,
  ],
  [
    'a table row longer than its columns',
    [withTable({ rows: [['First run', '1,234', '$0.10', 'Extra']] })],
    /: block 1: row 1 has 4 cells for 3 columns$/,
  ],
  [
    'a blank last cell in a table of three columns',
    [withTable({ rows: [['First run', '1,234', '']] })],
    /: block 1: row 1, column 3 is blank, and a table of three or more columns cannot show a blank cell on a phone$/,
  ],
  [
    'a table cell that is not text',
    [withTable({ rows: [['First run', 1234, '$0.10']] })],
    /: block 1: row 1, column 2 is not text$/,
  ],
  [
    'a column name used twice, in another case',
    [withTable({ columns: ['Run', 'Cost', 'cost'], rows: [['First run', '$0.10', '$0.20']] })],
    /: block 1: column 3, "cost", repeats an earlier column name$/,
  ],
  [
    'a row header used twice, in another case',
    [
      withTable({
        rows: [
          ['First run', '1,234', '$0.10'],
          ['first run', '987', '$0.08'],
        ],
      }),
    ],
    /: block 1: row 2: the row header "first run" repeats an earlier row header$/,
  ],
  [
    'a row header with two spaces in a row',
    [withTable({ rows: [['First  run', '1,234', '$0.10']] })],
    /: block 1: row 1: the row header has a space at an end or two in a row$/,
  ],
```

The defect `a block of no known kind` broke a block with `kind: 'table'`, which is now a known kind,
so it takes a kind the model never will have, since a post holds no HTML:

```ts
  [
    'a block of no known kind',
    [withBody({ kind: 'html', content: '<p>Text.</p>' })],
    /: block 1: unknown block kind "html"$/,
  ],
```

Add these four rows to the list of places in Task 2's naming defects, before its `] as const`:

```ts
      ['a table caption', { body: [tableBlock({ caption: 'What Jev measured' })] }, 'body[0].caption', 'Jev'],
      ['a table column', { body: [tableBlock({ columns: ['Run', 'TypeSafe', 'Cost'] })] }, 'body[0].columns[1]', 'TypeSafe'],
      ['a table cell', { body: [tableBlock({ rows: [['First run', 'Jev', '$0.10']] })] }, 'body[0].rows[0][1]', 'Jev'],
      ['a table row header', { body: [tableBlock({ rows: [['Jev run', '1,234', '$0.10']] })] }, 'body[0].rows[0][0]', 'Jev'],
```

Add to `accepted`:

```ts
  ['a two-column table with a blank cell', [withTable({ columns: ['Run', 'Note'], rows: [['First run', '']] })]],
  ['a table cell with | and * in it', [withTable({ rows: [['First run', 'a | b', '*']] })]],
```

In the test `hold every block kind, …`, add `table: true,` to `kinds`.

- [x] **Step 2: Write the failing render tests**

In `post-body.test.tsx`, add `case 'table': return 'DIV';` to `tagOf`, and add:

```tsx
it('renders a table with its caption, its column headers and its row headers', () => {
  renderBody();
  const block = everyBlockPost.body.find((candidate) => candidate.kind === 'table');
  if (block?.kind !== 'table') throw new Error('the every-block fixture has no table');
  const table = screen.getByRole('table', { name: block.caption });
  expect(
    within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent),
  ).toEqual(block.columns);
  // Trimmed at the end: a table of three or more columns ends each row header with a real space,
  // so the stacked line copies as the header and its first value (`data-table.tsx`).
  expect(
    within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent.trimEnd()),
  ).toEqual(block.rows.map(([header]) => header));
  // Every other cell as written, in order: `|` and `*` stay text, and nothing is added to a cell.
  expect(
    within(table)
      .getAllByRole('cell')
      .map((cell) => cell.textContent),
  ).toEqual(block.rows.flatMap(([, ...cells]) => cells));
});
```

In `post-page.test.tsx`, in the test `renders every block kind of the post, in its order`, append
`'DIV'` to the expected list, and change its comment to these two lines, since Prettier does not
wrap a comment past 100 columns:

```tsx
// One element per block: paragraph, h2, list, h3, numbered list, two code blocks, a quote,
// a table.
```

- [x] **Step 3: Run them to see them fail**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts src/components/__tests__/post-body.test.tsx src/app/blog/__tests__/post-page.test.tsx
```

Expected: FAIL. The table defects are reported as `unknown block kind "table"`, the fixtures have no
table, and no table renders.

- [x] **Step 4: Add the type**

In `apps/web/src/data/posts.ts`, after `QuoteBlock`:

```ts
/**
 * A table of plain-text cells, rendered by `components/data-table.tsx` like the site's other
 * tables. The caption names it, and the first cell of each row is that row's header (ADR 0034).
 *
 * Below 640px a table of three or more columns stacks each row: its header and first value on one
 * line, then each other value on a line of its own, with the column names hidden from sight
 * (`data-table.tsx`, #226). A reader tells the values apart by their order alone, so:
 *
 * - no cell may be blank, which `posts.test.ts` checks;
 * - each value says what it is without its column, by its unit or a word ("1,234 tokens", "$0.10",
 *   "420 ms"). Where units cannot tell two columns apart, use two-column tables, which never stack
 *   and keep their headers. No test can check this; whoever writes the table has to.
 */
export interface TableBlock {
  readonly kind: 'table';
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly [header: string, ...cells: string[]])[];
}
```

Replace the `PostBlock` line and its comment with:

```ts
/** Every block a post's body is built from; a seventh kind needs a renderer wherever posts render. */
export type PostBlock =
  HeadingBlock | ParagraphBlock | ListBlock | CodeBlock | QuoteBlock | TableBlock;
```

Add this bullet to the header comment, after the one Task 2 added:

```ts
 * - A table needs a caption, two columns or more with a name each and no name twice, one row or
 *   more, one cell per column in every row, a row header in each row and no header twice, and no
 *   blank cell when it has three columns or more. Names and headers are compared ignoring case.
 *   `TableBlock` says what such a table looks like on a phone, and what its cells must say.
```

In the last bullet, which lists what `posts.test.ts` checks, name a table's caption, column names
and row headers among the texts that have no spaces at either end or two in a row.

- [x] **Step 5: Add the fixture table**

In `apps/web/src/test/fixtures/posts.ts`, add as the last block of `everyBlockPost.body`, after the
quote:

```ts
    {
      kind: 'table',
      caption: 'Fixture: a table of three columns',
      columns: ['Fixture run', 'Blocks', 'Result'],
      rows: [
        ['First run', '9', 'Every block rendered'],
        ['Second run', '9', 'The same, with | and * in a cell'],
      ],
    },
```

In the header comment, change `a code block with a language and one without,` to
`a code block with a language and one without, a table of three columns with | and * in a cell,`.

- [x] **Step 6: Add the table rules**

In `posts.test.ts`, add `import { isWideTable } from '@/data/pages/table';` after the
`@/data/case-studies` import, so the rule stacks exactly the tables a phone stacks, and name a
table's caption, column names and row headers in `lineProblems`' doc. Then, in `blockProblems`, add
before `default:`:

```ts
    case 'table': {
      const problems = lineProblems(block.caption, `${where}: the table caption`);
      const { columns, rows }: { columns: unknown; rows: unknown } = block;
      if (!Array.isArray(columns) || columns.length < 2) {
        const count = Array.isArray(columns) ? columns.length : 0;
        problems.push(
          `${where}: the table has ${count} column${count === 1 ? '' : 's'}; it needs the row headers and a column of values`,
        );
        return problems;
      }
      // A reader moves between rows by their headers, and hears each cell with its column's name,
      // so two rows or two columns with one name could not be told apart (`data-table.test.tsx`
      // holds the site's own tables to unique row headers). Compared ignoring case, as headings and
      // tags are, since a screen reader says both alike; a blank one is reported as blank only.
      const names = new Set<string>();
      columns.forEach((column: unknown, index) => {
        const [problem] = lineProblems(column, `${where}: column ${index + 1}`);
        if (problem) {
          problems.push(problem);
          return;
        }
        const key = String(column).toLowerCase();
        if (names.has(key)) {
          problems.push(
            `${where}: column ${index + 1}, ${JSON.stringify(column)}, repeats an earlier column name`,
          );
        }
        names.add(key);
      });
      if (!Array.isArray(rows) || rows.length === 0) {
        return [...problems, `${where}: the table has no rows`];
      }
      // Below 640px a wide table draws no column names: each row is its header and first value
      // joined by a drawn " · ", then each other value on a line of its own. A blank first value
      // leaves the dot pointing at nothing, and a blank later one an empty line that shifts which
      // value a reader takes for which column. `stackable()` in `lib/serialise.ts` refuses the same
      // in the site's own tables, and `isWideTable` is the predicate both the page and it use.
      const stacks = isWideTable({ columns });
      const headers = new Set<string>();
      rows.forEach((row: unknown, index) => {
        const at = `${where}: row ${index + 1}`;
        if (!Array.isArray(row) || row.length !== columns.length) {
          problems.push(
            `${at} has ${Array.isArray(row) ? row.length : 0} cells for ${columns.length} columns`,
          );
          return;
        }
        const [headerProblem] = lineProblems(row[0], `${at}: the row header`);
        if (headerProblem) problems.push(headerProblem);
        else {
          const key = String(row[0]).toLowerCase();
          if (headers.has(key)) {
            problems.push(
              `${at}: the row header ${JSON.stringify(row[0])} repeats an earlier row header`,
            );
          }
          headers.add(key);
        }
        row.slice(1).forEach((cell: unknown, offset) => {
          const cellAt = `${at}, column ${offset + 2}`;
          if (typeof cell !== 'string') problems.push(`${cellAt} is not text`);
          else if (hasInvisible(cell)) problems.push(`${cellAt} ${INVISIBLE_PROBLEM}`);
          else if (stacks && !cell.trim()) {
            problems.push(
              `${cellAt} is blank, and a table of three or more columns cannot show a blank cell on a phone`,
            );
          }
        });
      });
      return problems;
    }
```

- [x] **Step 7: Render the table**

In `apps/web/src/components/post-body.tsx`, add `import { DataTable } from './data-table';` after
the `@/lib/links` import, and before `default:` in `Block`:

```tsx
    case 'table':
      // `DataTable` gives the caption, the column and row headers, and the stacked layout a table
      // of three or more columns takes on a phone (#226), where its column headers are hidden from
      // sight, as on every other page with a table.
      return (
        <div className="mb-6">
          <DataTable caption={block.caption} columns={block.columns} rows={block.rows} />
        </div>
      );
```

In the comment above `const unhandled: never = block;`, change `A sixth` to `A seventh`.

- [x] **Step 8: Run the tests until they pass, then typecheck**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts src/components/__tests__/post-body.test.tsx src/app/blog/__tests__/post-page.test.tsx
pnpm typecheck
```

Expected: PASS, and typecheck exits 0. `post-body.test.tsx`'s `tagOf` and `PostBody`'s
`never` default are the switches that fail typecheck if they miss the new kind.

- [x] **Step 9: Commit**

```bash
git add apps/web/src/data/posts.ts apps/web/src/test/fixtures/posts.ts apps/web/src/data/__tests__/posts.test.ts apps/web/src/components/post-body.tsx apps/web/src/components/__tests__/post-body.test.tsx apps/web/src/app/blog/__tests__/post-page.test.tsx docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(blog): add a table block to posts, rendered by DataTable"
```

---

### Task 5: P3, the table's screenshots, review and pull request

**Files:** none changed for good. The screenshots come from a scratch change.

- [x] **Step 1: Take the screenshots from a scratch change that is never committed**

No post is published, so for the screenshots the scratch post below is published in the working
tree only. In `apps/web/src/data/posts.ts`, replace `export const posts: readonly Post[] = [];`
with:

```ts
export const posts: readonly Post[] = [
  {
    slug: 'scratch-table',
    draft: false,
    kind: 'own',
    title: 'Scratch: two tables',
    summary:
      'A scratch post for screenshots of the table block in light, dark and a phone; never committed.',
    tags: [],
    publishedAt: '2026-10-06',
    updatedAt: '2026-10-06',
    body: [
      { kind: 'paragraph', content: ['A paragraph above the tables.'] },
      {
        kind: 'table',
        caption: 'Tokens per day, three columns',
        columns: ['Day', 'Tokens', 'Cost'],
        rows: [
          ['Monday', '1,234,567', '$12.34'],
          ['Tuesday', '987,654', '$9.88'],
        ],
      },
      {
        kind: 'table',
        caption: 'Two columns',
        columns: ['Setting', 'Value'],
        rows: [['Cache', 'On']],
      },
    ],
  },
];
```

```bash
pnpm --filter web build
pnpm --filter web exec next start -p 3217    # in a second shell; stop it with Ctrl-C after the screenshots
OUT="$(mktemp -d)"
pnpm --filter web exec playwright screenshot --color-scheme=light --viewport-size=1280,900 --full-page http://localhost:3217/blog/scratch-table "$OUT/table-light.png"
pnpm --filter web exec playwright screenshot --color-scheme=dark --viewport-size=1280,900 --full-page http://localhost:3217/blog/scratch-table "$OUT/table-dark.png"
pnpm --filter web exec playwright screenshot --device="Pixel 7" --full-page http://localhost:3217/blog/scratch-table "$OUT/table-mobile.png"
echo "$OUT"
```

Read each PNG. Both tables show their captions, column headers and row headers in both schemes. On
the phone, the three-column table stacks into one card per row and the two-column one does not.
Then restore the file, after checking that its diff is only the scratch post:

```bash
git diff apps/web/src/data/posts.ts
git restore apps/web/src/data/posts.ts
git status --short    # clean
```

- [x] **Step 2: Review and run the gates**

Run `ui-reviewer` on `apps/web/src/components/post-body.tsx`, then:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: exit 0 from each.

- [x] **Step 3: Open the pull request**

Tick this task's boxes in this plan and commit them on their own, since this task changes no code:

```bash
git add docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "docs(plans): tick the table block's screenshot and review steps"
```

Run `adversarial-reviewer` on `git diff origin/main...HEAD`. Then follow
`.claude/skills/open-pr/SKILL.md` with the title
`feat(blog): add a table block to posts, rendered by DataTable`. Its body cites D5 and ADR 0034,
pastes the gate output, describes the screenshots, and triages the findings.

---

### Task 6: P4, the post twin in the serialiser

**Files:**

- Modify: `apps/web/src/lib/serialise.ts`, `apps/web/src/lib/__tests__/serialise.test.ts`
- Branch: `feat/blog-markdown-twins` from `origin/main` after P3 merges.

**Interfaces:**

- Consumes: `FOOTER_LINES`, `Inline`, `PostBlock` and `PublishedPost` from `@/data/posts`; the
  fixtures as left by Tasks 2 and 4.
- Produces, from `@/lib/serialise`:
  - `postToMarkdown(post: PublishedPost): string`, which ends in one newline;
  - `postBodyToMarkdown(body: readonly PostBlock[], slug: string): string`, with no trailing
    newline;
  - `blogToMarkdown(page: PageRecord, list: readonly PublishedPost[]): string`.

The twin's layout, which Task 8 parses:

1. `# <title>`, a blank line, the summary, a blank line, then `Source: <absolute URL>`;
2. a blank line, `- Published: YYYY-MM-DD`, then `- Updated: YYYY-MM-DD`;
3. a blank line, then the body;
4. for a kind with lines: a blank line, `---`, then each line as its own paragraph.

- [x] **Step 1: Write the failing tests**

In `serialise.test.ts`:

- add `blogToMarkdown`, `postBodyToMarkdown` and `postToMarkdown` to the import from `'../serialise'`;
- import `buildPostIndex` and `type PostBlock` from `'@/data/posts'`, `pages` from `'@/data/pages'`,
  and `everyBlockPost`, `fixturePosts` and `hostileTitlePost` from `'@/test/fixtures/posts'`;
- add this at the end of the file. It writes the site's origin as the file's `ORIGIN` constant, as
  the page and case-study tests do:

`````ts
describe('postToMarkdown()', () => {
  it('writes the every-block fixture: its opening, its dates, then every block kind in order', () => {
    expect(postToMarkdown(everyBlockPost)).toBe(
      [
        '# Fixture: every block and inline kind',
        '',
        'A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.',
        '',
        `Source: ${ORIGIN}/blog/fixture-every-block`,
        '',
        '- Published: 2026-08-03',
        '- Updated: 2026-08-20',
        '',
        `A paragraph of plain text, then inline code: \`buildPostIndex(posts)\`, then a link to [the work page](${ORIGIN}/work) and one to [an external page](https://example.com/fixture?kind=link#inline).`,
        '',
        '## A level-two heading',
        '',
        '- A bullet item of plain text.',
        '- A bullet item with `inline code` in it.',
        `- [A bullet item that is a link](${ORIGIN}/blog)`,
        '',
        '### A level-three heading',
        '',
        '1. The first numbered item.',
        '2. The second numbered item.',
        '',
        '```ts',
        "const greeting = 'fixture';",
        'console.log(greeting);',
        '```',
        '',
        '```',
        'A code block with no language.',
        '```',
        '',
        '> A quotation, with `code` and plain text in it.',
        '',
        // Captioned even where a heading might name it, so a draft's `Table:` line always has a twin.
        'Table: Fixture: a table of three columns',
        '',
        '| Fixture run | Blocks | Result |',
        '| --- | --- | --- |',
        '| First run | 9 | Every block rendered |',
        '| Second run | 9 | The same, with \\| and \\* in a cell |',
        '',
      ].join('\n'),
    );
  });

  it('escapes what Markdown would read as syntax, and ends a jev post with its lines after a rule', () => {
    expect(postToMarkdown(hostileTitlePost)).toBe(
      [
        '# Fixture: & \\<tags\\> and "quotes"',
        '',
        'A test fixture whose title holds &, \\< and " and whose text holds \\*stars\\*, \\_underscores\\_ and \\<b\\>tags\\</b\\>, all of it plain text.',
        '',
        `Source: ${ORIGIN}/blog/fixture-hostile-title`,
        '',
        '- Published: 2026-09-07',
        '- Updated: 2026-09-07',
        '',
        '\\# Not a heading, \\*not emphasis\\*, \\[not a link\\](/nowhere) & \\<em\\>not markup\\</em\\>.',
        '',
        '---',
        '',
        'I have no relationship with TypeSafe.',
        '',
      ].join('\n'),
    );
  });

  it('fences code longer than its longest backtick run, and pads a code span that starts with one', () => {
    expect(
      postBodyToMarkdown(
        [
          { kind: 'code', language: 'md', code: '```ts\nconst a = `b`;\n---\n```' },
          { kind: 'paragraph', content: ['Run ', { code: '`x`' }, ' or ', { code: 'a``b' }, '.'] },
        ],
        'fixture',
      ),
    ).toBe(
      [
        '````md',
        '```ts',
        'const a = `b`;',
        '---',
        '```',
        '````',
        '',
        'Run `` `x` `` or ```a``b```.',
      ].join('\n'),
    );
  });

  it('refuses a table the page could not draw, as it refuses a page table', () => {
    expect(() =>
      postBodyToMarkdown(
        [{ kind: 'table', caption: 'One column', columns: ['Only'], rows: [['a']] }],
        'fixture',
      ),
    ).toThrow(/^serialise: the table at block 1 of fixture has one column/);
  });

  it.each<[string, PostBlock[], string]>([
    [
      'an empty heading',
      [{ kind: 'heading', level: 3, text: ' ' }],
      'serialise: the level-3 heading at block 1 of fixture is empty',
    ],
    [
      'a link to another scheme',
      [{ kind: 'paragraph', content: ['See ', { text: 'the file', href: 'ftp://example.com/a' }] }],
      'serialise: the link "ftp://example.com/a" in block 1 of fixture is neither a path on this site nor an http(s) or mailto URL',
    ],
    [
      'a link with no text in a list item',
      [{ kind: 'list', items: [['One.'], [{ text: ' ', href: '/work' }]] }],
      'serialise: the link to "/work" in item 2 of block 1 of fixture has no text',
    ],
    [
      'a block kind it has no writer for',
      [{ kind: 'video' } as unknown as PostBlock],
      'postToMarkdown: no writer for the block kind "video" at block 1 of fixture',
    ],
  ])('names the post and the block for %s', (_name, body, message) => {
    expect(() => postBodyToMarkdown(body, 'fixture')).toThrow(message);
  });

  it('names the post whose title is empty', () => {
    expect(() => postToMarkdown({ ...everyBlockPost, title: ' ' })).toThrow(
      'serialise: postToMarkdown: the title of /blog/fixture-every-block is empty',
    );
  });
});

describe('blogToMarkdown()', () => {
  it('is the record, Coming Soon card included, while no post is published', () => {
    expect(blogToMarkdown(pages['/blog'], [])).toBe(pageToMarkdown(pages['/blog']));
  });

  it('lists each published post newest first, as /blog does: title, day, URL, summary', () => {
    expect(blogToMarkdown(pages['/blog'], buildPostIndex(fixturePosts).publishedPosts)).toBe(
      [
        '# Writing',
        '',
        pages['/blog'].summary,
        '',
        `Source: ${ORIGIN}/blog`,
        '',
        '## Fixture: & \\<tags\\> and "quotes"',
        '',
        '- Published: 2026-09-07',
        `- URL: ${ORIGIN}/blog/fixture-hostile-title`,
        '',
        'A test fixture whose title holds &, \\< and " and whose text holds \\*stars\\*, \\_underscores\\_ and \\<b\\>tags\\</b\\>, all of it plain text.',
        '',
        '## Fixture: every block and inline kind',
        '',
        '- Published: 2026-08-03',
        `- URL: ${ORIGIN}/blog/fixture-every-block`,
        '',
        'A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.',
        '',
      ].join('\n'),
    );
  });

  it('names itself, and the post whose title is empty, in an error', () => {
    expect(() =>
      blogToMarkdown({ ...pages['/blog'], title: {} as unknown as PageRecord['title'] }, [
        everyBlockPost,
      ]),
    ).toThrow('blogToMarkdown: the record for /blog has no title');
    expect(() => blogToMarkdown(pages['/blog'], [{ ...everyBlockPost, title: ' ' }])).toThrow(
      'serialise: blogToMarkdown: the title of fixture-every-block is empty',
    );
  });
});
`````

- [x] **Step 2: Run them to see them fail**

```bash
pnpm --filter web exec vitest run src/lib/__tests__/serialise.test.ts
```

Expected: FAIL, because `postToMarkdown is not a function`.

- [x] **Step 3: Split `table()` so that a post can always write its caption line**

In `serialise.ts`:

1. Rename `table` to `captionedTable`, with the signature
   `function captionedTable({ caption, columns, rows }: Table, where: string): { name: string; markdown: string }`.
2. Keep its body and its doc comment. Replace its last line with `return { name, markdown };`.
3. Add after it:

```ts
/** A page table: its caption line is left out when the section's heading already names it (#58). */
function table(heading: string, content: Table, where = `the table under "${heading}"`): string {
  const { name, markdown } = captionedTable(content, where);
  return name === inline(heading) ? markdown : `Table: ${name}\n\n${markdown}`;
}
```

Change `heading`'s signature to
``function heading(level: 1 | 2 | 3, value: string, what = `a level-${level} heading`): string``,
so that a post's heading names its place in an error.

Move the title lookup out of `pageToMarkdown` into a helper, keeping its error message, and have
`pageToMarkdown` call it:

```ts
/**
 * A record's own title: the string, or the `absolute` one a record sets to skip the template.
 * `caller` names the twin's writer in an error.
 */
function titleOf(page: PageRecord, caller: string): string {
  const title = typeof page.title === 'string' ? page.title : page.title?.absolute;
  if (typeof title !== 'string') {
    throw new Error(`${caller}: the record for ${page.path} has no title`);
  }
  return title;
}
```

- [x] **Step 4: Write the post serialiser**

Add `import { FOOTER_LINES, type Inline, type PostBlock, type PublishedPost } from '@/data/posts';`
to the imports. Then add after `caseStudyToMarkdown`:

```ts
/** The longest run of backticks in `code`, so that a fence or a code span can be one longer. */
const longestBacktickRun = (code: string) =>
  Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Inline code as a code span: one backtick more than its longest run, and a space inside each end
 * when the code starts or ends with a backtick or a space, which CommonMark strips again.
 */
function codeSpan(code: string): string {
  const ticks = '`'.repeat(longestBacktickRun(code) + 1);
  const pad = /^[ `]|[ `]$/.test(code) ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/**
 * A fenced code block, whose fence is one backtick longer than the code's longest run, three at
 * least.
 */
function codeBlock(code: string, language = ''): string {
  const fence = '`'.repeat(Math.max(3, longestBacktickRun(code) + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

/**
 * A run of a post's inline pieces: text as `text()` writes it, code spans, and links; `where` names
 * the block in a link's error. It cannot reuse `inline()`, which has no code piece and collapses
 * every run of spaces in the joined line: a code span's spaces are code, and must stay as written.
 */
function postInline(content: readonly Inline[], where: string): string {
  const pieces = content.filter((piece) => piece !== '');
  return pieces
    .map((piece, index) => {
      if (typeof piece !== 'string') {
        return piece.code !== undefined ? codeSpan(piece.code) : link(piece, where);
      }
      const next = pieces[index + 1];
      // `!` right before a link's `[` would make the link an image.
      return typeof next === 'object' && next.code === undefined
        ? text(piece).replace(/!$/, '\\!')
        : text(piece);
    })
    .join('')
    .trim();
}

/** One block of a post; `where` is its place, as in `block 3 of <slug>`, for an error. */
function postBlock(content: PostBlock, where: string): string {
  switch (content.kind) {
    case 'heading':
      return heading(content.level, content.text, `the level-${content.level} heading at ${where}`);
    case 'paragraph':
      return block(nonEmpty(postInline(content.content, where), where));
    case 'list':
      return entries(content.items, where)
        .map((item, index) => {
          const marker = content.ordered ? `${index + 1}.` : '-';
          const at = `item ${index + 1} of ${where}`;
          return `${marker} ${block(nonEmpty(postInline(item, at), at))}`;
        })
        .join('\n');
    case 'code':
      return codeBlock(nonEmpty(content.code, where), content.language);
    case 'quote':
      return `> ${block(nonEmpty(postInline(content.content, where), where))}`;
    case 'table': {
      // Always captioned, even under a heading of the same words, so a draft's `Table:` line and
      // the twin's compare line for line (D6 of the publishing design).
      const { name, markdown } = captionedTable(content, `the table at ${where}`);
      return `Table: ${name}\n\n${markdown}`;
    }
    default: {
      // The types rule this out; a post cast from elsewhere must not lose a block silently.
      const unknown: never = content;
      throw new Error(
        `postToMarkdown: no writer for the block kind "${(unknown as { kind: string }).kind}" at ${where}`,
      );
    }
  }
}

/** A post's body as Markdown, block after block; `slug` names the post in an error. */
export function postBodyToMarkdown(body: readonly PostBlock[], slug: string): string {
  return blocks(
    entries(body, `the body of ${slug}`).map((content, index) =>
      postBlock(content, `block ${index + 1} of ${slug}`),
    ),
  );
}

/**
 * A post's twin (61e, ADR 0034): the opening every twin shares, the post's dates, its body, and,
 * for a kind with footer lines, a `---` rule and each line, as the page ends its article.
 * `scripts/post-draft-check.mjs` compares an approved draft with this output, and
 * `src/lib/__tests__/post-draft.test.ts` keeps the two in step.
 */
export function postToMarkdown(post: PublishedPost): string {
  const footer = FOOTER_LINES[post.kind];
  return document([
    opening(post.title, post.summary, `/blog/${post.slug}`, 'postToMarkdown'),
    `- Published: ${post.publishedAt}\n- Updated: ${post.updatedAt}`,
    postBodyToMarkdown(post.body, post.slug),
    ...(footer.length > 0
      ? ['---', ...footer.map((line) => paragraph(line, `a footer line of ${post.slug}`))]
      : []),
  ]);
}

/**
 * `/blog`'s twin. While no post is published it is the record, Coming Soon card included, as the
 * page shows. After that it lists the posts in the order given, which `publishedPosts` keeps
 * newest first, as the page does: the title as a heading, the day it was published and its URL,
 * then its summary.
 */
export function blogToMarkdown(page: PageRecord, list: readonly PublishedPost[]): string {
  if (list.length === 0) return pageToMarkdown(page);
  return document([
    opening(titleOf(page, 'blogToMarkdown'), page.summary, page.path, 'blogToMarkdown'),
    ...list.flatMap((post) => [
      heading(2, post.title, `blogToMarkdown: the title of ${post.slug}`),
      `- Published: ${post.publishedAt}\n- URL: ${absoluteUrl(`/blog/${post.slug}`)}`,
      paragraph(post.summary, `blogToMarkdown: the summary of ${post.slug}`),
    ]),
  ]);
}
```

- [x] **Step 5: Run the tests until they pass, then typecheck**

```bash
pnpm --filter web exec vitest run src/lib/__tests__/serialise.test.ts
pnpm typecheck
```

Expected: PASS, and typecheck exits 0. If an expected string differs, fix the serialiser, not the
expectation. The expectations follow D6 and the escaping rules the file's other tests pin.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/lib/serialise.ts apps/web/src/lib/__tests__/serialise.test.ts docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(web): write a post and the /blog list as Markdown twins (61e)"
```

---

### Task 7: P4, the twin routes and the gates that list them

**Files:**

- Create: `apps/web/src/app/blog/[slug]/index.md/route.ts`
- Modify: `apps/web/src/app/blog/index.md/route.ts`, `apps/web/src/app/blog/__tests__/post-page.test.tsx`,
  `apps/web/src/data/__tests__/pages.test.ts`, `apps/web/next.config.ts`,
  `apps/web/src/test/next-config.test.ts`, `apps/web/e2e/endpoints.ts`

**Interfaces:**

- Consumes: `postToMarkdown` and `blogToMarkdown` (Task 6); `postStaticParams`, `getPost` and
  `publishedPosts`.
- Produces: a static twin at `/blog/<slug>/index.md` for each published post, negotiated from
  `/blog/<slug>` by `Accept: text/markdown`.

- [x] **Step 1: Write the failing tests**

In `post-page.test.tsx`, add `import * as twin from '../[slug]/index.md/route';` beside the card
import, and `import { postToMarkdown } from '@/lib/serialise';`. Then add:

```tsx
describe('the post twin', () => {
  it('prerenders one twin per published post, and no other', async () => {
    expect(twin.dynamic).toBe('force-static');
    expect(twin.dynamicParams).toBe(false);
    // The page's list is async; the twin's, like the card's, is not.
    expect(twin.generateStaticParams()).toEqual(await generateStaticParams());
  });

  it("serves the post's Markdown, as postToMarkdown writes it", async () => {
    const response = await twin.GET(
      new Request('http://localhost/'),
      paramsOf(hostileTitlePost.slug),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(await response.text()).toBe(postToMarkdown(hostileTitlePost));
  });

  it('refuses a draft, as dynamicParams would before it', async () => {
    await expect(
      twin.GET(new Request('http://localhost/'), paramsOf(draftPost.slug)),
    ).rejects.toThrow(`unknown post ${JSON.stringify(draftPost.slug)}`);
  });
});
```

In `apps/web/src/data/__tests__/pages.test.ts`, delete:

- the `POST_FOLDER` doc comment and constant;
- the line `expect(pageFolders, 'the post page folder moved').toContain(join(APP, POST_FOLDER));`;
- the line `.filter((folder) => folder !== POST_FOLDER);`, ending the previous line with `;`;
- the test `lets the post twin wait only while no post is published (#61, 61e)`;
- the `it.fails` test `blog/[slug] (#61, 61e): has its twin handler beside it`.

The comment on `POST_FOLDER` said to remove all of these once the handler exists. In the static
handler test, replace
`expect(await response.text()).toBe(pageToMarkdown(pages[route as keyof typeof pages]));` with:

```ts
// `/blog`'s twin lists the published posts once there are any, as its page does.
const expected =
  route === '/blog'
    ? blogToMarkdown(pages['/blog'], publishedPosts)
    : pageToMarkdown(pages[route as keyof typeof pages]);
expect(await response.text()).toBe(expected);
```

Add `blogToMarkdown` to its serialiser import. Drop any import that is now unused; lint will name
it.

In `apps/web/src/test/next-config.test.ts`:

- import `publishedPosts` the way the file imports `caseStudies`;
- add to `DYNAMIC_TWIN_ROUTES`:

  ```ts
    '/blog/[slug]': () => publishedPosts.map(({ slug }) => `/blog/${slug}`),
  ```

- in the test `negotiates exactly the routes that have a twin…`, rename it to
  `negotiates exactly the routes that have a twin: the static routes, every case study and every published post`,
  and append `...publishedPosts.map(({ slug }) => `/blog/${slug}`),` to the expected list.

- [x] **Step 2: Run them to see them fail**

```bash
pnpm --filter web exec vitest run src/app/blog/__tests__/post-page.test.tsx src/data/__tests__/pages.test.ts src/test/next-config.test.ts
```

Expected: FAIL. The twin route module does not exist, so the post-page file fails to import. The
next-config list lacks the posts.

- [x] **Step 3: Add the post twin route**

Create `apps/web/src/app/blog/[slug]/index.md/route.ts`:

```ts
import { getPost, publishedPosts } from '@/data/posts';
import { postStaticParams } from '@/lib/post-static-params';
import { markdownResponse, postToMarkdown } from '@/lib/serialise';

/**
 * A post's Markdown twin (#59, 61e), prerendered for each published post like its page and its
 * card. `dynamicParams = false` makes any other slug, a draft's included, a routing-level 404.
 */
export const dynamic = 'force-static';

export const dynamicParams = false;

export function generateStaticParams() {
  return postStaticParams(publishedPosts);
}

export async function GET(_request: Request, { params }: RouteContext<'/blog/[slug]/index.md'>) {
  const { slug } = await params;
  const post = getPost(slug);
  // Unreachable while `generateStaticParams` and `getPost` read one index: `dynamicParams` 404s any
  // other slug first. If they ever drift, the prerender fails naming the slug.
  if (!post) throw new Error(`index.md: unknown post ${JSON.stringify(slug)}`);
  return markdownResponse(postToMarkdown(post));
}
```

- [x] **Step 4: Make `/blog`'s twin list the posts**

In `apps/web/src/app/blog/index.md/route.ts`, keep the comment and replace the code with:

```ts
import { pages } from '@/data/pages';
import { publishedPosts } from '@/data/posts';
import { blogToMarkdown, markdownResponse } from '@/lib/serialise';

export const dynamic = 'force-static';

export function GET() {
  return markdownResponse(blogToMarkdown(pages['/blog'], publishedPosts));
}
```

- [x] **Step 5: Negotiate the post twins**

In `apps/web/next.config.ts`, add `import { publishedPosts } from './src/data/posts';` after the
`case-studies` import. `posts.ts` imports nothing, so the rule that modules loaded by the config
import by relative path holds. Then make `MARKDOWN_ROUTES`:

```ts
export const MARKDOWN_ROUTES: readonly string[] = [
  ...Object.keys(STATIC_ROUTE_UPDATED),
  ...caseStudies.map(({ slug }) => `/work/${slug}`),
  ...publishedPosts.map(({ slug }) => `/blog/${slug}`),
];
```

In its doc comment, change `and one route per case study` to
`one route per case study and one per published post`.

In `apps/web/e2e/endpoints.ts`, import `POST_ROUTES` from `'./routes'` beside `STATIC_ROUTES`, and
append to `MARKDOWN_TWINS`:

```ts
  ...POST_ROUTES.map((route) => ({ route, twin: markdownTwinPath(route) })),
```

`e2e/markdown-twins.spec.ts` then checks each post twin's status, its type, the page's alternate link
and heading parity as soon as a post is published. While none is, it checks nothing more.

- [x] **Step 6: Run the tests until they pass, then check the build**

```bash
pnpm --filter web exec vitest run src/app/blog/__tests__/post-page.test.tsx src/data/__tests__/pages.test.ts src/test/next-config.test.ts
pnpm typecheck
pnpm --filter web build && pnpm check:build-output
```

Expected: PASS. Typecheck exits 0. `check:build-output` exits 0: the new handler prerenders, here
with no paths, as the card route does while nothing is published.

- [x] **Step 7: Commit**

```bash
git add 'apps/web/src/app/blog/[slug]/index.md/route.ts' apps/web/src/app/blog/index.md/route.ts apps/web/src/app/blog/__tests__/post-page.test.tsx apps/web/src/data/__tests__/pages.test.ts apps/web/next.config.ts apps/web/src/test/next-config.test.ts apps/web/e2e/endpoints.ts docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(web): serve each post's Markdown twin and list the posts in /blog's (61e)"
```

---

### Task 8: P4, `scripts/post-draft-check.mjs`

**Files:**

- Create: `scripts/post-draft-check.mjs`, `scripts/post-draft-check.test.mjs`

**Interfaces:**

- Consumes: the twin layout from Task 6.
- Produces, from `scripts/post-draft-check.mjs`:
  - `FOOTER_LINES`, a frozen copy of the app's;
  - `differences(draftSource: string, twinSource: string, kind: 'own' | 'jev'): string[]`;
  - `check(argv: string[], read?: (path: string) => string): { status: 0 | 1 | 2; output: string }`;
  - `CannotRun`, `parseDraft`, `parseTwin`, `splitBlocks`, `canonicalise`, `canonicalInline`,
    `inlineTokens`, `refusedSyntax` and `lineDiff`.

  The command is `node scripts/post-draft-check.mjs --kind own|jev <draft.md> <twin.md>`.

- [x] **Step 1: Write the failing tests**

Create `scripts/post-draft-check.test.mjs`:

`````js
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
`````

- [x] **Step 2: Run them to see them fail**

```bash
node --test scripts/post-draft-check.test.mjs
```

Expected: FAIL, with `Cannot find module` for `./post-draft-check.mjs`.

- [x] **Step 3: Write the check**

Create `scripts/post-draft-check.mjs`:

```js
#!/usr/bin/env node
// The publish check (D8 of docs/plans/2026-10-06-blog-publishing-design.md, ADR 0034). It compares
// an approved blog draft with the Markdown twin the site serves for the post, and fails on any
// difference in the words.
//
//   node scripts/post-draft-check.mjs --kind own|jev <draft.md> <twin.md>
//
// First it reports any syntax the post format refuses, in the draft as written. The comparison
// cannot see it: a literal `**bold**` kept in the entry is escaped by the twin and unescaped again
// here, and so is the `##` of a `> ## Results` quote whose entry holds the text `## Results`.
// Then it compares the slug, the title, the summary, the body and the footer, after undoing on both
// sides only what the serialiser does on purpose. The canonical form keeps every block's kind, and
// keeps text apart from code spans and links, so a block kind changed or a link or code span the
// entry flattened into plain text is a difference. Exit 0 when they agree, quietly; 1 with each
// difference; 2 when the check could not run, whatever stopped it. Plain Node, no dependencies.

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The lines a post of each kind ends with: a copy of `FOOTER_LINES` in
 * `apps/web/src/data/posts.ts`, which a plain script cannot import.
 * `apps/web/src/lib/__tests__/post-draft.test.ts` fails when the two differ.
 * @type {Readonly<Record<'own' | 'jev', readonly string[]>>}
 */
export const FOOTER_LINES = Object.freeze({
  own: Object.freeze([]),
  jev: Object.freeze(['I have no relationship with TypeSafe.']),
});

/** The check could not run (exit 2), as opposed to finding a difference (exit 1). */
export class CannotRun extends Error {}

/** A backslash escape of ASCII punctuation, which CommonMark reads as the character itself. */
const ESCAPE = /\\([!-/:-@[-`{-~])/g;

/** A code fence's opening line: three or more backticks or tildes, then the info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** An ATX heading: its run of `#`, then its text without the optional closing run. */
const HEADING = /^ {0,3}(#{1,6})(?: +(.*?))?(?: +#+)? *$/;

/** A list item's first line: its marker, then its text. */
const LIST_ITEM = /^ {0,3}([-*+]|\d{1,9}[.)]) +(.*)$/;

/** A thematic break: three or more `-`, `*` or `_`, with spaces between them or not. */
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;

/** A pipe table's delimiter row, with or without alignment colons and outer pipes. */
const DELIMITER_ROW = /^ {0,3}\|? *:?-+:? *(?:\| *:?-+:? *)*\|? *$/;

const USAGE = 'usage: node scripts/post-draft-check.mjs --kind own|jev <draft.md> <twin.md>\n';

/** @param {string} source */
const normalise = (source) => source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

/**
 * The fence a line opens, or null. A backtick fence's info string cannot hold a backtick, so such a
 * line is text.
 * @param {string} line
 */
function opensFence(line) {
  const match = FENCE.exec(line);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { run: match[1], info: match[2].trim() };
}

/**
 * @param {string} line
 * @param {string} fence the run that opened it
 */
function closesFence(line, fence) {
  const run = /^ {0,3}(`+|~+) *$/.exec(line)?.[1];
  return run !== undefined && run[0] === fence[0] && run.length >= fence.length;
}

/** @param {string} code */
const longestRun = (code) => Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));

/**
 * Inline code as the serialiser writes it: one backtick more than its longest run, and a space inside
 * each end when it starts or ends with a backtick or a space.
 * @param {string} code
 */
function codeSpan(code) {
  const ticks = '`'.repeat(longestRun(code) + 1);
  const pad = /^[ `]|[ `]$/.test(code) ? ' ' : '';
  return `${ticks}${pad}${code}${pad}${ticks}`;
}

/**
 * A fenced code block in the shortest backtick fence that holds it, three at least.
 * @param {string} code
 */
function codeFence(code) {
  const fence = '`'.repeat(Math.max(3, longestRun(code) + 1));
  return `${fence}\n${code}\n${fence}`;
}

/**
 * Where the first run of exactly `length` backticks at or after `from` starts, or -1.
 * @param {string} source
 * @param {number} from
 * @param {number} length
 */
function closingRun(source, from, length) {
  const runs = /`+/g;
  runs.lastIndex = from;
  for (let match = runs.exec(source); match; match = runs.exec(source)) {
    if (match[0].length === length) return match.index;
  }
  return -1;
}

/**
 * The inline link whose `[` is at `at`: its label as written, its destination with the escapes
 * removed, and the index after its `)`. Null when no link opens there. The label may hold code spans
 * and balanced brackets; the destination has no whitespace, as the serialiser writes it.
 * @param {string} source
 * @param {number} at
 * @returns {{ label: string, href: string, end: number } | null}
 */
function linkAt(source, at) {
  let depth = 0;
  let close = at + 1;
  for (; close < source.length; close += 1) {
    const char = source[close];
    if (char === '\\') {
      close += 1;
    } else if (char === '`') {
      const run = /^`+/.exec(source.slice(close))?.[0] ?? '`';
      const end = closingRun(source, close + run.length, run.length);
      close = (end === -1 ? close : end) + run.length - 1;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  if (source[close] !== ']' || source[close + 1] !== '(') return null;
  let href = '';
  let parens = 0;
  for (let index = close + 2; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\\' && /^[!-/:-@[-`{-~]$/.test(source[index + 1] ?? '')) {
      href += source[index + 1];
      index += 1;
    } else if (/\s/.test(char)) {
      return null;
    } else if (char === ')' && parens === 0) {
      return { label: source.slice(at + 1, close), href, end: index + 1 };
    } else {
      if (char === '(') parens += 1;
      if (char === ')') parens -= 1;
      href += char;
    }
  }
  return null;
}

/**
 * @typedef {{ text: string }} TextRun Text as written, its escapes kept.
 * @typedef {{ code: string }} CodeSpan
 * @typedef {{ label: Token[], href: string }} Link Its label holds text and code spans only.
 * @typedef {TextRun | CodeSpan | Link} Token
 */

/**
 * A run of inline Markdown as text, code spans and links. A backslash escape stays in its text, so
 * an escaped backtick or bracket never opens a span or a link. A backtick run with no closing run of
 * the same length is text, as is a `[` that opens no inline link, as CommonMark has it.
 * @param {string} source
 * @param {boolean} [links] false inside a link's label, which cannot hold another link
 * @returns {Token[]}
 */
export function inlineTokens(source, links = true) {
  /** @type {Token[]} */
  const tokens = [];
  let text = '';
  const flush = () => {
    if (text) tokens.push({ text });
    text = '';
  };
  let at = 0;
  while (at < source.length) {
    const char = source[at];
    const link = char === '[' && links ? linkAt(source, at) : null;
    if (char === '\\' && at + 1 < source.length) {
      text += source.slice(at, at + 2);
      at += 2;
    } else if (char === '`') {
      const run = /^`+/.exec(source.slice(at))?.[0] ?? '`';
      const close = closingRun(source, at + run.length, run.length);
      if (close === -1) {
        text += run;
        at += run.length;
      } else {
        flush();
        const code = source.slice(at + run.length, close).replace(/\n/g, ' ');
        tokens.push({ code: /^ .* $/s.test(code) && code.trim() ? code.slice(1, -1) : code });
        at = close + run.length;
      }
    } else if (link) {
      flush();
      tokens.push({ label: inlineTokens(link.label, false), href: link.href });
      at = link.end;
    } else {
      text += char;
      at += 1;
    }
  }
  flush();
  return tokens;
}

/**
 * Plain text in canonical form: runs of spaces, tabs and line breaks collapsed to one space, as the
 * serialiser's `text()` collapses them, and every backslash, backtick and bracket escaped. A
 * no-break or thin space is kept, because the page shows it. Only a real code span or link writes
 * those three bare, so text that reads like one never equals one.
 * @param {string} value
 */
const canonicalText = (value) => value.replace(/[ \t\r\n]+/g, ' ').replace(/[\\`[\]]/g, '\\$&');

/**
 * A link destination in canonical form: on the twin's origin it is the path a draft writes, and a
 * backslash or parenthesis is escaped, so that the destination ends at the first bare `)`.
 * @param {string} href
 * @param {string} origin
 */
function canonicalHref(href, origin) {
  let path = href;
  if (href === origin) path = '/';
  else if (href.startsWith(`${origin}/`)) path = href.slice(origin.length);
  return path.replace(/[\\()]/g, '\\$&');
}

/**
 * @param {Token[]} tokens
 * @param {string} origin
 * @returns {string}
 */
function canonicalTokens(tokens, origin) {
  return tokens
    .map((token) => {
      if ('code' in token) return codeSpan(token.code);
      if ('label' in token) {
        const label = canonicalTokens(token.label, origin).trim();
        return `[${label}](${canonicalHref(token.href, origin)})`;
      }
      return canonicalText(token.text.replace(ESCAPE, '$1'));
    })
    .join('');
}

/**
 * Inline Markdown in canonical form. Text has its escapes removed and is written as
 * `canonicalText()` writes it, code spans as the serialiser writes them with their content
 * untouched, and links as Markdown links, a link on the twin's origin by its path.
 * @param {string} source
 * @param {string} origin
 */
export function canonicalInline(source, origin) {
  return canonicalTokens(inlineTokens(source), origin).trim();
}

/**
 * Markdown split into blocks at blank lines, each block a list of lines. A fenced code block is kept
 * whole, whatever blank or `---` lines it holds. A fence left open runs to the end, as in CommonMark.
 * @param {string} markdown
 * @returns {string[][]}
 */
export function splitBlocks(markdown) {
  /** @type {string[][]} */
  const blocks = [];
  /** @type {string[]} */
  let current = [];
  /** @type {string | null} */
  let fence = null;
  const flush = () => {
    if (current.length) blocks.push(current);
    current = [];
  };
  for (const line of normalise(markdown).split('\n')) {
    if (fence !== null) {
      current.push(line);
      if (closesFence(line, fence)) {
        fence = null;
        flush();
      }
      continue;
    }
    const opened = opensFence(line);
    if (opened) {
      flush();
      fence = opened.run;
      current.push(line);
    } else if (!line.trim()) {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();
  return blocks;
}

/** @param {string[]} lines */
const isTable = (lines) =>
  lines.length > 1 &&
  lines[0].includes('|') &&
  lines[1].includes('|') &&
  DELIMITER_ROW.test(lines[1]);

/**
 * A pipe table row with its cells trimmed and in canonical form, or the delimiter row as `---`s.
 * @param {string} line
 * @param {boolean} delimiter
 * @param {string} origin
 */
function tableRow(line, delimiter, origin) {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = row.split(/(?<!\\)\|/).map((cell) => cell.trim());
  const shown = delimiter
    ? cells.map(() => '---')
    : cells.map((cell) => canonicalInline(cell, origin).replace(/\|/g, '\\|'));
  return `| ${shown.join(' | ')} |`;
}

/**
 * A table in canonical form, under its `Table:` caption line when it has one.
 * @param {string[]} lines the header row, the delimiter row and the body rows
 * @param {string | null} caption
 * @param {string} origin
 */
function canonicalTable(lines, caption, origin) {
  const captioned = caption === null ? [] : [`Table: ${canonicalInline(caption.slice(7), origin)}`];
  const rows = lines.map((line, index) => tableRow(line, index === 1, origin));
  return ['table:', ...captioned, ...rows].join('\n');
}

/**
 * The column where a list item's text starts: after its marker and the spaces that follow it, or
 * one space after the marker when five or more follow, which make the text indented code.
 * @param {string} line a list item's first line
 */
function itemIndent(line) {
  const match = /^( {0,3})([-*+]|\d{1,9}[.)])( +)/.exec(line);
  if (!match) return 0;
  const spaces = match[3].length;
  return match[1].length + match[2].length + (spaces > 4 ? 1 : spaces);
}

/**
 * Whether a later line of a list starts an item, as CommonMark reads it. A line indented to the
 * current item's text is inside that item, where it continues the paragraph unless it can interrupt
 * one: a bullet with text, or an ordered item from 1 (`1.`, `01.`) with text, either of which nests
 * a list. So `  1995. It was` there continues the item. A line indented less leaves the item and
 * starts an item at any list marker, whatever its number; without a marker it is a lazy
 * continuation. After an ordered item, a number with the same `.` or `)` starts the next item of
 * the same list. A marker of the other kind, such as a number after a bullet item, starts a new
 * list in CommonMark, which this check keeps in the same block; that fails safe, since
 * `canonicalList()` keeps each item's kind, so no twin's list equals it. A change of bullet
 * character, or from `.` to `)`, starts a new list as well, which this check does not see.
 * @param {string} line
 * @param {number} indent the column where the current item's text starts
 */
function startsItem(line, indent) {
  if (line.length - line.replace(/^ +/, '').length < indent) return LIST_ITEM.test(line);
  return /^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(line.slice(indent));
}

/**
 * A list with `-` for every bullet, ordered items numbered from 1, and each item's lines joined. A
 * later line starts an item only where `startsItem()` says CommonMark starts one.
 * @param {string[]} lines
 * @param {string} origin
 */
function canonicalList(lines, origin) {
  /** @type {{ ordered: boolean, text: string[] }[]} */
  const items = [];
  let indent = 0;
  for (const line of lines) {
    const item = items.length === 0 || startsItem(line, indent) ? LIST_ITEM.exec(line) : null;
    if (item) {
      items.push({ ordered: /\d/.test(item[1]), text: [item[2]] });
      indent = itemIndent(line);
    } else {
      items[items.length - 1]?.text.push(line);
    }
  }
  let number = 0;
  const shown = items.map(({ ordered, text }) => {
    const marker = ordered ? `${(number += 1)}.` : '-';
    return `${marker} ${canonicalInline(text.join('\n'), origin)}`;
  });
  return [items[0]?.ordered ? 'list ordered:' : 'list bullet:', ...shown].join('\n');
}

/**
 * One block in canonical form: a line naming its kind, then its content. A block of one kind never
 * equals a block of another, so a heading, quote or list item written as a paragraph is a
 * difference.
 * @param {string[]} lines
 * @param {string} origin
 * @returns {string}
 */
function canonicalBlock(lines, origin) {
  const [first] = lines;
  const opened = opensFence(first);
  if (opened) {
    const closed = lines.length > 1 && closesFence(lines[lines.length - 1], opened.run);
    const code = lines.slice(1, closed ? -1 : lines.length).join('\n');
    return `code${opened.info ? ` ${opened.info}` : ''}:\n${codeFence(code)}`;
  }
  if (first.startsWith('Table: ') && isTable(lines.slice(1))) {
    return canonicalTable(lines.slice(1), first, origin);
  }
  if (isTable(lines)) return canonicalTable(lines, null, origin);
  const heading = HEADING.exec(first);
  if (heading && lines.length === 1) {
    const level = heading[1].length;
    return `heading ${level}:\n${heading[1]} ${canonicalInline(heading[2] ?? '', origin)}`;
  }
  if (LIST_ITEM.test(first)) return canonicalList(lines, origin);
  if (/^ {0,3}>/.test(first)) {
    const quoted = lines.map((line) => line.replace(/^ {0,3}> ?/, '')).join('\n');
    return `quote:\n> ${canonicalInline(quoted, origin)}`;
  }
  return `paragraph:\n${canonicalInline(lines.join('\n'), origin)}`;
}

/**
 * Blocks in canonical form: the form in which the two sides are compared. A `Table:` line is its
 * table's caption whether a blank line separates them or not.
 * @param {string[][]} blocks
 * @param {string} origin
 */
export function canonicalise(blocks, origin) {
  /** @type {string[]} */
  const canonical = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const lines = blocks[index];
    const next = blocks[index + 1];
    if (lines.length === 1 && lines[0].startsWith('Table: ') && next && isTable(next)) {
      canonical.push(canonicalTable(next, lines[0], origin));
      index += 1;
    } else {
      canonical.push(canonicalBlock(lines, origin));
    }
  }
  return canonical;
}

/**
 * A front-matter value without its YAML quotes: `"…"` with its `\"` and `\\` escapes, or `'…'`
 * with its `''`. Prettier writes the single-quoted form, the writing room may write either.
 * @param {string} value
 */
function unquote(value) {
  if (/^".*"$/.test(value)) return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

/**
 * The draft's front matter and body. Front matter is flat `key: value` lines between two `---`
 * lines, the first of them the file's first line. A value may be quoted as YAML quotes it.
 * @param {string} source
 * @returns {{ front: Map<string, string>, body: string, firstBodyLine: number }}
 */
export function parseDraft(source) {
  const text = normalise(source);
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (!match)
    throw new CannotRun('the draft does not open with front matter between two --- lines');
  /** @type {Map<string, string>} */
  const front = new Map();
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const pair = /^([A-Za-z][\w-]*): *(.*)$/.exec(line);
    if (!pair)
      throw new CannotRun(`the front matter line ${JSON.stringify(line)} is not key: value`);
    front.set(pair[1], unquote(pair[2].trim()));
  }
  return { front, body: text.slice(match[0].length), firstBodyLine: match[0].split('\n').length };
}

/**
 * The served twin's parts, as `postToMarkdown` writes them: the `#` title, the summary, the
 * `Source:` line (on-site links are written on its origin, and its last path segment is the slug),
 * the Published and Updated lines, the body, and the footer lines that follow the last `---` rule
 * outside a code block.
 * @param {string} source
 */
export function parseTwin(source) {
  const [title, summary, sourceLine, dates, ...rest] = splitBlocks(source);
  const heading = title?.length === 1 ? /^# (.+)$/.exec(title[0]) : null;
  const url = sourceLine?.length === 1 ? /^Source: (https?:\/\/\S+)$/.exec(sourceLine[0]) : null;
  if (!heading || !summary || !url) {
    throw new CannotRun('the twin does not open with a # title, a summary and a Source: line');
  }
  if (
    dates?.length !== 2 ||
    !/^- Published: \d{4}-\d{2}-\d{2}$/.test(dates[0]) ||
    !/^- Updated: \d{4}-\d{2}-\d{2}$/.test(dates[1])
  ) {
    throw new CannotRun('the twin has no Published and Updated lines after its Source line');
  }
  let page;
  try {
    page = new URL(url[1]);
  } catch {
    throw new CannotRun(`the twin's Source line names no URL: ${url[1]}`);
  }
  const rule = rest.map((block) => block.length === 1 && block[0] === '---').lastIndexOf(true);
  return {
    origin: page.origin,
    slug: page.pathname.slice(page.pathname.lastIndexOf('/') + 1),
    title: heading[1],
    summary: summary.join('\n'),
    body: rule === -1 ? rest : rest.slice(0, rule),
    footer: rule === -1 ? [] : rest.slice(rule + 1).map((block) => block.join('\n')),
  };
}

/** @type {[RegExp, string][]} */
const REFUSED_LINES = [
  [/^ {0,3}#(?: |$)/, 'a level-1 heading: the title, in the front matter, is the only one'],
  [/^ {0,3}#{4,6}(?: |$)/, 'a heading below level 3'],
  // After any `>` and list markers too: a definition in a quote or a list item still defines the
  // label, and turns a `[label]` anywhere in the post into a link.
  [
    /^ {0,3}(?:(?:>|[-*+] |\d{1,9}[.)] ) *)*\[[^\]]+\]:/,
    'a reference-style link definition or a footnote',
  ],
  // Only a line that can interrupt the item's paragraph nests a list: see `startsItem()`.
  [/^ {2,}(?:[-*+]|0*1[.)]) +\S/, 'a nested list'],
  [/^ {0,3}> *$/, 'an empty quote line, which makes a quote of more than one paragraph'],
  [/^ *\t/, 'a line indented with a tab; indent with spaces'],
  // A tab anywhere else: CommonMark reads `-\tItem` as a list item, and the diff would show a
  // tab in a code span as a space. A fence keeps its tabs.
  [/^ *[^ \t].*\t/, 'a tab; write a space, or put the text in a code fence'],
];

/** @type {[RegExp, string][]} */
const REFUSED_INLINE = [
  [/!\[/, 'an image'],
  // An email autolink's address may start with a digit or a mark: `<2026@example.com>`.
  [/<(?:[A-Za-z!?/]|[\w.!#$%&'*+/=?^`{|}~-]+@)/, 'raw HTML, an HTML comment or an autolink'],
  [/\[\^/, 'a footnote'],
  [/\]\[/, 'a reference-style link'],
  [/\*/, 'an emphasis marker *; write \\* for the character'],
  [/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/u, 'an emphasis marker _; write \\_ for the character'],
  [/~~/, 'strikethrough'],
  [
    /&(?:#\d+|#[Xx][\dA-Fa-f]+|[A-Za-z][\dA-Za-z]*);/,
    'an entity reference; write the character itself, or \\& for an ampersand',
  ],
];

/** @typedef {'heading' | 'list' | 'quote' | 'caption' | 'table' | 'paragraph' | 'code'} BlockKind */

/**
 * The kind of block a line opens after a blank line, as `canonicalBlock` reads it.
 * @param {string} line
 * @param {string} next the line after it
 * @returns {BlockKind}
 */
function blockKind(line, next) {
  if (HEADING.test(line)) return 'heading';
  if (LIST_ITEM.test(line)) return 'list';
  if (/^ {0,3}>/.test(line)) return 'quote';
  if (line.startsWith('Table: ') && next.includes('|')) return 'caption';
  if (isTable([line, next])) return 'table';
  return 'paragraph';
}

/**
 * Whether `line` may follow a line of `block` with no blank line between them. Nothing follows a
 * heading or a closing fence. A paragraph's next line must not start a block of its own: a heading,
 * a list item (an ordered one only from 1, as CommonMark has it), a quote, a fence or a table row.
 * A list's next item, a quote's next `>` line and a table's next row continue them.
 * @param {BlockKind} block
 * @param {string} line
 */
function continues(block, line) {
  if (block === 'heading' || block === 'code' || opensFence(line)) return false;
  if (HEADING.test(line)) return false;
  if (/^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(line)) return block === 'list';
  if (/^ {0,3}>/.test(line)) return block === 'quote';
  if (/^ {0,3}\|/.test(line) || (line.includes('|') && DELIMITER_ROW.test(line))) {
    return block === 'table' || block === 'caption';
  }
  return true;
}

/**
 * The block that `content` opens inside a list item or quote, or null. `content` is a list item's
 * text after its marker and one space, or a quote line's after its `>` and one space. The entry
 * holds such syntax as text and the twin escapes its first mark, so the two bodies agree and only
 * this refusal catches it. A quote's later lines continue its paragraph, as CommonMark has it: a
 * `---` or `===` line makes the paragraph a setext heading, a delimiter row makes its last line a
 * table's header (GFM), and only a bullet or an item from 1 (`1.`, `01.`) with text starts a list,
 * so `> 1995. It was` stays text there.
 * @param {string} content
 * @param {boolean} first whether `content` starts the item or quote
 * @returns {string | null}
 */
function nestedBlock(content, first) {
  if (HEADING.test(content)) return 'a heading';
  if (/^ {0,3}>/.test(content)) return 'a quote';
  if (opensFence(content)) return 'a code fence';
  if (!first && /^ {0,3}(?:=+|-+) *$/.test(content)) return 'a setext heading underline';
  if (!first && content.includes('|') && DELIMITER_ROW.test(content)) return 'a table';
  if (RULE.test(content)) return 'a --- rule';
  if (
    first
      ? /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?: |$)/.test(content)
      : /^ {0,3}(?:[-*+]|0*1[.)]) +\S/.test(content)
  ) {
    return 'a list';
  }
  if (first && /^ {4,}\S/.test(content)) return 'indented code';
  return null;
}

/**
 * Running text as the refusals read it: escapes dropped, a code span as a space, and a link as its
 * label in brackets, or as a space when `labels` is false.
 * @param {Token[]} tokens
 * @param {boolean} labels
 * @returns {string}
 */
function prose(tokens, labels) {
  return tokens
    .map((token) => {
      if ('code' in token) return ' ';
      if ('label' in token) return labels ? `[${prose(token.label, true)}]` : ' ';
      return token.text.replace(ESCAPE, '');
    })
    .join('');
}

/**
 * Running text or a link's label as written, its escapes kept and each code span or link a space,
 * for reading it again for links. `prose()` drops each escape whole, which would read `[b]\!(c)` as
 * a link.
 * @param {Token[]} tokens
 */
const written = (tokens) => tokens.map((token) => ('text' in token ? token.text : ' ')).join('');

/**
 * The refused inline syntax in one run of text: a heading, a table row or caption, or the lines of a
 * paragraph, list item or quote joined, so a code span or link wrapped onto the next line is read
 * whole. Code spans, escapes and link destinations are left alone.
 * @param {string} source
 * @param {string} at where the run is, for the messages
 * @param {BlockKind} block
 * @returns {string[]}
 */
function refusedInline(source, at, block) {
  /** @type {string[]} */
  const problems = [];
  const tokens = inlineTokens(source);
  if (tokens.some((token) => !('text' in token))) {
    if (block === 'heading') problems.push(`${at}: a heading is plain text: no code or links`);
    if (block === 'caption' || block === 'table') {
      problems.push(`${at}: a table's caption and cells are plain text: no code or links`);
    }
  }
  const labels = tokens.flatMap((token) => ('label' in token ? [token.label] : []));
  if (labels.some((label) => label.some((token) => 'code' in token))) {
    problems.push(`${at}: link text is plain text: no code`);
  }
  // Each label read again with links allowed, so a link inside it is a link token.
  const reread = labels.map((label) => inlineTokens(written(label)));
  if (reread.some((label) => label.some((token) => 'label' in token))) {
    problems.push(`${at}: a link inside a link's text`);
  }
  // A `](` that `linkAt()` did not take, as with a title or a space around the destination, stays
  // text on both sides, while CommonMark makes it a link. An escaped `\]` is text.
  if ([tokens, ...reread].some((run) => /(?<!\\)(?:\\\\)*\]\(/.test(written(run)))) {
    problems.push(
      `${at}: a link title or spaces around a link's destination; the post format has neither`,
    );
  }
  const text = prose(tokens, true);
  for (const [pattern, what] of REFUSED_INLINE) {
    if (pattern.test(text)) problems.push(`${at}: ${what}`);
  }
  // GFM links a bare `www.` address too, after a space, `(`, a bracket or an emphasis mark.
  if (/https?:\/\/|(?:^|[\s*_~([\]])www\.[\p{L}\p{N}_-]/iu.test(prose(tokens, false))) {
    problems.push(`${at}: a bare URL, which GFM makes a link; write it as a link or as code`);
  }
  // And a bare email address; one inside `<…>` is an autolink, reported above.
  if (/(?<![<\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(prose(tokens, false))) {
    problems.push(`${at}: an email address, which GFM makes a link; write it as a link or as code`);
  }
  return problems;
}

/**
 * Every use of syntax the post format refuses, in the draft's body as written, by line. Code is
 * left alone: fenced blocks entirely, and code spans, escapes and link destinations in running text.
 * @param {string} body
 * @param {number} [firstLine] the draft's line number for the body's first line
 * @returns {string[]}
 */
export function refusedSyntax(body, firstLine = 1) {
  /** @type {string[]} */
  const problems = [];
  const lines = body.split('\n');
  /** @type {string | null} */
  let fence = null;
  /** @type {BlockKind | null} the block the line above belongs to; null after a blank line */
  let block = null;
  /** @type {{ kind: BlockKind, from: number, to: number, text: string[] } | null} */
  let run = null;
  /** whether the list item or quote the line belongs to already has a block refused inside it */
  let nested = false;
  /** the column where the current list item's text starts, for `startsItem()` */
  let indent = 0;
  const endRun = () => {
    if (run) {
      const [from, to] = [firstLine + run.from, firstLine + run.to];
      const at = from === to ? `line ${from}` : `lines ${from}-${to}`;
      problems.push(...refusedInline(run.text.join('\n'), at, run.kind));
    }
    run = null;
  };
  lines.forEach((line, index) => {
    const at = `line ${firstLine + index}`;
    if (fence !== null) {
      if (closesFence(line, fence)) {
        fence = null;
        block = 'code';
      }
      return;
    }
    if (!line.trim()) {
      // A blank line is read before `REFUSED_LINES`: refuse its tab here, as the front matter does.
      if (line.includes('\t')) problems.push(`${at}: a tab on a blank line; leave the line empty`);
      endRun();
      block = null;
      return;
    }
    const previous = lines[index - 1] ?? '';
    const next = lines[index + 1] ?? '';
    if (block !== null && !continues(block, line)) {
      problems.push(`${at}: start each block after a blank line`);
      block = null;
    }
    const opened = opensFence(line);
    if (opened) {
      endRun();
      fence = opened.run;
      return;
    }
    const opening = block === null;
    if (block === null) {
      endRun();
      block = blockKind(line, next);
      const start = /^ {0,3}(\d{1,9})[.)] /.exec(line)?.[1];
      if (block === 'list' && start !== undefined && Number(start) !== 1) {
        problems.push(`${at}: an ordered list that starts at ${start}; the page numbers it from 1`);
      }
    } else if (block === 'caption') {
      block = 'table';
    }
    for (const [pattern, what] of REFUSED_LINES) {
      if (pattern.test(line)) problems.push(`${at}: ${what}`);
    }
    if (/^ {0,3}(?:=+|-+) *$/.test(line) && previous.trim()) {
      problems.push(
        `${at}: a setext heading underline; write ## or ### before the heading instead`,
      );
    } else if (RULE.test(line)) {
      problems.push(`${at}: a --- rule; the site adds the footer's rule itself`);
    }
    if (/^ {2,}\S/.test(line) && !previous.trim()) {
      problems.push(
        `${at}: an indented block: a second paragraph in a list item, or code without a fence`,
      );
    }
    if (/(?: {2,}|\\)$/.test(line) && next.trim()) problems.push(`${at}: a hard line break`);
    const item =
      block === 'list' && (opening || startsItem(line, indent)) ? LIST_ITEM.exec(line) : null;
    if (item) indent = itemIndent(line);
    // GFM renders an item opening with `[ ]`, `[x]` or `[X]` as a checkbox, which a post has not.
    if (item && /^\[[ xX]\](?: |$)/.test(item[2])) {
      problems.push(
        `${at}: a task list item, which GFM renders as a checkbox; escape the bracket as \\[`,
      );
    }
    if (item || (block === 'quote' && /^ {0,3}>/.test(line))) {
      if (item || opening) nested = false;
      // A whole line of `- ---` is a rule, reported above, rather than a list item holding one.
      const content = item
        ? line.replace(/^ {0,3}(?:[-*+]|\d{1,9}[.)]) /, '')
        : line.replace(/^ {0,3}> ?/, '');
      const what =
        nested || RULE.test(line) ? null : nestedBlock(content, Boolean(item) || opening);
      if (what) {
        problems.push(`${at}: ${what} inside a ${item ? 'list item' : 'quote'}`);
        nested = true;
      }
    }
    if (block === 'heading' || block === 'caption' || block === 'table' || item) endRun();
    const text = item ? item[2] : block === 'quote' ? line.replace(/^ {0,3}> ?/, '') : line;
    if (run) {
      run.to = index;
      run.text.push(text);
    } else {
      run = { kind: block, from: index, to: index, text: [text] };
    }
    if (block === 'heading' || block === 'caption' || block === 'table') endRun();
  });
  endRun();
  if (fence !== null) problems.push(`the code fence opened with ${fence} is never closed`);
  return problems;
}

/** A character that prints as a space and is not one, such as a no-break space or a thin space. */
const SPACE_LIKE = /(?! )\p{Zs}/u;

/**
 * The `?` line that goes under a changed line holding a character that prints as a space and is
 * not one, as Python's difflib marks a line: a `^` under each such character, a tab kept as a tab
 * so the marks stay in their columns, then the characters' code points. Null for a line without
 * one. Without it, a no-break space against a space shows as two identical lines.
 * @param {string} line
 * @returns {string | null}
 */
function spaceGuide(line) {
  const chars = Array.from(line);
  const marked = [...new Set(chars.filter((char) => SPACE_LIKE.test(char)))];
  if (marked.length === 0) return null;
  const guide = chars.map((char) => {
    if (char === '\t') return '\t';
    return SPACE_LIKE.test(char) ? '^' : ' ';
  });
  const names = marked.map(
    (char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`,
  );
  return `? ${guide.join('').trimEnd()} ${names.join(', ')}`;
}

/**
 * A line diff of `a` against `b`, as `-` and `+` lines with two lines of context, or '' when they
 * are equal. A changed line holding a character that prints as a space and is not one is followed
 * by its `spaceGuide()`.
 * @param {string[]} a
 * @param {string[]} b
 */
export function lineDiff(a, b) {
  const common = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[i][j] =
        a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  /** @type {[' ' | '-' | '+', string][]} */
  const steps = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      steps.push([' ', a[i]]);
      i += 1;
      j += 1;
    } else if (i < a.length && (j === b.length || common[i + 1][j] >= common[i][j + 1])) {
      steps.push(['-', a[i]]);
      i += 1;
    } else {
      steps.push(['+', b[j]]);
      j += 1;
    }
  }
  const changed = steps.map(([mark]) => mark !== ' ');
  if (!changed.includes(true)) return '';
  return steps
    .filter((_, index) => changed.slice(Math.max(0, index - 2), index + 3).includes(true))
    .flatMap(([mark, line]) => {
      const guide = mark === ' ' ? null : spaceGuide(line);
      return guide === null ? [`${mark} ${line}`] : [`${mark} ${line}`, guide];
    })
    .join('\n');
}

/**
 * Every way the twin differs from the approved draft, and every use of refused syntax in the draft.
 * None when the twin serves the approved words. Front-matter values are plain text, as the entry's
 * strings are, so they are compared as text runs.
 * @param {string} draftSource
 * @param {string} twinSource
 * @param {'own' | 'jev'} kind
 * @returns {string[]}
 */
export function differences(draftSource, twinSource, kind) {
  const draft = parseDraft(draftSource);
  const twin = parseTwin(twinSource);
  const [title, slug, description] = ['title', 'slug', 'description'].map((key) =>
    draft.front.get(key),
  );
  if (!title || !slug || !description) {
    throw new CannotRun('the front matter needs a title, a slug and a description');
  }
  const problems = normalise(draftSource)
    .split('\n')
    .slice(0, draft.firstBodyLine - 1)
    .flatMap((line, index) =>
      line.includes('\t') ? [`line ${index + 1}: a tab in the front matter; write a space`] : [],
    );
  problems.push(...refusedSyntax(draft.body, draft.firstBodyLine));
  /** @param {string} value */
  const plain = (value) => canonicalText(value).trim();
  /** @type {[string, string, string][]} */
  const fields = [
    ['slug', slug, twin.slug],
    ['title', plain(title), canonicalInline(twin.title, twin.origin)],
    ['summary', plain(description), canonicalInline(twin.summary, twin.origin)],
  ];
  for (const [what, want, got] of fields) {
    if (want !== got) {
      problems.push(`the ${what} differs (- draft, + twin):\n${lineDiff([want], [got])}`);
    }
  }
  const body = lineDiff(
    canonicalise(splitBlocks(draft.body), twin.origin).join('\n\n').split('\n'),
    canonicalise(twin.body, twin.origin).join('\n\n').split('\n'),
  );
  if (body) problems.push(`the body differs (- draft, + twin):\n${body}`);
  const footer = twin.footer.map((line) => canonicalInline(line, twin.origin));
  const expected = FOOTER_LINES[kind];
  if (JSON.stringify(footer) !== JSON.stringify(expected.map(plain))) {
    problems.push(
      `the footer is ${JSON.stringify(footer)}, but a post of kind ${kind} ends with ${JSON.stringify(expected)}`,
    );
  }
  return problems;
}

/**
 * The check as a command: its exit status and what it prints. Exit 1 means differences and nothing
 * else, so every error, an unreadable file as much as a bug, exits 2 with its message.
 * @param {string[]} argv the arguments after the script's path
 * @param {(path: string) => string} [read]
 * @returns {{ status: 0 | 1 | 2, output: string }}
 */
export function check(argv, read = (path) => readFileSync(path, 'utf8')) {
  const at = argv.indexOf('--kind');
  const kind = at === -1 ? undefined : argv[at + 1];
  const files = at === -1 ? argv : argv.filter((_, index) => index !== at && index !== at + 1);
  if ((kind !== 'own' && kind !== 'jev') || files.length !== 2) return { status: 2, output: USAGE };
  try {
    const problems = differences(read(files[0]), read(files[1]), kind);
    return problems.length === 0
      ? { status: 0, output: '' }
      : { status: 1, output: `${problems.join('\n\n')}\n` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 2, output: `post-draft-check: ${message}\n` };
  }
}

function main() {
  const { status, output } = check(process.argv.slice(2));
  if (output) (status === 2 ? process.stderr : process.stdout).write(output);
  process.exitCode = status;
}

/**
 * True when Node started this file, not when a test imported it. `realpathSync` for the reason
 * check-allowbuilds-drift.mjs documents: Node resolves `import.meta.url` and leaves
 * `process.argv[1]` as typed, so a path through a symlinked directory would otherwise skip `main()`
 * and exit 0 in silence. Nothing catches what `realpathSync` throws, for the same reason.
 *
 * @returns {boolean}
 */
function startedAsCommand() {
  if (!process.argv[1]) return false;
  return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
}

if (startedAsCommand()) main();
```

The guard's code is the one `scripts/check-webserver-log.mjs` uses, so the scripts share one guard.

- [x] **Step 4: Run the tests until they pass, then typecheck**

```bash
node --test scripts/post-draft-check.test.mjs
pnpm test:scripts
pnpm typecheck
```

Expected: every test passes. `typecheck` exits 0, because `turbo typecheck` covers `@repo/scripts`
with `checkJs` strict. When a case fails, change the check, not the case: each case is a behaviour
the design names.

- [x] **Step 5: Commit**

```bash
git add scripts/post-draft-check.mjs scripts/post-draft-check.test.mjs docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(scripts): compare an approved blog draft with its served twin"
```

---

### Task 9: P4, the round trip, the rule pointers and P4's pull request

**Files:**

- Create: `apps/web/src/test/fixtures/post-draft.md`, `apps/web/src/lib/__tests__/post-draft.test.ts`
- Modify: `.prettierignore`, `.claude/rules/app-router-and-content.md`,
  `.claude/rules/ci-and-scripts.md`, `docs/plans/2026-09-28-blog-engine-plan.md` (61e's boxes),
  `docs/plans/README.md`, `docs/plans/2026-10-06-blog-publishing-plan.md` (this plan's boxes)

**Interfaces:**

- Consumes: `postToMarkdown` (Task 6); `differences` and `FOOTER_LINES` from the check (Task 8).

- [ ] **Step 1: Keep Prettier away from the fixture draft**

The fixture deliberately uses the variant syntax that the check canonicalises: `*` markers, `1.` for
every item, a `~~~` fence, a wrapped paragraph, a padded table and alignment colons. Prettier would
rewrite all of it. Before creating the file, add this to `.prettierignore` under `# Generated`:

```
# Written in variant Markdown on purpose: the publish check's round-trip test reads it as it is.
apps/web/src/test/fixtures/post-draft.md
```

- [ ] **Step 2: Write the fixture draft**

Create `apps/web/src/test/fixtures/post-draft.md`. It is the approved draft that the every-block
fixture would have come from. Copy it byte for byte: this plan marks the block `text` only so that
Prettier leaves the plan's copy alone.

````text
---
title: "Fixture: every block and inline kind"
slug: fixture-every-block
description: A test fixture that uses each block kind and each inline kind once or more, so a renderer that drops one is caught.
date: 2026-08-03
---

A paragraph of plain text, then inline code: `buildPostIndex(posts)`, then a link to
[the work page](/work) and one to [an external page](https://example.com/fixture?kind=link#inline).

## A level-two heading

* A bullet item of plain text.
* A bullet item with `inline code` in it.
* [A bullet item that is a link](/blog)

### A level-three heading

1. The first numbered item.
1. The second numbered item.

~~~ts
const greeting = 'fixture';
console.log(greeting);
~~~

```
A code block with no language.
```

> A quotation, with `code` and plain text in it.

Table: Fixture: a table of three columns
| Fixture run | Blocks | Result                             |
| :---------- | -----: | ---------------------------------- |
| First run   | 9      | Every block rendered               |
| Second run  | 9      | The same, with \| and \* in a cell |
````

Check that the hook left it alone:

```bash
grep -c '^\* \|^~~~\|^1\. ' apps/web/src/test/fixtures/post-draft.md
```

Expected: `7` (three `*` bullets, two `~~~` lines and two `1.` items). A lower count means Prettier
rewrote the file: check the `.prettierignore` entry from Step 1, then write the file again.

- [ ] **Step 3: Write the round-trip test**

Create `apps/web/src/lib/__tests__/post-draft.test.ts`:

```ts
/**
 * @vitest-environment node
 *
 * The publish check against the serialiser it reads (ADR 0034). The fixture draft is the approved
 * draft the every-block fixture would come from, written in the variant Markdown a draft may use. A
 * change to how `postToMarkdown` escapes or lays out a block fails here, in CI, rather than at the
 * next publish.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FOOTER_LINES } from '@/data/posts';
import { everyBlockPost } from '@/test/fixtures/posts';
// A plain script at the repository root, outside the app: imported by path, as no package exports it.
import {
  FOOTER_LINES as CHECKED_FOOTER_LINES,
  differences,
} from '../../../../../scripts/post-draft-check.mjs';
import { postToMarkdown } from '../serialise';

const draft = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'post-draft.md'),
  'utf8',
);

describe('the publish check, against the serialiser', () => {
  it("finds no difference between the fixture draft and the every-block fixture's twin", () => {
    expect(differences(draft, postToMarkdown(everyBlockPost), 'own')).toEqual([]);
  });

  it('accepts the same post as jev with its footer, and refuses that footer for own', () => {
    const twin = postToMarkdown({ ...everyBlockPost, kind: 'jev' });
    expect(differences(draft, twin, 'jev')).toEqual([]);
    expect(differences(draft, twin, 'own')).toEqual([expect.stringMatching(/^the footer is /)]);
  });

  it("keeps the check's copy of the footer lines equal to the site's", () => {
    expect(CHECKED_FOOTER_LINES).toEqual(FOOTER_LINES);
  });
});
```

- [ ] **Step 4: Run it**

```bash
pnpm --filter web exec vitest run src/lib/__tests__/post-draft.test.ts
pnpm typecheck
```

Expected: PASS, and typecheck exits 0 (`apps/web` sets `allowJs`). If the first test reports a body
difference, the diff names the line. Fix whichever side breaks the design's format, and never edit
the fixture to match a serialiser bug.

- [ ] **Step 5: Point the rules at the format and the check**

In `.claude/rules/app-router-and-content.md`, in the bullet on the Markdown twins (#59), change
``and `work/[slug]/index.md/route.ts` for the case studies`` to
`` `work/[slug]/index.md/route.ts` for the case studies and `blog/[slug]/index.md/route.ts` for the published posts (61e) ``.
Add this paragraph after that bullet list:

```markdown
A post's twin is written by `postToMarkdown()`: the opening, the dates, the body, then `---` and the
kind's `FOOTER_LINES`. `/blog`'s twin is written by `blogToMarkdown()`, which lists the published
posts once there are any. The post format an approved draft must follow, and the publish check
(`scripts/post-draft-check.mjs`) that compares the draft with the served twin, are in
`docs/plans/2026-10-06-blog-publishing-design.md`. That document is the contract the writing room's
publish mode reads (ADR 0034). A change to how a post block is written there must keep
`src/lib/__tests__/post-draft.test.ts` green.
```

In `.claude/rules/ci-and-scripts.md`, in the list of `scripts/` sources, add after
`` `check-webserver-log.mjs` (the `e2e` job's server-log check), ``:
`` `post-draft-check.mjs` (the publish check for a blog post, run by hand when a post is published, not in CI), ``.
Add a row to its command table, in the shape of its neighbours:
`` `node scripts/post-draft-check.mjs --kind own\|jev <draft.md> <twin.md>` `` | `Compares an approved draft with the post's served twin: 0 equal, 1 differences, 2 could not run`.

- [ ] **Step 6: Tick the boxes and update the index**

- In `docs/plans/2026-09-28-blog-engine-plan.md`, tick Task 5's steps (61e). Its Step 3 is met by
  `e2e/markdown-twins.spec.ts`, through the new `MARKDOWN_TWINS` entries, so add a note saying so.
- In this plan, tick this task's steps (Tasks 6 to 8 ticked their own in their commits).
- In `docs/plans/README.md`, update the blog-engine plan row's notes to name this pull request
  for 61e.

```bash
node scripts/check-docs-drift.ts --skip-requires admin
```

Expected: `0 drift, 0 uncatalogued`. Give any new link an entry in `docs/drift-manifest.json`: `method` `file-line`, `evaluation`
`live`, `covers` naming the link token, and `check.path` the file it resolves to.

- [ ] **Step 7: Run every gate, one at a time**

```bash
pnpm check:allowbuilds
pnpm test:scripts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web build && CI=true pnpm --filter web test:e2e
```

Expected: exit 0 from each. The e2e run covers the twins of the static routes and the case studies.
No post is published, so it checks no post twin yet.

- [ ] **Step 8: Commit, review and open the pull request**

```bash
git add .prettierignore apps/web/src/test/fixtures/post-draft.md apps/web/src/lib/__tests__/post-draft.test.ts .claude/rules/app-router-and-content.md .claude/rules/ci-and-scripts.md docs/plans/2026-09-28-blog-engine-plan.md docs/plans/2026-10-06-blog-publishing-plan.md docs/plans/README.md docs/drift-manifest.json
git commit -m "test(web): tie the publish check to the serialiser with a fixture draft"
```

Run `adversarial-reviewer` on `git diff origin/main...HEAD`, and `edge-case-hunter` on
`scripts/post-draft-check.mjs` and the serialiser changes. Then follow
`.claude/skills/open-pr/SKILL.md` with the title
`feat(web): serve post Markdown twins and add the blog publish check (61e)`. Its body:

- uses `Refs #61`, not a closing keyword: 61f is still open;
- cites D6 to D8;
- pastes every gate's output;
- triages the findings.

---

### Task 10: P5, publish article 01

Only when all of these hold:

- P4 has merged;
- the owner has approved article 01 in the writing room;
- the writing room's publish mode has been updated to the format and branch above.

**Files:**

- Modify: `apps/web/src/data/posts.ts`, `apps/web/src/data/static-routes.ts`, `docs/plans/README.md`
  (this design's and this plan's rows), `docs/plans/2026-10-06-blog-publishing-plan.md` (this
  task's boxes)
- Branch: `feat/blog-01-<slug>` from `origin/main`, where `<slug>` is the slug in the approved draft's
  front matter.

**Interfaces:**

- Consumes: the post format (design); `kind` from the tracker; `post-draft-check.mjs`.
- Produces: the first published post. `hasPublishedPosts` turns true, so:
  - `/blog` is indexed and lists the post;
  - the sitemap gains `/blog` and the post;
  - every page advertises the feed.

- [ ] **Step 1: Read the approved draft and its tracker row**

Read the approved `draft.md` and the tracker's `kind` for article 01. Copy nothing into this
repository but the post itself. No writing-room path, note or source goes into a commit or the pull
request body.

- [ ] **Step 2: Write the entry**

Add the post to `posts` in `apps/web/src/data/posts.ts`, mapping each part as the design's format
tables say:

- `draft: false`;
- `kind` from the tracker;
- `title`, and `metaTitle` exactly as the front matter gives it (required when the served title
  would pass 60 characters);
- `summary` from `description`;
- `tags` if the front matter gives any;
- `publishedAt` and `updatedAt`, both set to today as a UTC day, `date -u +%F`, the day the pull
  request opens (D9);
- `body` block by block. Write the text as plain strings, never escaped: the serialiser escapes.

Set `STATIC_ROUTE_UPDATED['/blog']` in `apps/web/src/data/static-routes.ts` to the same day.

- [ ] **Step 3: Run the post checker**

```bash
pnpm --filter web exec vitest run src/data/__tests__/posts.test.ts
```

Expected: PASS. A failure names the rule, for example a Jev name in an `own` post, a summary length
or a heading order. Fix the entry. If the draft itself breaks a rule, stop: the fix belongs in the
writing room, approved by the owner.

- [ ] **Step 4: Serve the twin, run the publish check and take the screenshots**

Fill in the first three lines, save the block as a script outside the repository, and run it with
`bash` (it ends with `exit`, so do not paste it into an interactive shell). It builds, starts
`next start` on the first free port from 3217, waits until the server answers (or stops waiting
when it exits), and fetches the twin. A failed build or an empty or failed fetch exits 2, as the
check could not run. It runs the check and, when the check passes, takes the screenshots. Its `trap`
stops the server and removes the twin and the server log however it exits, so a rerun after any fix
rebuilds and starts a fresh server.

```bash
SLUG='<slug>'
KIND='<kind>'
DRAFT='<path to the approved draft.md>'
pnpm --filter web build || exit 2
PORT=3217
while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done
TWIN="$(mktemp)"
LOG="$(mktemp)"
(cd apps/web && exec node_modules/.bin/next start -p "$PORT") >"$LOG" 2>&1 &
SERVER=$!
trap 'kill "$SERVER" 2>/dev/null; wait "$SERVER" 2>/dev/null; rm -f "$TWIN" "$LOG"' EXIT
for _ in $(seq 60); do
  curl -fs -o /dev/null "http://localhost:$PORT/blog" && break
  kill -0 "$SERVER" 2>/dev/null || break
  sleep 1
done
curl -fsS "http://localhost:$PORT/blog/$SLUG/index.md" -o "$TWIN" && test -s "$TWIN" || {
  cat "$LOG"
  exit 2
}
node scripts/post-draft-check.mjs --kind "$KIND" "$DRAFT" "$TWIN"
STATUS=$?
echo "publish check: exit $STATUS"
if [ "$STATUS" -eq 0 ]; then
  OUT="$(mktemp -d)"
  for route in blog "blog/$SLUG"; do
    name="$(echo "$route" | tr / -)"
    pnpm --filter web exec playwright screenshot --color-scheme=light --viewport-size=1280,900 --full-page "http://localhost:$PORT/$route" "$OUT/$name-light.png"
    pnpm --filter web exec playwright screenshot --color-scheme=dark --viewport-size=1280,900 --full-page "http://localhost:$PORT/$route" "$OUT/$name-dark.png"
    pnpm --filter web exec playwright screenshot --device="Pixel 7" --full-page "http://localhost:$PORT/$route" "$OUT/$name-mobile.png"
  done
  echo "screenshots: $OUT"
fi
exit "$STATUS"
```

Expected: the check prints nothing, then `publish check: exit 0` and the screenshots' directory. On
exit 1, each difference is a place where the entry is not the approved text: fix the entry and run
the block again. Exit 2 means the check could not run: the build or the fetch failed, with its
output above, or the check says why.

- [ ] **Step 5: Read the screenshots and run the full gates**

Read each PNG: `/blog` lists the post with its date and summary, and the post reads cleanly in
both schemes and on the phone, ending with the footer when it is `jev`. Then:

```bash
pnpm check:allowbuilds
pnpm test:scripts
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter web build && CI=true pnpm --filter web test:e2e
```

Expected: exit 0 from each. The e2e suite now loads the post under the console-clean, axe (both
colour schemes) and twin-parity gates.

- [ ] **Step 6: Commit and open the pull request**

In `docs/plans/README.md`, set the status of the rows of the publishing design and this plan to
`Shipped`. In this plan, tick this task's steps up to this one.

```bash
git add apps/web/src/data/posts.ts apps/web/src/data/static-routes.ts docs/plans/README.md docs/plans/2026-10-06-blog-publishing-plan.md
git commit -m "feat(blog): publish 01 <slug>"
```

Follow `.claude/skills/open-pr/SKILL.md` with the title `feat(blog): publish 01 <slug>` (D10). Its
body:

- quotes the front matter's `metaTitle` and `tags` beside the entry's, since the twin carries
  neither and the check cannot compare them;
- pastes the publish check's command and its exit 0;
- pastes the gate output;
- describes the screenshots.

Only the owner merges it. If the merge falls on a later day than `publishedAt`, add a last commit
first that moves `publishedAt`, `updatedAt` and `STATIC_ROUTE_UPDATED['/blog']` to the merge day
in UTC (D9), and run Step 4 again.

- [ ] **Step 7: Check production after the deploy**

Once the deploy is live, check each of these:

- `/blog` lists the post and carries no `noindex`;
- `/sitemap.xml` holds `/blog` and the post, with the post's `updatedAt`;
- every page has one Atom alternate;
- `/blog/<slug>/index.md` answers `text/markdown`;
- for a `jev` post, the page ends with the disclosure line.
