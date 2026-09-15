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

// Refused unless the rule is an enabled `always` rule with a literal value: a disabled, inverted or
// function rule would otherwise turn the exception below into an allowlist of the wrong thing, or
// crash on the first revert. scripts/commitlint-config.test.mjs holds both values to the rules
// commitlint actually loads, which a preset in `extends` could change.
const ruleValue = (name, isValue) => {
  const rule = base.rules?.[name] ?? conventional.rules[name];
  if (!Array.isArray(rule) || rule[0] !== 2 || rule[1] !== 'always' || !isValue(rule[2])) {
    throw new Error(`commitlint.squash.config.mjs needs ${name} as [2, 'always', <literal>]`);
  }
  return rule[2];
};
const TYPES = ruleValue('type-enum', Array.isArray);
const HEADER_MAX_LENGTH = ruleValue('header-max-length', Number.isInteger);

// GitHub's revert button titles a pull request `Revert "<title>"` and `git revert` writes the same
// subject, or `Reapply "<subject>"` when it reverts a revert. The squash appends ` (#NN)`.
const WRAPPER = /^(?:Revert|Reapply) "(.+)"(?: \(#\d+\))?$/;
const SUFFIX = / \(#\d+\)$/;
// Far longer than any title GitHub accepts. It keeps the unwrapping below linear on a pathological
// subject typed in the merge dialog.
const WRAPPER_MAX_LENGTH = 1000;

// The wrapped header is checked for the shape the rules would pass, not linted: a type from
// `type-enum`, an optional scope and `!`, a subject that starts and ends with a non-space and does
// not start with a capital letter (as `subject-case` refuses), no full stop before its own
// ` (#NN)`, no `"`, so the wrapper's last quote closes it, and at most `header-max-length`
// characters. A wrapped title without its ` (#NN)` can therefore be a few characters longer than
// one the title step would have let merge.
const isConventionalHeader = (header) => {
  const match = header.match(/^(\w+)(?:\([^()"]*\))?!?: (\S(?:[^"]*\S)?)$/);
  if (match === null) return false;
  const [, type, subject] = match;
  return (
    TYPES.includes(type) &&
    !/^\p{Lu}/u.test(subject) &&
    !header.replace(SUFFIX, '').endsWith('.') &&
    header.length <= HEADER_MAX_LENGTH
  );
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
// is nothing else in it: no body beyond the line `git revert` writes and the `Co-authored-by:`
// trailers GitHub can add to a squash. A revert with a body typed in the merge dialog is linted
// like any other message, and its header fails.
const REVERT_BODY_LINE =
  /^(?:This reverts commit [0-9a-f]{7,64}\.|Co-authored-by: [^<>\n]+ <[^<>\s]+>)$/;

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
