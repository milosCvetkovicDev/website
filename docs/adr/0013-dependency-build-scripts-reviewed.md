# 0013. Dependency build scripts stay disabled, and the reviewed versions are enforced

## Status

Accepted

## Date

2026-09-10

## Context

[ADR 0007](0007-dependency-build-scripts.md) denied the install scripts of the three packages pnpm
10 reported, by writing `esbuild: false`, `sharp: false` and `unrs-resolver: false` into
`allowBuilds` in `pnpm-workspace.yaml`. It left the entries unversioned on purpose and put the
reviewed version in a comment above each one, and it named the risk that choice carries in its own
`### Trade-offs`:

> A denied package whose install script changes purpose in a later release produces no new signal.
> [...] The reviewed versions in the comments are the only mitigation.

That is the corrected text, dated 2026-09-10 and recorded in 0007's own `## Corrections`; the
sentence as accepted also offered a major-version review, which the correction removed on the
grounds that none of the three appears in a workspace manifest, so Dependabot raises no
version-update pull request for them at all. Their versions move only when a parent moves.

The one remaining mitigation did not fire the first time it was needed.
[#6](https://github.com/milosCvetkovicDev/website/pull/6), a grouped Dependabot pull request of
fifteen minor and patch updates, moved `next` and `eslint-config-next` from 16.1.5 to 16.3.4 and
carried two of the three denied packages along with them. `vite` did not move, which is exactly why
esbuild did not either. Both of the two changed their install scripts inside that group and nothing
announced it: a comment is not a signal, and pnpm prints nothing at all about a package whose script
has gone away.

What the two versions actually run, read from the installed packages under
`node_modules/.pnpm/<name>@<version>/node_modules/<name>/` and confirmed against the registry:

- **sharp 0.34.5 → 0.35.4.** 0.34.5 declared `install: node install/check.js || npm run build`, the
  script ADR 0007 analysed. sharp has had no `install`, `preinstall` or `postinstall` hook since
  0.35.0: `npm view sharp@0.35.0 scripts.install` and `npm view sharp@0.35.4 scripts.install` are
  both empty, where `npm view sharp@0.34.5 scripts.install` still prints the old line. The script
  file is gone from the published tarball too — `install/` now contains only `build.js`, and
  `check.js`, whose global-libvips branch and node-gyp fallback are most of ADR 0007's sharp
  analysis, is no longer shipped. `build` survives as an ordinary script that only a `npm run build`
  in a sharp checkout reaches.
- **unrs-resolver 1.11.1 → 1.12.2.** The `postinstall` changed from
  `napi-postinstall unrs-resolver 1.11.1 check` to `node postinstall.js` in 1.12.0. That file is
  four lines: it requires `napi-postinstall`, requires its own `package.json`, and calls
  `checkAndPreparePackage(packageJson, true)`. The 1.11.1 form reached the same function through
  that package's CLI, which parsed `check` out of `argv[4]` into the same `checkVersion` argument.
  The dependency is the same `napi-postinstall` (`^0.3.0` → `^0.3.4`), and its
  `checkAndPreparePackage` still does what ADR 0007 described: for each native target it
  `require.resolve`s the `@unrs/resolver-binding-<platform>` package and stops there, and only when
  that fails does it install or download one. The bump changed how the script is invoked, not what
  it does.
- **esbuild** stays at 0.27.2 with `postinstall: node install.js`, unchanged.

None of this makes ADR 0007 wrong. Every sentence in it was true of the versions in the lockfile on
2026-09-09, and its decision — deny these scripts, because on every platform this repository builds
on they either do nothing or do work that has no effect on how the package loads — still holds for
the two packages that still have scripts. The sharp analysis has been _overtaken_, not falsified,
which is why this is a superseding record and not an edit.
[ADR 0012](0012-correcting-accepted-records.md) allows an accepted record's `Context`,
`Consequences` and `Alternatives considered` to be corrected in place, but only for a statement
"false about the world as it stood when the record was accepted", and says in terms that "a
statement that was true then and has been overtaken since is never corrected". This is the second
kind. The decision changes as well, which settles it either way.

The dead `sharp: false` entry is worse than untidy, and this is the part ADR 0007 did not foresee.
Its rule for the next package leans entirely on pnpm's report:

> The rule from here on: a new `Ignored build scripts` line naming a package without an entry is a
> new decision, not noise.

An entry is exactly what suppresses that line. So an entry left behind on a package that has since
dropped its scripts is not a harmless tripwire kept armed; it is a tripwire pointing the wrong way.
If sharp reintroduces an install script in some later release, the entry answers for it in advance,
silently, on behalf of a review nobody did — while the same release with no entry present would be
reported and read. pnpm gives no warning for an `allowBuilds` key that matches nothing, so the
config can rot indefinitely without a signal.

## Decision

`allowBuilds` keeps two entries, and gains a rule and a check.

```yaml
allowBuilds:
  esbuild: false
  unrs-resolver: false
```

- **sharp's entry is dropped.** It denies nothing at 0.35.4. Denial is already what pnpm does to a
  package with no entry, so removing it costs no safety, and it restores the `Ignored build scripts`
  report as the signal for the day sharp ships an install script again. The reasoning ADR 0007 gave
  for not wanting sharp's old script to run is not withdrawn; there is simply no longer a script to
  deny, and if one returns it is reviewed then, against whatever it does then.
- **An entry exists only while the package declares a `preinstall`, `install` or `postinstall`
  script.** An entry for a package with none is removed, not kept as a tripwire, for the reason
  above.
- **esbuild and unrs-resolver stay denied**, on ADR 0007's reasoning, which the readings above
  confirm still describes both scripts. Their comments now name the script as it is invoked today
  and carry `Reviewed at 0.27.2` and `Reviewed at 1.12.2`.
- **The reviewed versions are enforced.** `scripts/check-allowbuilds-drift.mjs`, wired up as
  `pnpm check:allowbuilds` and run in the CI `quality` job immediately after `pnpm install
--frozen-lockfile`, parses the `Reviewed at <version>` note above each entry, compares it with the
  version `pnpm-lock.yaml` resolves for that package, and exits non-zero on any of: a version that
  has moved since it was reviewed, an entry with no `Reviewed at` note, an entry whose package the
  lockfile no longer resolves, an entry whose package resolves to more than one version, or an entry
  whose installed package declares no lifecycle script. The failure message names the version to
  read and the decision to confirm.
- **The check fails closed.** It never exits 0 because it could not see. A line inside the block it
  cannot parse, a second `allowBuilds` block, the inline form, a value that is not `true` or
  `false`, a lockfile it parsed nothing out of, or a package it cannot inspect in the store are all
  failures with a message, not skips. The single deliberate skip is an uninstalled `node_modules`,
  which it prints. `scripts/check-allowbuilds-drift.test.mjs` covers those paths and runs as
  `pnpm test:scripts` in the same job, on `node:test`, so the gate that guards the lockfile has a
  gate of its own without adding a dependency.

Everything else in ADR 0007 carries over unchanged and is not restated here: why `allowBuilds` is
the right key rather than the pnpm 10 lists, why `strictDepBuilds` is still deferred, that pnpm
merges the skipped builds recorded in `node_modules/.modules.yaml` back into its report until
`node_modules` is recreated, and the procedure for a package that appears in the report without an
entry. Read 0007 for those; read this record for what is denied and what enforces it.

## Consequences

### Positive

- The trade-off ADR 0007 wrote down and could not close is now mechanical. The next bump that moves
  a denied package fails CI with the version to read, rather than relying on someone noticing a
  comment inside a fifteen-package Dependabot group.
- `allowBuilds` describes only live decisions, so reading it tells you what is actually denied.
- The check catches the shape of this bug in both directions: a script that changed under a
  reviewed entry, and an entry that outlived its script.
- It runs directly after the install it describes, so a drifted entry fails in seconds, before the
  build, and needs no browser, no Playwright and no network.

### Trade-offs

- The scriptless-entry test reads `node_modules/.pnpm`, so it is only complete after an install.
  Run before one it reports the skip by name and still checks the versions, which keeps it usable on
  a cold checkout without pretending it verified more than it did. CI always installs first.
- The check proves a review is _due_, not that one _happened_. Bumping the comment to match the
  lockfile is enough to make it pass, and nothing verifies that anyone opened the script. It moves
  the failure from invisible to unmissable, which is the whole of what it claims.
- A package that legitimately resolves to two versions fails the check until someone decides what
  the entry means. That is deliberate, and it is the only case where the check demands work that may
  turn out to be unnecessary.
- One more required CI step, and one more root `package.json` script.
- `strictDepBuilds` is still off, for the reason ADR 0007 gives, so an undecided package still only
  prints a box. This check does not change that; it covers packages that already have entries.
- The parser is hand-written against the shape of this file — a top-level `allowBuilds:` block of
  `name: bool` entries at two spaces with comments above them — rather than a YAML library, to keep
  a gate whose purpose is shrinking the install-time dependency surface from widening it. It
  therefore understands less YAML than pnpm does, and the honest statement of the risk is not that
  some form would be missed but that a form it does not recognise must stop the run: anchors, tags,
  block scalars and flow mappings all fail the check rather than passing it. That is the right way
  round, and it is the reason the recognised shape is narrow enough to state in one sentence, but it
  does mean a legal edit to this file can fail CI until it is written the way the check reads.

## Alternatives considered

**Keep `sharp: false` as a deliberate tripwire, with a comment saying it is inert.** The comment
makes the dead config honest, and if sharp ever reintroduces an install script the denial is already
in place and the build keeps working. Rejected: it is not a tripwire. pnpm's report is the tripwire,
and an entry is the one thing that turns it off, so keeping the entry pre-answers a script nobody
has read on behalf of a review nobody did. The safe default it appears to preserve is the default
already — an un-entried package's scripts do not run — so the entry buys nothing and costs the
signal. `pnpm check:allowbuilds` now rejects this option mechanically.

**Correct ADR 0007 in place, leaving one record.** Two paragraphs and a version number would do it.
Rejected twice over. [ADR 0012](0012-correcting-accepted-records.md)'s errata mechanism is confined
to statements false about the world as it stood at acceptance, and 0007's sharp analysis was true of
0.34.5 when it was accepted; an overtaken statement is superseded, never corrected. And a correction
"changes no part of `## Decision`", where this changes which entries `allowBuilds` carries. 0007 was
separately corrected under that mechanism on the same day, for two claims that _were_ false when
written; those corrections stay where they are and are untouched by this record.

**Rely on the major-version review, as ADR 0007 intended.** Rejected by the case at hand: both
changes arrived as minor bumps, grouped with thirteen others, and sharp's arrived as the _absence_
of a script, which produces no output to review at all.

**Have the check read the scripts rather than the versions — hash each denied package's install
script and fail when the hash moves.** Strictly stronger: it fires on the change itself instead of
on the version that carries it, and it cannot be satisfied by editing a comment. Rejected for now
because it needs a committed hash per package, it fires on every reformat and version-string bump
inside those scripts, and it still cannot say whether the change matters. The version comparison
already forces a human to open the file, which is the step that was missing. Worth revisiting if a
denied package's script starts changing more often than its version comment can keep up with.

**Drop `allowBuilds` and let the box print.** Returns to the state before ADR 0007: a warning on
every install that no longer distinguishes decided packages from new ones. Rejected there, and
rejected here for the same reason.
