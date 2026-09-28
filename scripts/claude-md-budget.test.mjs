// Tests for the size of CLAUDE.md and the scoping of .claude/rules. Run with `pnpm test:scripts`
// (node:test).
//
// CLAUDE.md is sent with every request of every session and agent in this repository, so each
// kilobyte in it is paid for on every turn. Guidance for one area lives in a .claude/rules file
// instead, which Claude Code loads only when it reads a file matching the `paths` in the rule's
// frontmatter. These tests hold CLAUDE.md to a byte budget and make it list every rule, and they
// fail on a rule without `paths` (it would load on every request, like CLAUDE.md) or with a
// pattern that matches no tracked file (it would never load, so its guidance would be lost).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rulesDir = join(root, '.claude', 'rules');

// CLAUDE.md was 62.6 KB before the split into rules on 2026-09-24, twice its size of a week
// earlier, and 15.5 KB after it. Raise the budget only for guidance that every task needs.
const CLAUDE_MD_BUDGET = 16 * 1024;

// Read at module level, not in a `describe` body: node:test reports a throw there as a failed
// suite but still counts `# fail 0` and exits 0, so a missing file would skip these tests with the
// run green. A throw at module level fails the file.
const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf8');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
// Claude Code discovers rule files recursively, so a rule in a subdirectory loads like any other.
const ruleFiles = readdirSync(rulesDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => relative(rulesDir, join(entry.parentPath, entry.name)))
  .sort();

/**
 * A rules `paths` glob as a regular expression over repository-relative paths: `**` spans
 * directories (`**` followed by `/` also matches none), `*` and `?` stay within one, and `{a,b}`
 * is an alternation of two or more literals. It never matches more than Claude Code does, so a
 * pattern it matches to a tracked file loads: a pattern without a slash matches at the root only
 * here, and anything it cannot model the same way (a bracket expression, a nested or wildcard
 * brace, a `**` that is not a whole path segment) throws instead of being matched wrongly.
 * @param {string} glob
 */
function globToRegExp(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      assert.ok(
        (i === 0 || glob[i - 1] === '/') && (i + 2 === glob.length || glob[i + 2] === '/'),
        `${glob}: this test only models ** as a whole path segment`,
      );
      i++;
      if (glob[i + 1] === '/') {
        i++;
        source += '(?:.*/)?';
      } else {
        source += '.*';
      }
    } else if (c === '*') {
      source += '[^/]*';
    } else if (c === '?') {
      source += '[^/]';
    } else if (c === '{') {
      const end = glob.indexOf('}', i);
      assert.ok(end > i, `unclosed brace in ${glob}`);
      const alternatives = glob.slice(i + 1, end);
      assert.match(
        alternatives,
        /^[^{}[\]*?,]+(?:,[^{}[\]*?,]+)+$/,
        `${glob}: this test only models braces of two or more literal alternatives`,
      );
      source += `(?:${alternatives.split(',').map(escapeRegExp).join('|')})`;
      i = end;
    } else if (c === '[') {
      assert.fail(`${glob}: this test does not model bracket expressions`);
    } else {
      source += escapeRegExp(c);
    }
  }
  return new RegExp(`^${source}$`);
}

/** @param {string} text */
function escapeRegExp(text) {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

/**
 * The `paths` of a rule's YAML frontmatter, which must be a block list of quoted patterns.
 * Claude Code loads a rule whose frontmatter does not parse on every request, and an unquoted
 * pattern starting with `*` or `{` does not parse, so this refuses what it cannot vouch for.
 * @param {string} text
 * @param {string} file
 */
function frontmatterPaths(text, file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, `${file} has no frontmatter, so it would load on every request`);
  const lines = match[1].split('\n');
  const start = lines.findIndex((line) => /^paths:/.test(line));
  assert.ok(start !== -1, `${file} has no paths, so it would load on every request`);
  assert.match(lines[start], /^paths:\s*$/, `${file}: write paths as a block list`);
  /** @type {string[]} */
  const patterns = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(?:#.*)?$/.test(line)) continue;
    if (!/^\s/.test(line)) break;
    const item = /^\s+-\s+(['"])(.+)\1\s*$/.exec(line);
    assert.ok(item, `${file}: ${line.trim()} is not a quoted list item`);
    patterns.push(item[2]);
  }
  assert.ok(patterns.length > 0, `${file} has no paths, so it would load on every request`);
  return patterns;
}

describe('globToRegExp', () => {
  /** @type {Array<[string, string, boolean]>} */
  const cases = [
    ['apps/web/e2e/**', 'apps/web/e2e/support/hydration.ts', true],
    ['apps/web/src/**/__tests__/**', 'apps/web/src/__tests__/a.test.ts', true],
    ['apps/web/src/**/__tests__/**', 'apps/web/src/hooks/__tests__/a.test.tsx', true],
    ['scripts/flake-*.sh', 'scripts/flake-hunt.sh', true],
    ['scripts/flake-*.sh', 'scripts/sub/flake-hunt.sh', false],
    ['apps/*/package.json', 'apps/web/package.json', true],
    ['apps/*/package.json', 'apps/web/sub/package.json', false],
    ['commitlint*.mjs', 'commitlint.squash.config.mjs', true],
    ['src/**/*.{ts,tsx}', 'src/a/b.tsx', true],
    ['src/**/*.{ts,tsx}', 'src/a/b.js', false],
    ['package.json', 'package.json', true],
    ['.github/**', '.github/workflows/ci.yml', true],
    ['scripts/*.{mjs,ts,sh}', 'scripts/check-docs-drift.ts', true],
    ['scripts/*.{mjs,ts,sh}', 'scripts/agent-state.schema.json', false],
  ];
  for (const [glob, path, expected] of cases) {
    it(`${glob} ${expected ? 'matches' : 'does not match'} ${path}`, () => {
      assert.equal(globToRegExp(glob).test(path), expected);
    });
  }

  for (const glob of ['src/*.{ts', 'src/*.{}', 'src/*.{ts}', 'src/*.{ts,{tsx,jsx}}', 'x/{a,b*}']) {
    it(`refuses the brace in ${glob}`, () => {
      assert.throws(() => globToRegExp(glob), /brace/);
    });
  }

  it('refuses a bracket expression', () => {
    assert.throws(() => globToRegExp('src/[A-Z]*.tsx'), /bracket/);
  });

  for (const glob of ['src/**.ts', 'src/a**/b', '**x']) {
    it(`refuses the ** in ${glob}`, () => {
      assert.throws(() => globToRegExp(glob), /whole path segment/);
    });
  }
});

describe('frontmatterPaths', () => {
  it('reads a block list past blank and comment lines, up to the next key', () => {
    const text = '---\npaths:\n  - \'a/**\'\n\n  # b\n  - "b/*.ts"\nother: x\n---\nbody\n';
    assert.deepEqual(frontmatterPaths(text, 'r.md'), ['a/**', 'b/*.ts']);
  });

  /** @type {Array<[string, string, RegExp]>} */
  const refusals = [
    ['no frontmatter', '# rule\n', /no frontmatter/],
    ['no paths key', "---\nother: 'x'\n---\n", /no paths/],
    ['an empty list', '---\npaths:\n---\n', /no paths/],
    ['an inline list', "---\npaths: ['a/**']\n---\n", /block list/],
    ['an unquoted pattern', '---\npaths:\n  - **/*.ts\n---\n', /not a quoted list item/],
  ];
  for (const [name, text, message] of refusals) {
    it(`refuses ${name}`, () => {
      assert.throws(() => frontmatterPaths(text, 'r.md'), message);
    });
  }
});

describe('CLAUDE.md', () => {
  it(`stays within its budget of ${CLAUDE_MD_BUDGET} bytes`, () => {
    const size = Buffer.byteLength(claudeMd);
    assert.ok(
      size <= CLAUDE_MD_BUDGET,
      `CLAUDE.md is ${size} bytes, over its budget of ${CLAUDE_MD_BUDGET}: move guidance for one ` +
        'area into the .claude/rules file for that area',
    );
  });

  it('lists every rule file', () => {
    for (const file of ruleFiles) {
      assert.ok(claudeMd.includes(`\`${file}\``), `CLAUDE.md does not list .claude/rules/${file}`);
    }
  });
});

describe('.claude/rules', () => {
  it('has at least one rule', () => {
    assert.ok(ruleFiles.length > 0);
  });

  for (const file of ruleFiles) {
    it(`${file} is scoped by paths that each match a tracked file`, () => {
      const patterns = frontmatterPaths(readFileSync(join(rulesDir, file), 'utf8'), file);
      for (const pattern of patterns) {
        const re = globToRegExp(pattern);
        assert.ok(
          tracked.some((path) => re.test(path)),
          `${file}: ${pattern} matches no tracked file, so the rule would never load`,
        );
      }
    });
  }
});
