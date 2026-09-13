// What lands on `main`: the pull request title, which GitHub turns into the squash commit's subject,
// and every commit a push to `main` brings. Only `.github/workflows/commitlint.yml` uses this file.
//
// commitlint skips a message that matches one of its default ignore patterns and exits 0: `revert …`,
// `Reapply …`, `fixup!`, `Merge branch … into …`, a bare version and more (see
// @commitlint/is-ignored), and the merge pattern matches any line of the message, not only the
// subject. So a title in one of those shapes landed on `main` with the check green. The defaults are
// turned off here rather than in commitlint.config.mjs because the local hook and the branch commits
// need them: `git commit --fixup`, `git merge` and GitHub's "Update branch" write exactly those
// shapes, and a squash merge discards them.
import base from './commitlint.config.mjs';

// Loose on purpose: the wrapped header is checked for shape, not linted, because it was linted as a
// title when it merged.
const CONVENTIONAL_HEADER = /^\w+(?:\([^)\n]*\))?!?: \S/;

// GitHub's revert button titles the pull request `Revert "<title>"`, and the squash appends
// ` (#NN)`. Accepted only around a conventional header, or around another such revert, so
// `Revert "update stuff"` still fails.
const isGitHubRevert = (header) => {
  const wrapped = header.match(/^Revert "(.+)"(?: \(#\d+\))?$/)?.[1];
  return wrapped !== undefined && (CONVENTIONAL_HEADER.test(wrapped) || isGitHubRevert(wrapped));
};

export default {
  ...base,
  defaultIgnores: false,
  ignores: [(message) => isGitHubRevert(message.split('\n', 1)[0])],
};
