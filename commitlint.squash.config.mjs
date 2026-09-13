// What lands on `main`: the pull request title, which GitHub makes the squash commit's subject,
// and every commit a push to `main` brings. Only `.github/workflows/commitlint.yml` uses this file.
//
// commitlint skips a message that matches one of its default ignore patterns and exits 0:
// `revert …`, `Reapply …`, `fixup!`, `Merge branch … into …`, a bare version and more (see
// @commitlint/is-ignored), and the merge pattern matches any line of the message, not only the
// subject. So a title in one of those shapes landed on `main` with the check green. The defaults
// are turned off here rather than in commitlint.config.mjs because the local hook and the branch
// commits need them: `git commit --fixup`, `git merge` and GitHub's "Update branch" write exactly
// those shapes. That split holds only while squash is the repository's one merge method, which
// discards the branch commits. With rebase merging enabled they would land and need this config.
import conventional from '@commitlint/config-conventional';

import base from './commitlint.config.mjs';

const ruleValue = (name) => (base.rules?.[name] ?? conventional.rules[name])[2];
const TYPES = ruleValue('type-enum');
const HEADER_MAX_LENGTH = ruleValue('header-max-length');

// GitHub's revert button titles a pull request `Revert "<title>"` and `git revert` writes the same
// subject, or `Reapply "<subject>"` when it reverts a revert. The squash appends ` (#NN)`.
const WRAPPER = /^(?:Revert|Reapply) "(.+)"(?: \(#\d+\))?$/;
const SUFFIX = / \(#\d+\)$/;
// Far longer than any title GitHub accepts. It keeps the unwrapping below linear on a pathological
// subject typed in the merge dialog.
const WRAPPER_MAX_LENGTH = 1000;

// The wrapped header is checked for the shape the rules would pass, not linted: a type from
// `type-enum`, an optional scope and `!`, a subject without a trailing full stop, no longer than
// `header-max-length` before its own ` (#NN)`, and no `"`, so the wrapper's last quote closes it.
// `subject-case` is not re-checked.
const isConventionalHeader = (header) => {
  const match = header.match(/^(\w+)(?:\([^()"]*\))?!?: ([^"]+)$/);
  if (match === null) return false;
  const bare = header.replace(SUFFIX, '');
  return TYPES.includes(match[1]) && !bare.endsWith('.') && bare.length <= HEADER_MAX_LENGTH;
};

const isRevertOfConventional = (header) => {
  if (header.length > WRAPPER_MAX_LENGTH) return false;
  for (let wrapped = header.match(WRAPPER)?.[1]; wrapped !== undefined;) {
    if (isConventionalHeader(wrapped)) return true;
    wrapped = wrapped.match(WRAPPER)?.[1];
  }
  return false;
};

// An ignored message skips every rule, the body's included, so a revert is ignored only when there
// is nothing else in it: no body, or the line `git revert` writes. A revert with a body typed in
// the merge dialog is linted like any other message, and its header fails.
const REVERT_BODY_LINE = /^This reverts commit [0-9a-f]{7,64}\.$/;

export default {
  ...base,
  defaultIgnores: false,
  ignores: [
    ...(base.ignores ?? []),
    (message) => {
      const [header, ...body] = message.split(/\r?\n/);
      return (
        isRevertOfConventional(header) &&
        body.every((line) => line === '' || REVERT_BODY_LINE.test(line))
      );
    },
  ],
};
