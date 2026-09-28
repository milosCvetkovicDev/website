# 0027. vite 8 is declared in `apps/web`, and `allowBuilds` keeps one entry

## Status

Accepted

## Date

2026-09-28

## Context

[ADR 0018](0018-dependency-update-policy.md) decided that the vite family gets a Dependabot group of
its own, and that the group lands in the same pull request that makes `apps/web` declare `vite`
directly. That pull request is the vite 8 migration. Dependabot's #9, `@vitejs/plugin-react` 5 → 6,
had failed on its own because plugin-react 6 peers `vite: ^8.0.0` and imports `vite/internal`,
which vite 7 does not export.

By the time the migration was made, the ground had moved. #105 bumped vite to 8.3.1 in
`apps/playground`, and ADR 0018's retirement of the playground then left `apps/web` as the only
package that needs vite. `apps/web` resolved vite 8.3.1, but only as a peer of vitest 5 and of
plugin-react 5.2.0, whose peer range admits vite 8, so its manifest named no vite for Dependabot to
update.

vite 8 does not depend on esbuild; vite 7 did. vite 8 lists esbuild as an optional peer, and pnpm
resolves an optional peer when the package is already in the dependency graph. The lockfile kept
`esbuild@0.27.2` that way after #105, although nothing else needed it: the resolution held esbuild
in the graph, and esbuild in the graph kept the resolution. Re-resolving with
`pnpm install --resolution-only`, pnpm's `dedupe` and `pnpm update -r vite --depth Infinity` all
left it in place.

[ADR 0013](0013-dependency-build-scripts-reviewed.md) decided that "`allowBuilds` keeps two
entries", `esbuild: false` and `unrs-resolver: false`. The same decision says that an entry exists
only while its package declares an install script, and that `pnpm check:allowbuilds` fails on an
entry whose package the lockfile no longer resolves. With esbuild gone, the esbuild entry has to
go, and the two-entry sentence stops being true. It was true when ADR 0013 was accepted, so
[ADR 0012](0012-correcting-accepted-records.md) calls for it to be superseded, not corrected.

## Decision

**`apps/web` declares `vite` `^8.3.1` and `@vitejs/plugin-react` `^6.1.1` as devDependencies.**
vitest and `@vitest/coverage-v8` keep their specifiers, and `apps/web/vitest.config.ts` is
unchanged, because plugin-react 6 is called the same way.

**esbuild is not in the dependency tree, and `allowBuilds` keeps one entry, `unrs-resolver: false`.**
This replaces ADR 0013's sentence "`allowBuilds` keeps two entries, and gains a rule and a check.",
the two-entry block beneath it, and what its bullets say about esbuild. The rest of ADR 0013's
decision stands, and it is what removed the entry: an entry lives only as long as its package has a
script to deny, and the check enforces that. If esbuild comes back, whether as another package's dependency or as vite's optional peer
again, pnpm reports it as an ignored build script. That is a new decision under ADR 0013's
procedure, not a reason to restore the old entry.

To get esbuild out of the lockfile, every package in `apps/web` that brings vite in (`vite`,
`@vitejs/plugin-react`, `vitest` and `@vitest/coverage-v8`) was removed with pnpm and added back at
the same ranges. The lockfile was never edited by hand.

**`.github/dependabot.yml` gains the `vite` group that ADR 0018 decided**, ahead of
`minor-and-patch`. This carries out ADR 0018's decision without changing it.

## Consequences

### Positive

- plugin-react 6 and vite 8 now resolve together, so #9's failure cannot come back, and any later
  vite, plugin-react or vitest major arrives in one grouped pull request.
- plugin-react 6 no longer uses Babel for its transform. With it and esbuild gone, the lockfile
  goes from 679 package entries to 639: esbuild and its 26 platform binaries, react-refresh, six
  `@babel/*` entries and four `@types/babel__*` entries leave it. `@babel/core` itself stays,
  because other packages still need it.
- `allowBuilds` again lists only packages that have a script to deny.

### Trade-offs

- `apps/web` now declares a package that none of its code imports: vite is loaded through vitest.
  The declaration exists for Dependabot and for the group, and removing it would bring back a
  plugin-react major arriving without its vite.
- The remove-and-add also re-resolved packages that only vitest's coverage provider uses.
  `@vitest/istanbul-lib-coverage` and `@vitest/istanbul-lib-report` moved from 1.0.1 to 1.0.2, and
  `estree-walker`'s `@types/estree` moved down from 1.0.9 to the 1.0.8 already in the tree. That
  is pnpm's own output, but it moves more of the lockfile than the manifest change alone would.
- The optional-peer loop can form again. Any package that brings esbuild into the graph makes vite
  resolve it as its peer once more, and the ignored-build-scripts warning is the only signal that
  it has.

## Alternatives considered

**Keep `esbuild: false` as a tripwire.** Rejected by ADR 0013's own rule and its first rejected
alternative. An entry for a package with nothing to deny answers in advance for a review nobody has
done, and `pnpm check:allowbuilds` fails on it: "The dependency is gone; drop the entry."

**Leave esbuild in the lockfile as vite's optional peer, with its entry.** Nothing runs it. vite 8
bundles with rolldown and transforms with oxc. Keeping it would mean installing platform binaries
nobody calls, and keeping a denial that decides nothing.

**Re-point the drift-manifest entry for ADR 0013's sentence instead of superseding it.** The
manifest checks a Decision as live while its record is accepted, and ADR 0012 forbids editing a
Decision. That leaves supersession, in part, as the only honest route.
