# Tooling & Quality Gates Implementation Plan (PR A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every documented command in this monorepo true and every quality gate green and enforced locally (pre-commit, commit-msg) and remotely (GitHub Actions).

**Architecture:** The shared `@repo/prettier-config` becomes the single formatting source of truth, referenced by `prettier.config.mjs` files. Turbo gains one task per root script. Husky runs lint-staged (nearest per-package config) and commitlint. React Hooks v7 findings are fixed with `useSyncExternalStore`-backed hooks and derived state. Playwright asserts behaviour and runs against the production build in CI. A two-job GitHub Actions workflow with SHA-pinned actions gates every push and PR.

**Tech Stack:** pnpm 10.33, Node 22, Turborepo 2, Prettier 3 + prettier-plugin-tailwindcss, ESLint 9 (eslint-config-next 16, React Hooks v7), Husky 9, lint-staged 17, commitlint 21, Vitest 4, Playwright 1.58, GitHub Actions.

**Design:** `docs/plans/2026-09-08-repo-hardening-and-launch-design.md` (decisions D1–D8).

**Branch:** `chore/tooling-and-quality-gates` (from `main` at `7d31606`). The Featured Work WIP lives on `feat/featured-work-architecture-diagram` and is out of scope here.

**Stop condition for the whole PR (all must hold):**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web test:e2e                                                     # 9 passed
printf 'not conventional' | pnpm exec commitlint                               # exit 1
gh pr checks --watch                                                           # all checks pass
```

---

### Task 0: Commit the design and this plan

**Files:**

- Create: `docs/plans/2026-09-08-repo-hardening-and-launch-design.md` (already written)
- Create: `docs/plans/2026-09-08-tooling-and-quality-gates-plan.md` (this file)

- [x] **Step 1: Commit only the two documents** (the 63 modified files stay unstaged for now)

```bash
git add docs/plans/2026-09-08-repo-hardening-and-launch-design.md docs/plans/2026-09-08-tooling-and-quality-gates-plan.md
git commit -m "docs(plans): add repo hardening design and tooling plan"
```

Expected: one commit containing exactly two new files.

---

### Task 1: Pin Node and pnpm

**Files:**

- Create: `.nvmrc`
- Modify: `package.json` (`engines`)
- Modify: `pnpm-lock.yaml` (already regenerated with pnpm 10.33 on 2026-03-29; verify it is consistent)

- [x] **Step 1: Create `.nvmrc`**

```
22
```

- [x] **Step 2: Raise the engines floor to the pinned major**

In `package.json`, change

```json
  "engines": {
    "node": ">=20"
  },
```

to

```json
  "engines": {
    "node": ">=22"
  },
```

`packageManager` stays `"pnpm@10.33.0"` (the March bump; matches `pnpm --version` locally).

- [x] **Step 3: Verify the lockfile matches the manifests**

Run: `pnpm install --frozen-lockfile`
Expected: exit 0 and `Lockfile is up to date, resolution step is skipped` (or `Already up to date`). If it fails, run `pnpm install` and include the lockfile in the commit.

- [x] **Step 4: Commit**

```bash
git add .nvmrc package.json pnpm-lock.yaml
git commit -m "build: pin node 22 and pnpm 10.33 for local, ci and vercel"
```

---

### Task 2: Wire the shared Prettier config

**Files:**

- Modify: `packages/prettier-config/index.js`
- Modify: `packages/prettier-config/package.json`
- Create: `prettier.config.mjs`
- Create: `apps/web/prettier.config.mjs`
- Create: `.prettierignore`
- Modify: `package.json` (devDependencies, `format` scripts)
- Modify: `apps/web/package.json` (devDependencies)

- [x] **Step 1: Make the shared config self-contained**

Replace `packages/prettier-config/index.js` with:

```js
import { fileURLToPath } from 'node:url';

/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
  // Resolved from this package so consumers do not need their own dependency on the plugin.
  plugins: [fileURLToPath(import.meta.resolve('prettier-plugin-tailwindcss'))],
};

export default config;
```

Why `fileURLToPath(import.meta.resolve(...))`: Prettier resolves plugin _names_ relative to the config file that lists them. With pnpm's strict `node_modules`, `apps/web` cannot see a plugin that only `packages/prettier-config` depends on. An absolute path sidesteps that.

- [x] **Step 2: Bump the plugin in `packages/prettier-config/package.json`**

```json
{
  "name": "@repo/prettier-config",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "dependencies": {
    "prettier-plugin-tailwindcss": "^0.8.1"
  },
  "peerDependencies": {
    "prettier": "^3.0.0"
  }
}
```

- [x] **Step 3: Create the root `prettier.config.mjs`**

```js
import config from '@repo/prettier-config';

export default config;
```

- [x] **Step 4: Create `apps/web/prettier.config.mjs`** (adds the Tailwind v4 entry point so class sorting knows the theme and custom variants)

```js
import config from '@repo/prettier-config';

/** @type {import('prettier').Config} */
export default {
  ...config,
  tailwindStylesheet: './src/app/globals.css',
};
```

- [x] **Step 5: Create `.prettierignore`**

```
# Dependencies and build output
node_modules
.pnpm-store
.next
.turbo
dist
out
coverage
test-results
playwright-report

# Generated
pnpm-lock.yaml
next-env.d.ts
*.tsbuildinfo
```

- [x] **Step 6: Reference the package and simplify the root scripts**

In root `package.json`:

```json
  "scripts": {
    "format": "prettier --write .",
    "format:check": "prettier --check .",
```

(replace the two existing `format` entries; keep every other script), and in `devDependencies` add

```json
    "@repo/prettier-config": "workspace:*",
```

and raise `"prettier": "^3.9.6"`.

In `apps/web/package.json` `devDependencies` add

```json
    "@repo/prettier-config": "workspace:*",
```

- [x] **Step 7: Install and verify config resolution**

Run: `pnpm install`
Run: `pnpm exec prettier --find-config-path apps/web/src/app/page.tsx`
Expected: `apps/web/prettier.config.mjs`
Run: `pnpm exec prettier --find-config-path apps/playground/src/App.tsx`
Expected: `prettier.config.mjs`

- [x] **Step 8: Verify the plugin loads and sorts classes**

Run: `printf '<div className="p-4 flex" />;\n' | pnpm exec prettier --stdin-filepath apps/web/src/probe.tsx`
Expected output: `<div className="flex p-4" />;` (Tailwind order puts `flex` before `p-4`; double quotes stay in JSX because `jsxSingleQuote` is off).

- [x] **Step 9: Commit** (config only; no reformatting yet)

```bash
git add packages/prettier-config prettier.config.mjs apps/web/prettier.config.mjs .prettierignore package.json apps/web/package.json pnpm-lock.yaml
git commit -m "build: wire shared prettier config with tailwind class sorting"
```

---

### Task 3: Commit the two March perf tweaks, then reformat everything

**Files:**

- Modify (already modified in the working tree): `apps/web/src/app/globals.css`, `apps/web/src/components/animated-hero/tmux-background.tsx`
- Modify: every file `pnpm format` touches

- [x] **Step 1: Format only the two files that carry real changes and commit them on their own**

```bash
pnpm exec prettier --write apps/web/src/app/globals.css apps/web/src/components/animated-hero/tmux-background.tsx
git add apps/web/src/app/globals.css apps/web/src/components/animated-hero/tmux-background.tsx
git commit -m "perf(web): start tmux log animation at idle time and trim theme transitions"
```

Expected diff content: the `requestIdleCallback` deferral in `AnimatedPane` and the shorter transition selector list in `globals.css`, plus formatting.

- [x] **Step 2: Reformat the repository**

Run: `pnpm format`
Run: `pnpm format:check`
Expected: `All matched files use Prettier code style!`

- [x] **Step 3: Prove nothing else changed**

Run: `pnpm build`
Expected: both apps build (`Tasks: 2 successful`).
Run: `git diff --stat | tail -1`
Expected: only formatting churn (quotes, wrapping, class order); spot-check `git diff apps/web/src/components/index.ts`.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "style: format repository with the shared prettier config"
```

---

### Task 4: Turbo tasks and package scripts

**Files:**

- Modify: `turbo.json`
- Modify: `package.json` (scripts)
- Modify: `apps/web/package.json` (scripts)
- Modify: `apps/playground/package.json` (scripts)

- [x] **Step 1: Replace `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "env": ["NEXT_PUBLIC_SITE_URL"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "lint:fix": {
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:e2e": {
      "cache": false
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [x] **Step 2: Root scripts** (`package.json`), final shape:

```json
  "scripts": {
    "dev": "turbo dev",
    "dev:web": "turbo dev --filter=web",
    "dev:playground": "turbo dev --filter=playground",
    "build": "turbo build",
    "lint": "turbo lint",
    "lint:fix": "turbo lint:fix",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:e2e": "turbo test:e2e",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "clean": "turbo clean && rm -rf node_modules",
    "prepare": "husky"
  },
```

- [x] **Step 3: Web scripts** (`apps/web/package.json`):

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "lint:fix": "eslint --fix",
    "typecheck": "next typegen && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "clean": "rm -rf .next .turbo node_modules"
  },
```

`next typegen` (Next ≥ 15.5) writes `next-env.d.ts` and the route types without a build, so `tsc --noEmit` is meaningful on a clean checkout.

- [x] **Step 4: Playground scripts** (`apps/playground/package.json`):

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --max-warnings 0",
    "lint:fix": "eslint . --fix",
    "typecheck": "tsc -b",
    "clean": "rm -rf dist .turbo node_modules"
  },
```

(`tsc -b` with `noEmit: true` in both referenced tsconfigs only type-checks.)

- [x] **Step 5: Verify**

Run: `pnpm typecheck`
Expected: `Tasks: 2 successful, 2 total`.
Run: `pnpm exec turbo run lint:fix clean test:e2e --dry=text | grep -E '^(web|playground)#'`
Expected: a line per package per task (proves the tasks resolve; nothing executes).
Run: `pnpm lint`
Expected: still fails with 10 errors (fixed in Task 8) — confirm the failure is lint findings, not "Missing tasks".

- [x] **Step 6: Commit**

```bash
git add turbo.json package.json apps/web/package.json apps/playground/package.json
git commit -m "build: add typecheck, lint:fix, clean and e2e tasks to turbo"
```

---

### Task 5: Git hooks (husky, lint-staged, commitlint)

**Files:**

- Create: `.husky/pre-commit`
- Create: `.husky/commit-msg`
- Create: `commitlint.config.mjs`
- Modify: `package.json` (devDependency versions, `lint-staged`)
- Modify: `apps/web/package.json` (`lint-staged`)
- Modify: `apps/playground/package.json` (`lint-staged`)

- [x] **Step 1: Hook scripts** (Husky 9 format: plain shell, no shebang, no `husky.sh` sourcing)

`.husky/pre-commit`:

```sh
pnpm exec lint-staged
```

`.husky/commit-msg`:

```sh
pnpm exec commitlint --edit "$1"
```

- [x] **Step 2: `commitlint.config.mjs`**

```js
export default { extends: ['@commitlint/config-conventional'] };
```

- [x] **Step 3: lint-staged configs** — nearest config wins and tasks run from its directory, which is what makes ESLint's flat config resolve.

Root `package.json` — replace the existing `lint-staged` block with:

```json
  "lint-staged": {
    "*.{json,md,mdx,yml,yaml,css}": "prettier --write"
  },
```

`apps/web/package.json` and `apps/playground/package.json` — add:

```json
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs}": ["eslint --fix --max-warnings 0", "prettier --write"],
    "*.{json,md,css,yml,yaml}": "prettier --write"
  },
```

- [x] **Step 4: Bump the hook toolchain in root `devDependencies`**

```json
    "@commitlint/cli": "^21.2.2",
    "@commitlint/config-conventional": "^21.2.2",
    "husky": "^9.1.7",
    "lint-staged": "^17.5.0",
    "turbo": "^2.10.12",
```

Run: `pnpm install` (the `prepare` script re-runs `husky`, which sets `core.hooksPath=.husky/_`).
Run: `git config core.hooksPath`
Expected: `.husky/_`

- [x] **Step 5: Verify commitlint rejects and accepts correctly**

Run: `printf 'fixed stuff' | pnpm exec commitlint`
Expected: exit 1 with `subject may not be empty` and `type may not be empty`.
Run: `printf 'build: enforce conventional commits' | pnpm exec commitlint`
Expected: exit 0, no output.

- [x] **Step 6: Commit through the hooks** (this commit is the live proof: lint-staged runs on the staged JSON/MJS files, commitlint validates the message)

```bash
git add .husky/pre-commit .husky/commit-msg commitlint.config.mjs package.json apps/web/package.json apps/playground/package.json pnpm-lock.yaml
git commit -m "build: enforce conventional commits and lint-staged via husky hooks"
```

Expected output includes `✔ Running tasks for staged files...` from lint-staged.

- [x] **Step 7: Negative proof**

Run: `git commit --allow-empty -m "bad message"`
Expected: rejected by commit-msg (exit 1, commitlint errors). No commit is created — confirm with `git log -1 --format=%s`.

---

### Task 6: Editor and ignore configuration

**Files:**

- Create: `.editorconfig`
- Create: `.vscode/settings.json`
- Create: `.vscode/extensions.json`
- Modify: `.gitignore`

- [x] **Step 1: `.editorconfig`**

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [x] **Step 2: `.vscode/settings.json`**

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "files.eol": "\n"
}
```

- [x] **Step 3: `.vscode/extensions.json`**

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "editorconfig.editorconfig"
  ]
}
```

- [x] **Step 4: `.gitignore`** — replace the single `.vscode` line under `# IDE` with

```
.vscode/*
!.vscode/settings.json
!.vscode/extensions.json
```

add under `# Testing`:

```
test-results
playwright-report
```

and next to `.worktrees`:

```
.claude/worktrees
```

- [x] **Step 5: Verify and commit**

Run: `git status --short .vscode` — expected: the two files show as untracked (not ignored).
Run: `git check-ignore -v .claude/worktrees apps/web/test-results` — expected: both matched by `.gitignore`.

```bash
git add .editorconfig .vscode/settings.json .vscode/extensions.json .gitignore
git commit -m "chore: add editorconfig, vscode recommendations and ignore rules"
```

---

### Task 7: Claude Code project configuration

**Files:**

- Create: `.claude/settings.json` (committed, team-facing hooks)
- Modify: `.claude/settings.local.json` (personal; remove the now-duplicated `hooks` block — not committed)

Both existing local hooks relied on `$CLAUDE_FILE_PATH`, which hooks do not receive, and used `exit 1`, which does not block. Hooks receive JSON on stdin and block with exit code 2.

- [x] **Step 1: `.claude/settings.json`**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "PATH=\"/usr/local/bin:/opt/homebrew/bin:$PATH\"; f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in */.env|*/.env.local|*/.env.*.local|*/.env.production|*/.env.development|*pnpm-lock.yaml|*/node_modules/*|*/.next/*|*/dist/*) echo \"BLOCK: $f is a protected file\" >&2; exit 2;; esac; exit 0"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "PATH=\"/usr/local/bin:/opt/homebrew/bin:$PATH\"; [ -s \"$HOME/.nvm/nvm.sh\" ] && . \"$HOME/.nvm/nvm.sh\" >/dev/null 2>&1; f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.css|*.yml|*.yaml) pnpm exec prettier --write \"$f\" >/dev/null 2>&1 || true;; esac; exit 0"
          }
        ]
      }
    ]
  }
}
```

- [x] **Step 2: Pipe-test both commands with synthetic hook input**

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"/Users/milos/projects/personal/portfolio/apps/web/.env.local"}}' | sh -c "$(jq -r '.hooks.PreToolUse[0].hooks[0].command' .claude/settings.json)"; echo "exit=$?"
```

Expected: `BLOCK: ... is a protected file` and `exit=2`.

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"/Users/milos/projects/personal/portfolio/README.md"}}' | sh -c "$(jq -r '.hooks.PreToolUse[0].hooks[0].command' .claude/settings.json)"; echo "exit=$?"
```

Expected: `exit=0`, no output.

```bash
printf 'const   x = 1\n' > /tmp/claude-hook-probe.ts
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/claude-hook-probe.ts"}}' | sh -c "$(jq -r '.hooks.PostToolUse[0].hooks[0].command' .claude/settings.json)"; cat /tmp/claude-hook-probe.ts; rm /tmp/claude-hook-probe.ts
```

Expected: `const x = 1;` (prettier ran).

- [x] **Step 3: Remove the `hooks` key from `.claude/settings.local.json`** (keep `permissions`, `enableAllProjectMcpServers`, `enabledMcpjsonServers`). Validate: `jq -e 'has("hooks") | not' .claude/settings.local.json` → `true`.

- [x] **Step 4: Validate schema shape and commit**

Run: `jq -e '.hooks.PreToolUse[] | select(.matcher == "Edit|Write") | .hooks[] | select(.type == "command") | .command' .claude/settings.json`
Expected: prints the command, exit 0.

```bash
git add .claude/settings.json
git commit -m "chore(claude): add project hooks for protected files and auto-format"
```

---

### Task 8: Fix every ESLint error and warning

Baseline on `main`: 7 errors, 8 warnings (`react-hooks/set-state-in-effect` ×6, `react-hooks/immutability` ×1, `@typescript-eslint/no-unused-vars` ×7, `react-hooks/exhaustive-deps` ×1). Target: 0 / 0 with `--max-warnings 0`. No `eslint-disable` anywhere.

#### 8a. Hydration and reduced-motion hooks (TDD)

**Files:**

- Create: `apps/web/src/hooks/use-is-hydrated.ts`
- Create: `apps/web/src/hooks/use-prefers-reduced-motion.ts`
- Test: `apps/web/src/hooks/__tests__/use-is-hydrated.test.tsx`
- Test: `apps/web/src/hooks/__tests__/use-prefers-reduced-motion.test.tsx`

- [x] **Step 1: Write the failing tests**

`apps/web/src/hooks/__tests__/use-is-hydrated.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useIsHydrated } from '../use-is-hydrated';

function Probe() {
  const hydrated = useIsHydrated();
  return <span>{hydrated ? 'client' : 'server'}</span>;
}

describe('useIsHydrated', () => {
  it('is false during server rendering', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('is true once mounted on the client', () => {
    const { result } = renderHook(() => useIsHydrated());
    expect(result.current).toBe(true);
  });
});
```

`apps/web/src/hooks/__tests__/use-prefers-reduced-motion.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '../use-prefers-reduced-motion';

type ChangeListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mediaQueryList = {
    matches: initialMatches,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: 'change', listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: ChangeListener) => listeners.delete(listener),
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(mediaQueryList),
  });
  return {
    setMatches(next: boolean) {
      mediaQueryList.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('reports the current media query state', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when the preference changes and unsubscribes on unmount', () => {
    const media = installMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);

    act(() => media.setMatches(true));
    expect(result.current).toBe(true);

    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter web exec vitest run src/hooks`
Expected: both files fail with `Failed to resolve import "../use-is-hydrated"` / `"../use-prefers-reduced-motion"`.

- [x] **Step 3: Implement the hooks**

`apps/web/src/hooks/use-is-hydrated.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` while server-rendering and hydrating, `true` once React has mounted on the client.
 * Replaces the `useEffect(() => setMounted(true), [])` pattern, which causes a cascading render
 * and is rejected by react-hooks/set-state-in-effect.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
```

`apps/web/src/hooks/use-prefers-reduced-motion.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mediaQueryList = window.matchMedia(QUERY);
  mediaQueryList.addEventListener('change', onChange);
  return () => mediaQueryList.removeEventListener('change', onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

/** Live value of the user's reduced-motion preference; `false` on the server. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

- [x] **Step 4: Run the tests again**

Run: `pnpm --filter web exec vitest run src/hooks`
Expected: 4 passed.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/hooks
git commit -m "feat(web): add hydration and reduced-motion hooks backed by useSyncExternalStore"
```

#### 8b. Theme provider as an external store, theme class before first paint

**Files:**

- Modify: `apps/web/src/components/theme-provider.tsx` (full rewrite)
- Modify: `apps/web/src/app/layout.tsx` (inline init script in `<head>`)
- Test: `apps/web/src/components/__tests__/theme-provider.test.tsx`

- [x] **Step 1: Write the failing test**

```tsx
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, ThemeProvider, useTheme } from '../theme-provider';

function Probe() {
  const { theme, toggleTheme, mounted } = useTheme();
  return (
    <button onClick={toggleTheme}>
      {theme}:{mounted ? 'mounted' : 'pending'}
    </button>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }),
    });
  });

  it('uses the stored theme and mirrors it onto <html>', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('light:mounted');
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });

  it('toggles and persists the theme', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('light:mounted');

    act(() => screen.getByRole('button').click());

    expect(screen.getByRole('button')).toHaveTextContent('dark:mounted');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});
```

Run: `pnpm --filter web exec vitest run src/components/__tests__/theme-provider.test.tsx`
Expected: fails (`THEME_STORAGE_KEY` is not exported; second test fails on `light:mounted` because the current provider starts as `dark`).

- [x] **Step 2: Rewrite `theme-provider.tsx`**

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  mounted: false,
});

// The theme lives outside React (localStorage + OS preference); React subscribes to it.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mediaQueryList = window.matchMedia(DARK_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  mediaQueryList.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    mediaQueryList.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

const getServerTheme = (): Theme => 'dark';

function writeTheme(next: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, next);
  listeners.forEach((listener) => listener());
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readTheme, getServerTheme);
  const mounted = useIsHydrated();

  // Mirror the theme onto <html>. The inline script in layout.tsx does the same before first paint.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    writeTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme, mounted }), [theme, toggleTheme, mounted]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [x] **Step 3: Set the class before first paint** — in `apps/web/src/app/layout.tsx` add above `export const metadata`:

```tsx
// Runs before React hydrates so the first paint already has the right theme (no light-to-dark flash).
const themeInitScript = `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.add(d?'dark':'light')}catch(e){document.documentElement.classList.add('dark')}})()`;
```

and inside `<head>` (before the JSON-LD components):

```tsx
<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
```

`<html suppressHydrationWarning>` is already present and covers the class the script adds.

- [x] **Step 4: Verify**

Run: `pnpm --filter web exec vitest run src/components/__tests__/theme-provider.test.tsx`
Expected: 2 passed.
Run: `pnpm --filter web exec eslint src/components/theme-provider.tsx src/app/layout.tsx`
Expected: no output (clean).

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/theme-provider.tsx apps/web/src/components/__tests__/theme-provider.test.tsx apps/web/src/app/layout.tsx
git commit -m "fix(web): make the theme provider an external store and apply the theme before first paint"
```

#### 8c. Boot loader: derive state instead of setting it in effects

**Files:**

- Modify: `apps/web/src/components/animated-hero/index.tsx`

- [x] **Step 1: In `BootstrapLoader`** replace the state block and the two effects with:

```tsx
function BootstrapLoader({ visible }: { visible: boolean }) {
  const [shouldRender, setShouldRender] = useState(true);
  const [progress, setProgress] = useState(0);
  const [currentMessage, setCurrentMessage] = useState(0);
  // Derived, not stored: the loader is complete exactly when the hero is ready.
  const isComplete = !visible;
  const displayProgress = visible ? progress : 100;

  useEffect(() => {
    if (!visible) {
      // Remove from the DOM after the fade-out animation completes
      const timer = setTimeout(() => setShouldRender(false), 600);
      return () => clearTimeout(timer);
    }

    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        // Ease out - slower as it approaches 100
        const increment = Math.max(1, Math.floor((100 - prev) / 10));
        return Math.min(prev + increment, 95); // Cap at 95 until content loads
      });
    }, 50);

    // Cycle through boot messages
    const messageTimers = bootMessages.map((msg, i) =>
      setTimeout(() => setCurrentMessage(i), msg.delay),
    );

    return () => {
      clearInterval(progressInterval);
      messageTimers.forEach(clearTimeout);
    };
  }, [visible]);

  if (!shouldRender) return null;
```

then replace the three JSX usages of `progress` (`width: \`${progress}%\``, `{progress}%`, `progress === 100 ? 'COMPLETE' : 'LOADING'`) with `displayProgress`.

- [x] **Step 2: In `AnimatedHero`** replace

```tsx
const [mounted, setMounted] = useState(false);

useEffect(() => {
  setMounted(true);
}, []);
```

with

```tsx
const mounted = useIsHydrated();
```

and add `import { useIsHydrated } from '@/hooks/use-is-hydrated';`. `useState`/`useEffect` stay imported (still used by `BootstrapLoader`).

- [x] **Step 3: Verify**

Run: `pnpm --filter web exec eslint src/components/animated-hero/index.tsx`
Expected: clean.
Run: `pnpm --filter web test`
Expected: all green (the boot loader has no unit test; the e2e suite in Task 9 covers it).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/animated-hero/index.tsx
git commit -m "fix(web): derive boot loader completion state instead of setting it in effects"
```

#### 8d. Loop phase: declare the animation callback before the effect that uses it

**Files:**

- Modify: `apps/web/src/components/animated-hero/loop-phase.tsx`

- [x] **Step 1:** change the React import to `import { useCallback, useEffect, useRef, useState } from 'react';`, move the whole `const animateHealing = () => { ... };` block _above_ the `useEffect`, wrap it as

```tsx
const animateHealing = useCallback(() => {
  // (body unchanged)
}, []);
```

(the body only uses state setters, refs, `gsap` and the module constant `healingTimeline`, all stable), and change the effect's dependency array from `[]` to `[animateHealing]` and `onEnter: () => animateHealing()` to `onEnter: animateHealing`.

- [x] **Step 2: Verify and commit**

Run: `pnpm --filter web exec eslint src/components/animated-hero/loop-phase.tsx` → clean.

```bash
git add apps/web/src/components/animated-hero/loop-phase.tsx
git commit -m "fix(web): stabilise the loop phase animation callback ordering"
```

#### 8e. Tmux background and circuit background use the shared hook

**Files:**

- Modify: `apps/web/src/components/animated-hero/tmux-background.tsx`
- Modify: `apps/web/src/components/animated-hero/use-gsap-scroll.ts`
- Modify: `apps/web/src/components/animated-hero/circuit-background.tsx`

- [x] **Step 1: `tmux-background.tsx`** — add `import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';`; in `TmuxBackground` replace `const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);` with `const prefersReducedMotion = usePrefersReducedMotion();` and delete the whole `// Detect reduced motion preference` effect. In `AnimatedPane`, change the effect dependency array `[addLine, config.speed]` to `[addLine, config.speed, isVisibleRef]`.

- [x] **Step 2: `use-gsap-scroll.ts`** — delete the `usePrefersReducedMotion` function and drop `useState` from the React import (keep `useEffect`, `useRef`).

- [x] **Step 3: `circuit-background.tsx`** — change `import { usePrefersReducedMotion } from './use-gsap-scroll';` to `import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';`.

- [x] **Step 4: Verify and commit**

Run: `pnpm --filter web exec eslint src/components/animated-hero` → clean apart from the unused-var warnings handled in 8g.
Run: `pnpm --filter web test` → green (the tmux tests mock `matchMedia`).

```bash
git add apps/web/src/components/animated-hero/tmux-background.tsx apps/web/src/components/animated-hero/use-gsap-scroll.ts apps/web/src/components/animated-hero/circuit-background.tsx
git commit -m "refactor(web): read reduced-motion preference through the shared hook"
```

#### 8f. Remove the dead `Hero` component

**Files:**

- Delete: `apps/web/src/components/hero.tsx` (only referenced by the barrel export; `app/page.tsx` renders `AnimatedHero`)
- Modify: `apps/web/src/components/index.ts` (remove `export { Hero } from './hero';`)

- [x] **Step 1:** `git rm apps/web/src/components/hero.tsx`, remove the export line.
- [x] **Step 2:** Run `grep -rn "components'" apps/web/src | grep -c Hero` → `0`; `pnpm --filter web build` → green.
- [x] **Step 3:** Commit: `git commit -am "refactor(web): remove unused Hero component"`

#### 8g. Unused imports and variables

**Files and exact edits:**

- `apps/web/src/app/about/page.tsx`: delete line 2 `import Link from 'next/link';`
- `apps/web/src/components/animated-hero/__tests__/tmux-background.test.tsx`: the `IntersectionObserver` mock constructor declares `_callback`/`_options` it never uses — change the constructor signature to `constructor() {}`
- `apps/web/src/components/animated-hero/execution-phase.tsx`: remove `useMemo, useCallback` from the React import
- `apps/web/src/components/animated-hero/section-progress.tsx`: remove `memo` from the React import
- `apps/web/src/components/animated-hero/strategy-phase.tsx` line 167: `techChoices.map((tech, index) => (` → `techChoices.map((tech) => (`

- [x] **Step 1: Apply the edits, then run the full gate**

Run: `pnpm lint`
Expected: `Tasks: 2 successful` and no `✖` lines (0 errors, 0 warnings under `--max-warnings 0`).
Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: all green.

- [x] **Step 2: Commit**

```bash
git add -A apps/web/src
git commit -m "fix(web): remove unused imports and variables"
```

---

### Task 9: End-to-end tests

**Files:**

- Modify: `apps/web/e2e/hero.spec.ts` (three tests)
- Modify: `apps/web/playwright.config.ts`

- [ ] **Step 1: Replace the three failing tests**

```ts
test('renders player card with CV data', async ({ page }) => {
  // exact: true — the sr-only SEO paragraph and the footer also contain the name.
  await expect(page.getByText('Milos Cvetkovic', { exact: true })).toBeVisible();
  await expect(page.getByText('Full Stack Engineer & Architect', { exact: true })).toBeVisible();
  await expect(page.getByText('AI-Native Development', { exact: true })).toBeVisible();
});
```

```ts
test('tmux log lines animate into panes', async ({ page }) => {
  // The kubectl pane always starts with the same two entries; later ones arrive every ~650 ms.
  await expect(page.getByText('$ kubectl get pods -n production -w').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('api-server-6d7f4c8b9-x2k9p').first()).toBeVisible({
    timeout: 15_000,
  });
});
```

```ts
test('scroll indicator fades on scroll', async ({ page }) => {
  const indicator = page.getByText('Scroll', { exact: true }).first().locator('..');
  await expect(indicator).toHaveCSS('opacity', '1');

  await page.evaluate(() => window.scrollTo(0, 500));

  // Playwright counts opacity:0 elements as visible, so assert the computed style the fade produces.
  await expect(indicator).toHaveCSS('opacity', '0');
});
```

- [ ] **Step 2: Replace `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI runs the production build (`pnpm build` runs first); locally the dev server is reused.
    command: isCI ? 'pnpm start' : 'pnpm dev',
    port: 3000,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 3: Verify locally in both modes**

Run: `pnpm --filter web test:e2e`
Expected: `9 passed`.
Run: `pnpm --filter web build && CI=1 pnpm --filter web test:e2e`
Expected: `9 passed` against `next start`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/hero.spec.ts apps/web/playwright.config.ts
git commit -m "test(web): fix hero e2e assertions and run against the production build in ci"
```

---

### Task 10: GitHub Actions, Dependabot, PR template

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/pull_request_template.md`

- [ ] **Step 1: `.github/workflows/ci.yml`** (actions SHA-pinned to the releases verified on 2026-09-08)

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

# PRs: cancel superseded runs. main: never cancel, every commit gets full results.
concurrency:
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

env:
  TURBO_TELEMETRY_DISABLED: '1'
  NEXT_TELEMETRY_DISABLED: '1'

jobs:
  quality:
    name: Format, lint, typecheck, unit tests, build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up pnpm (version from package.json#packageManager)
        uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0

      - name: Set up Node (version from .nvmrc)
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Format check
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

      - name: Build
        run: pnpm build

  e2e:
    name: End-to-end (Playwright against the production build)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

      - name: Set up pnpm (version from package.json#packageManager)
        uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0

      - name: Set up Node (version from .nvmrc)
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .nvmrc
          cache: pnpm

      - name: Install
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm --filter web exec playwright install --with-deps chromium

      - name: Build web
        run: pnpm --filter web build

      - name: Run e2e tests
        run: pnpm --filter web test:e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 7
```

- [ ] **Step 2: `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      minor-and-patch:
        update-types: [minor, patch]
    commit-message:
      prefix: build
      include: scope
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    commit-message:
      prefix: ci
      include: scope
```

- [ ] **Step 3: `.github/pull_request_template.md`**

```markdown
## Summary

<!-- What changed and why, in two or three sentences. Link the plan or ADR if one exists. -->

## Verification

<!-- Commands you ran and their result. "Seems fine" is not evidence. -->

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter web test:e2e` (when the UI changed)

## Review

- [ ] A reviewer other than the author (human, or the `adversarial-reviewer` / `edge-case-hunter` agents) has looked at the diff; findings are addressed or listed here.
```

- [ ] **Step 4: Validate YAML and commit**

Run: `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); YAML.load_file(".github/dependabot.yml"); puts "yaml ok"'`
Expected: `yaml ok`.

```bash
git add .github
git commit -m "ci: add github actions quality and e2e workflows with sha-pinned actions"
```

---

### Task 11: Open the pull request and get it green

- [ ] **Step 1: Update the checkboxes in this plan** and commit: `git commit -am "docs(plans): mark tooling plan tasks complete"`.
- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin chore/tooling-and-quality-gates
gh pr create --title "chore: repo tooling, quality gates and CI" --body-file /tmp/pr-a-body.md
```

The body lists the stop-condition commands with their actual output and links this plan.

- [ ] **Step 3: Watch CI**

Run: `gh pr checks --watch`
Expected: `quality` and `e2e` both pass. If not, fix on the branch (never `--no-verify`, never skip a test) and push again.

- [ ] **Step 4: Maker ≠ checker** — run the `adversarial-reviewer` agent on `git diff main...HEAD` (diff only) and `edge-case-hunter` on the changed files; triage findings in the PR description (fixed / deferred with reason / rejected with reason).
- [ ] **Step 5: Hand-off** — report the PR link and the merge question (design §7.1) to Milos. Do not merge without an answer.
