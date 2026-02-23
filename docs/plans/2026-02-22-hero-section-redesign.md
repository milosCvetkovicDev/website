# Hero Section Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the monotonous global background and generic hero content with a tmux/iTerm2-style terminal background (5 animated log panes) and a story-driven foreground (CV-accurate player card, "This happened at 3am" headline, skill tags) wrapped in a frosted glass content island.

**Architecture:** The tmux background is a single client component that renders 5 terminal panes with animated log sequences (K8s, PostgreSQL, CI/CD, Nginx, Prometheus). The foreground content sits inside a frosted glass island with `backdrop-filter: blur`. The old global background layers (GridBackground, AmbientBackground, ScanLines) are removed entirely — background is now scoped to the hero section only via `position: absolute`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Next.js App Router, Geist Mono (already loaded)

**Reference:** Approved design prototype at `docs/design-previews/hero-redesign-v5.html`

---

### Task 1: Create the TmuxBackground component

**Files:**
- Create: `apps/web/src/components/animated-hero/tmux-background.tsx`

**Step 1: Create the tmux background with log data and pane rendering**

This is the largest new file. It renders the full tmux UI (tab bar, 5 panes with title/status bars, bottom status bar) and animates log lines into each pane using `setTimeout` loops.

The component must:
- Be a `'use client'` component
- Use `useEffect` for animation loops with cleanup
- Use `useRef` for DOM manipulation (appending log lines)
- Respect `prefers-reduced-motion` (skip animation, show static content)
- Throttle DOM operations (no requestAnimationFrame needed — setTimeout at 400-900ms intervals)

Port the exact HTML structure, CSS classes (as Tailwind), log data arrays, and JS animation logic from `docs/design-previews/hero-redesign-v5.html`.

Key decisions:
- Use Tailwind classes where possible, inline styles for complex gradients
- Log data arrays are constants defined at module level (not in component)
- Each pane is its own `<div>` with title bar, scrollable body, and status bar
- Clock in the tab bar ticks every second via `setInterval`
- Use `font-mono` (Geist Mono) instead of JetBrains Mono — already loaded in the project

**Step 2: Typecheck**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/tmux-background.tsx
git commit -m "feat: add TmuxBackground component with 5 animated terminal panes"
```

---

### Task 2: Rewrite loading-screen.tsx with new foreground content

**Files:**
- Modify: `apps/web/src/components/animated-hero/loading-screen.tsx`

**Step 1: Rewrite the hero content**

Replace the entire component. The new version has:
- `TmuxBackground` as the background (absolute positioned)
- Overlay layers (glow, vignette, fades) — pure CSS divs
- Content island — frosted glass wrapper (`backdrop-blur`, dark semi-transparent bg)
- Compact player card inside the island (using existing `Terminal` and `StatDisplay` from `hud-elements.tsx`)
- Updated stats from CV: CLASS → "Full Stack Engineer & Architect", SPEC → "AI-Native Development", XP → "13 years · 6 domains · 3 clouds", STATUS → "Building at Obsidian 22"
- Headline: "This happened at 3am." (nowrap) + "Nobody woke up."
- Subtitle: "I build systems that inherit chaos and ship clarity." + gradient "Scroll to see how."
- Skill tags: TypeScript, React, NestJS, Azure, Terraform, Claude Code, DDD, Kubernetes
- Scroll indicator (same as current, repositioned to `bottom-11` to clear tmux status bar)

**Step 2: Typecheck**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/loading-screen.tsx
git commit -m "feat: rewrite hero with tmux background, content island, and CV-accurate player card"
```

---

### Task 3: Remove global background layers from AnimatedHero

**Files:**
- Modify: `apps/web/src/components/animated-hero/index.tsx`

**Step 1: Remove global background imports and rendering**

Remove these from `index.tsx`:
- Import: `import { GridBackground, ScanLines } from './ambient-background';`
- Lazy import: `const AmbientBackground = lazy(() => import('./ambient-background')...);`
- Memoized wrappers: `const MemoizedGridBackground = memo(GridBackground);` and `const MemoizedScanLines = memo(ScanLines);`
- JSX: `<MemoizedGridBackground />`, `<Suspense fallback={null}><AmbientBackground /></Suspense>`, `<MemoizedScanLines />`

Background is now handled inside `LoadingScreen` via `<TmuxBackground />`.

**Step 2: Typecheck**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/components/animated-hero/index.tsx
git commit -m "refactor: remove global background layers from AnimatedHero"
```

---

### Task 4: Delete unused ambient-background.tsx

**Files:**
- Delete: `apps/web/src/components/animated-hero/ambient-background.tsx`

**Step 1: Verify no other imports**

Run: `grep -r "ambient-background" apps/web/src/ --include="*.tsx" --include="*.ts"`
Expected: Only `index.tsx` (already cleaned in Task 3). If any other file imports it, update that file first.

**Step 2: Delete the file**

```bash
rm apps/web/src/components/animated-hero/ambient-background.tsx
```

**Step 3: Typecheck**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove unused ambient-background.tsx"
```

---

### Task 5: Add hero-specific CSS variables and keyframes to globals.css

**Files:**
- Modify: `apps/web/src/app/globals.css`

**Step 1: Add tmux-specific CSS custom properties**

Add to the `.dark` block in globals.css:
```css
  --tmux-border: #5a6190;
  --tmux-bar: #282d45;
  --tmux-bg: #0d1017;
```

And add the `logAppear` keyframe animation (used by the tmux log lines):
```css
@keyframes log-appear {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-log-appear {
  animation: log-appear 0.25s ease forwards;
}
```

**Step 2: Typecheck + lint**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm typecheck && pnpm lint`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "style: add tmux background CSS variables and log-appear animation"
```

---

### Task 6: Visual QA in browser

**Files:**
- Potentially tweak: `tmux-background.tsx`, `loading-screen.tsx`, `globals.css`

**Step 1: Start dev server and test**

Run: `cd /Users/milos/projects/personal/portfolio/.claude/worktrees/go-live && pnpm dev:web`

Open http://localhost:3000 and verify:
- [ ] Tmux background renders with 5 panes, tab bar, status bar
- [ ] Log lines animate into each pane at different speeds
- [ ] Content island is centered with frosted glass effect
- [ ] Player card shows correct CV data
- [ ] Headline reads "This happened at 3am. / Nobody woke up."
- [ ] Skill tags render on one row
- [ ] Scroll indicator works and fades on scroll
- [ ] Scrolling past hero section shows clean dark background (no bleed)
- [ ] Boot loader still works and fades into hero correctly
- [ ] Dark mode works (default)
- [ ] Light mode doesn't break (tmux bg should only show in dark mode or adapt)
- [ ] Mobile responsive — content island stacks properly, panes still visible behind
- [ ] `prefers-reduced-motion` disables log animations
- [ ] No console errors

**Step 2: Fix any issues found**

**Step 3: Commit**

```bash
git add -A
git commit -m "style: polish hero section after visual QA"
```

---

### Task 7: Clean up design preview files

**Files:**
- Delete: `docs/design-previews/` directory (all HTML and SVG files)

These were temporary design exploration artifacts.

**Step 1: Delete**

```bash
rm -rf docs/design-previews/
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove temporary design preview files"
```
