# Route-wide Hydration Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every e2e spec can wait for hydration on any route, through one shared helper that waits on
a marker the root layout renders, and the five specs that interact off `/` without a wait use it.

**Architecture:** A client component, `HydrationMarker`, renders a hidden
`<span id="hydration-marker" data-hydrated>` from `useIsHydrated()`. `app/layout.tsx` renders it once,
so the served HTML says `false` on every route and React flips it to `true` straight after the
hydration commit. `e2e/support/hydration.ts` keeps PR #74's API (`expectHydrated`, `gotoHydrated`)
and waits positively on that attribute, then on the home page's boot loader until #47 deletes it.
The marker id lives in an import-free module, `src/lib/hydration-marker.ts`, so the component, the
unit test and the e2e specs share one spelling.

**Tech Stack:** Next.js 16 App Router, React 19 (`useSyncExternalStore`, `hydrateRoot`), Vitest with
jsdom and Testing Library, Playwright 1.63.

**Design:** [2026-09-13-route-hydration-marker-design.md](2026-09-13-route-hydration-marker-design.md)
(decisions D1-D7).

**Branch:** `test/route-hydration-marker`, from `main` at `da4021e`. Not stacked on #73 or #74.

**Stop condition for the whole plan (all must hold):**

```bash
pnpm check:allowbuilds && pnpm test:scripts && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # exit 0
pnpm --filter web test:e2e                                        # exit 0, dev server
pnpm --filter web build && CI=true pnpm --filter web test:e2e     # exit 0, production build
git status --porcelain apps/web                                   # prints nothing
```

Run one suite at a time. Parallel sessions on this machine already push the load average high
enough to fail timing assertions, and a second suite of our own makes it worse. Every command
below runs from the repository root, after loading nvm:
`export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22`.

---

### Task 0: Commit this plan

**Files:**

- Create: `docs/plans/2026-09-15-route-hydration-marker-plan.md` (this file)
- Modify: `docs/plans/2026-09-13-route-hydration-marker-design.md` (status Approved; D4 gains the
  boot-loader wait, found while writing this plan)
- Modify: `docs/plans/README.md` (an Index row for this plan)

- [x] **Step 1: Commit the three documents**

```bash
git add docs/plans/2026-09-15-route-hydration-marker-plan.md docs/plans/2026-09-13-route-hydration-marker-design.md docs/plans/README.md
git commit -m "docs(plans): plan the route-wide hydration marker"
```

Expected: one commit touching exactly those three files.

---

### Task 1: Record the first-load JS baseline

The design's Consequences promise a before-and-after figure for `/` and `/work`. The "before" has to
come from this commit, before any code changes.

**Files:** none (the figures go into the pull request description)

- [x] **Step 1: Build the base commit**

Run: `pnpm --filter web build`
Expected: exit 0 and a route table listing `/` and `/work` as static.

- [x] **Step 2: Serve it on a private port**

Run in a second shell: `pnpm --filter web exec next start -p 3219`
Expected: `Ready` on `http://localhost:3219`.

- [x] **Step 3: Sum the gzip size of every script each document references**

```bash
for p in / /work; do
  curl -s "http://localhost:3219$p" | grep -oE '/_next/static/[^"]+\.js' | sort -u |
    while read -r s; do curl -s "http://localhost:3219$s" | gzip -9 -c | wc -c; done |
    awk -v p="$p" '{ t += $1 } END { printf "%s %d bytes gzip\n", p, t }'
done
```

Expected: two lines, `/ <n> bytes gzip` and `/work <n> bytes gzip`. Keep both for the pull request.

- [x] **Step 4: Stop the server**

Run: `lsof -ti tcp:3219 | xargs kill`
Expected: `lsof -ti tcp:3219` prints nothing.

---

### Task 2: The marker id and the `HydrationMarker` component

**Files:**

- Create: `apps/web/src/lib/hydration-marker.ts`
- Create: `apps/web/src/components/hydration-marker.tsx`
- Test: `apps/web/src/components/__tests__/hydration-marker.test.tsx`

- [x] **Step 1: Write the failing unit test**

Create `apps/web/src/components/__tests__/hydration-marker.test.tsx`:

```tsx
import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';
import { HydrationMarker } from '../hydration-marker';

let container: HTMLDivElement | undefined;
let root: Root | undefined;

/**
 * Exactly the markup the server sends for the marker, in a container attached to the document. The
 * markup is parsed with `DOMParser`, which runs no scripts, and its nodes are moved into the container,
 * as a browser does with the response before React hydrates it.
 */
function serverRendered(): { host: HTMLDivElement; marker: Element } {
  const served = new DOMParser().parseFromString(renderToString(<HydrationMarker />), 'text/html');
  const host = document.createElement('div');
  host.append(...served.body.childNodes);
  document.body.append(host);
  container = host;
  const marker = host.querySelector(`#${HYDRATION_MARKER_ID}`);
  if (!marker) throw new Error(`the server render has no #${HYDRATION_MARKER_ID}`);
  return { host, marker };
}

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  vi.restoreAllMocks();
});

describe('HydrationMarker', () => {
  it('is unhydrated and hidden in the server-rendered markup', () => {
    const { host, marker } = serverRendered();

    expect(host.querySelectorAll(`#${HYDRATION_MARKER_ID}`)).toHaveLength(1);
    expect(marker).toHaveAttribute('data-hydrated', 'false');
    expect(marker).toHaveAttribute('hidden');
  });

  it('reads hydrated once React hydrates that markup, without a mismatch', async () => {
    const { host, marker } = serverRendered();
    const onRecoverableError = vi.fn();
    // React reports a text or structure mismatch through `onRecoverableError` and renders that subtree
    // anew. An attribute-only mismatch, the only kind this component could produce, is left unpatched
    // and reported through `console.error` alone, so both channels are watched.
    const consoleError = vi.spyOn(console, 'error');

    await act(async () => {
      root = hydrateRoot(host, <HydrationMarker />, { onRecoverableError });
    });

    // The same node, so the server markup was hydrated rather than replaced.
    expect(host.querySelector(`#${HYDRATION_MARKER_ID}`)).toBe(marker);
    expect(marker).toHaveAttribute('data-hydrated', 'true');
    expect(marker).toHaveAttribute('hidden');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter web exec vitest run src/components/__tests__/hydration-marker.test.tsx`
Expected: FAIL, with Vite unable to resolve `@/lib/hydration-marker` or `../hydration-marker`.

- [x] **Step 3: Add the id module**

Create `apps/web/src/lib/hydration-marker.ts`:

```ts
/**
 * The id of the element the root layout renders so that a test can tell the page has hydrated.
 *
 * Shared by `HydrationMarker` and by `e2e/support/hydration.ts`, which imports this file directly
 * from Playwright's loader. It therefore imports nothing, like `theme.ts` beside it, which the e2e
 * specs import the same way.
 */
export const HYDRATION_MARKER_ID = 'hydration-marker';
```

- [x] **Step 4: Add the component**

Create `apps/web/src/components/hydration-marker.tsx`:

```tsx
'use client';

import { useIsHydrated } from '@/hooks/use-is-hydrated';
import { HYDRATION_MARKER_ID } from '@/lib/hydration-marker';

/**
 * A hidden element whose `data-hydrated` reads `false` in the served HTML and `true` once React has
 * hydrated the page. The root layout renders it on every route, so an e2e spec can wait for
 * hydration anywhere, not only on `/` (see `e2e/support/hydration.ts`).
 *
 * The value is `useIsHydrated`'s. Its server snapshot is what both the server render and the hydration
 * render read, and React re-renders from the client snapshot straight after the hydration commit, so
 * the attribute changes with no effect and no mismatch (ADR 0006).
 *
 * `hidden` keeps it out of layout, out of the accessibility tree and out of the tab order. It hydrates
 * with the layout, so content a page wraps in `<Suspense>`, or puts under a `loading.tsx`, would
 * hydrate after it flips.
 */
export function HydrationMarker() {
  const hydrated = useIsHydrated();
  return <span id={HYDRATION_MARKER_ID} hidden data-hydrated={hydrated ? 'true' : 'false'} />;
}
```

- [x] **Step 5: Run the test and watch it pass**

Run: `pnpm --filter web exec vitest run src/components/__tests__/hydration-marker.test.tsx`
Expected: PASS, 2 tests.

- [x] **Step 6: Commit**

```bash
git add apps/web/src/lib/hydration-marker.ts apps/web/src/components/hydration-marker.tsx apps/web/src/components/__tests__/hydration-marker.test.tsx docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "test(web): add a hydration marker derived from useIsHydrated"
```

---

### Task 3: The shared helper and the route-wide marker spec (red)

The spec is written first and run against a layout that does not render the marker yet. That run is
the red half of D4: it shows the positive wait failing instead of passing. The commit waits for Task 4,
so the branch never carries a red e2e spec.

**Files:**

- Create: `apps/web/e2e/support/hydration.ts`
- Create: `apps/web/e2e/hydration-marker.spec.ts`

- [x] **Step 1: Add the helper with #74's exact exports and signatures**

Create `apps/web/e2e/support/hydration.ts`:

```ts
import { expect, type Page, type Response } from '@playwright/test';
import { HYDRATION_MARKER_ID } from '../../src/lib/hydration-marker';

/**
 * The one place that knows how a spec tells the page has hydrated.
 *
 * Events fired before React hydrates are lost: a click, a hover or a Tab press lands on server markup
 * with no listeners behind it, and the spec then fails, or passes, for a reason that has nothing to
 * do with what it tests. So a spec that interacts waits here first.
 *
 * The root layout renders `HydrationMarker` on every route: a hidden `#hydration-marker` whose
 * `data-hydrated` is `false` in the served HTML and `true` once React has hydrated
 * (`src/components/hydration-marker.tsx`). The wait is positive, so a route that stops rendering the
 * marker times out here instead of passing at once.
 *
 * The marker hydrates with the layout. Content a page wraps in `<Suspense>`, or puts under a
 * `loading.tsx`, hydrates in a later pass, after the marker flips. No route puts `<main>` inside a
 * boundary today. The one boundary with content, the decorative `TmuxBackground` on `/`, may
 * hydrate after the marker, and no spec interacts with it.
 */

/**
 * How long the marker may take to read `true`. Locally, the dev server compiles a route on its first
 * request. The test's own timeout, 30 s by default, still bounds the whole test.
 */
const HYDRATION_TIMEOUT_MS = 30_000;

/**
 * How long the home page's boot loader may stay once the page has hydrated.
 * It unmounts after 600 ms.
 */
const LOADER_TIMEOUT_MS = 10_000;

/** The marker itself, for a spec that asserts on it rather than waiting through it. */
export const hydrationMarker = (page: Page) => page.locator(`#${HYDRATION_MARKER_ID}`);

/**
 * Waits until the current page has hydrated. Call it after `page.goto` or `page.reload`. A soft
 * navigation, such as a `<Link>` click, keeps the layout mounted and the marker `true`, so it needs no
 * wait, and this one would prove nothing there.
 */
export async function expectHydrated(page: Page): Promise<void> {
  await expect(
    hydrationMarker(page),
    `the root layout renders #${HYDRATION_MARKER_ID} on every route, and it never read data-hydrated="true"`,
  ).toHaveAttribute('data-hydrated', 'true', { timeout: HYDRATION_TIMEOUT_MS });
  // `/` also keeps its boot loader in the DOM for 600 ms after hydration, and the gates audit the page
  // behind it. So the wait includes it, until #47 (hero-9) deletes the loader and this line with it.
  // On other routes the locator matches nothing and this passes at once.
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({
    timeout: LOADER_TIMEOUT_MS,
  });
}

/**
 * Navigates to `path` and waits until the page has hydrated. Returns the navigation's response, so
 * a caller can still assert the status and the path it landed on.
 */
export async function gotoHydrated(
  page: Page,
  path: string,
  options?: Parameters<Page['goto']>[1],
): Promise<Response | null> {
  const response = await page.goto(path, options);
  await expectHydrated(page);
  return response;
}
```

- [x] **Step 2: Add the marker spec**

Create `apps/web/e2e/hydration-marker.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { HYDRATION_MARKER_ID } from '../src/lib/hydration-marker';
import { PAGE_ROUTES, expectedStatus } from './routes';
import { expectHydrated, hydrationMarker } from './support/hydration';

/**
 * The hydration marker every e2e wait keys on, pinned at both ends on every route.
 *
 * A wait on a marker that is never `false` proves nothing. So the served document must carry exactly
 * one `#hydration-marker` reading `false`, and the live page must reach `true`. With JavaScript off it
 * stays `false`, so nothing but hydration can satisfy `expectHydrated`.
 *
 * `/work/does-not-exist` joins `PAGE_ROUTES` because an unknown slug 404s at the routing layer, by a
 * different path from an unknown URL (ADR 0015), and both have to render the root layout.
 */

test.describe.configure({ retries: 0 });

const UNKNOWN_SLUG = '/work/does-not-exist';
const ROUTES = [...PAGE_ROUTES, UNKNOWN_SLUG];
const statusOf = (path: string) => (path === UNKNOWN_SLUG ? 404 : expectedStatus(path));

/**
 * The `data-hydrated` value of every `#hydration-marker` in `html`, parsed the way a browser parses it,
 * so that only an element with that id counts and not the id's text elsewhere in the response, such as
 * a script. A document made by `DOMParser` runs no scripts, so parsing the response hydrates nothing.
 */
function servedMarkers(page: Page, html: string): Promise<(string | null)[]> {
  return page.evaluate(
    ([markup, id]) =>
      [...new DOMParser().parseFromString(markup, 'text/html').querySelectorAll(`#${id}`)].map(
        (el) => el.getAttribute('data-hydrated'),
      ),
    [html, HYDRATION_MARKER_ID] as const,
  );
}

for (const path of ROUTES) {
  test(`${path} serves the marker unhydrated and hydrates it`, async ({ page, request }) => {
    const served = await request.get(path);
    expect(served.status(), `${path} should answer ${statusOf(path)}`).toBe(statusOf(path));
    expect(
      await servedMarkers(page, await served.text()),
      `the served HTML of ${path} must carry exactly one #${HYDRATION_MARKER_ID} reading "false"`,
    ).toEqual(['false']);

    const response = await page.goto(path);
    expect(response?.status(), `${path} should answer ${statusOf(path)}`).toBe(statusOf(path));
    await expectHydrated(page);
    // `hidden` must take the marker out of layout. A box-based visibility check cannot tell, because
    // an empty span has no height whether or not it is hidden.
    expect(await hydrationMarker(page).evaluate((el) => getComputedStyle(el).display)).toBe('none');
  });
}

test.describe('with JavaScript off', () => {
  test.use({ javaScriptEnabled: false });

  test('the marker stays unhydrated', async ({ page }) => {
    await page.goto('/work');
    // Proof that no script in the document ran: the theme init script classes <html> before first
    // paint, and the layout renders it with no class. `page.evaluate` still works, because the driver
    // injects it.
    expect(
      await page.evaluate(() => document.documentElement.className),
      'the theme init script added a class, so scripts are running: `javaScriptEnabled: false` did ' +
        'not take effect and this test is not measuring what it claims to',
    ).toBe('');
    await expect(hydrationMarker(page)).toHaveAttribute('data-hydrated', 'false');
  });
});
```

- [x] **Step 3: Run it against the unchanged layout and watch it fail**

Run: `pnpm --filter web exec playwright test e2e/hydration-marker.spec.ts --project chromium`
Expected: FAIL. Every route test fails at the served-markers assertion, with `Received: []` against
`Expected: ["false"]`, and the JavaScript-off test fails waiting for `#hydration-marker`. Paste the
first failure line into the pull request.

- [x] **Step 4: Show the positive wait failing on its own**

Temporarily comment out the served-markers `expect` in the route test, then run
`pnpm --filter web exec playwright test e2e/hydration-marker.spec.ts --project chromium -g "/work serves"`.
Expected: FAIL after 30 s, with the message
`the root layout renders #hydration-marker on every route, and it never read data-hydrated="true"`.
Paste that line into the pull request, then restore the `expect` (`git diff` on the spec shows only the
new file).

---

### Task 4: Render the marker from the root layout (green)

**Files:**

- Modify: `apps/web/src/app/layout.tsx:11-14` (import) and `:122-123` (render)

- [x] **Step 1: Import the component from its own module**

In `apps/web/src/app/layout.tsx`, after `import { ThemeProvider } from '@/components/theme-provider';`,
add:

```tsx
import { HydrationMarker } from '@/components/hydration-marker';
```

It must not come through the `@/components` barrel: the ADR 0009 lint rule on layouts fails on that.

- [x] **Step 2: Render it after `ThemeProvider`**

Change

```tsx
          <Footer />
        </ThemeProvider>
      </body>
```

to

```tsx
          <Footer />
        </ThemeProvider>
        <HydrationMarker />
      </body>
```

- [x] **Step 3: Run the marker spec and watch it pass**

Run: `pnpm --filter web exec playwright test e2e/hydration-marker.spec.ts --project chromium`
Expected: PASS, 12 tests (ten `PAGE_ROUTES`, `/work/does-not-exist`, and the JavaScript-off test).

- [x] **Step 4: Run the console gate, which catches a hydration mismatch the marker could introduce**

Run: `pnpm --filter web exec playwright test e2e/console-clean.spec.ts --project chromium`
Expected: PASS.

- [x] **Step 5: Lint and type-check**

Run: `pnpm lint && pnpm typecheck`
Expected: exit 0.

- [x] **Step 6: Commit Tasks 3 and 4 together**

```bash
git add apps/web/e2e/support/hydration.ts apps/web/e2e/hydration-marker.spec.ts apps/web/src/app/layout.tsx docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "test(web): render the hydration marker on every route and wait on it"
```

---

### Task 5: Wait for hydration in the five specs that interact off `/`

Each change moves when a test starts interacting and nothing else. `test.fail()` rows keep their
annotations.

**Files:**

- Modify: `apps/web/e2e/work-cards.spec.ts:1-2`, `:83`, `:97`, `:147-148`, `:183-184`
- Modify: `apps/web/e2e/case-study.spec.ts:1-2`, `:60`
- Modify: `apps/web/e2e/not-found.spec.ts:1-2`, `:56`
- Modify: `apps/web/e2e/theme.spec.ts:1-2`, `:97`, `:110`
- Modify: `apps/web/e2e/mobile/navigation.spec.ts:1-2`, `:30-34`

- [x] **Step 1: `work-cards.spec.ts`**

Add after the `case-studies` import:

```ts
import { gotoHydrated } from './support/hydration';
```

In the pointer test (`:83`) and the keyboard test (`:97`), change `await page.goto('/work');` to:

```ts
await gotoHydrated(page, '/work');
```

In the status-colour test (`:147-148`), change

```ts
await page.goto('/');
await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
```

to

```ts
await gotoHydrated(page, '/');
```

In the status-string test (`:183-184`), change

```ts
await page.goto('/');
await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
```

to

```ts
await gotoHydrated(page, '/');
```

- [x] **Step 2: `case-study.spec.ts`**

Add after the `case-studies` import:

```ts
import { gotoHydrated } from './support/hydration';
```

In the back-link test (`:60`), change ``await page.goto(`/work/${study.slug}`);`` to:

```ts
await gotoHydrated(page, `/work/${study.slug}`);
```

- [x] **Step 3: `not-found.spec.ts`**

Add after the `routes` import:

```ts
import { gotoHydrated } from './support/hydration';
```

In the recovery-links test (`:56`), change `await page.goto(NOT_FOUND_ROUTE);` to:

```ts
await gotoHydrated(page, NOT_FOUND_ROUTE);
```

- [x] **Step 4: `theme.spec.ts`**

Add after the `theme` import:

```ts
import { expectHydrated, gotoHydrated } from './support/hydration';
```

In the UI test (`:97`), change `await page.goto('/about');` to:

```ts
await gotoHydrated(page, '/about');
```

The toggle's pre-hydration label is also `Switch to light mode`: the placeholder is dark until
`mounted`. So without the wait, the click can land on server markup.

After `await page.reload();` (`:110`), add:

```ts
await expectHydrated(page);
```

The nav-link click after the reload needs the same wait.

- [x] **Step 5: `mobile/navigation.spec.ts`**

Add after the `routes` import:

```ts
import { gotoHydrated } from '../support/hydration';
```

Change `:30-34`

```ts
/** The loader only exists on `/`; elsewhere the locator matches nothing and this resolves at once. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });
}
```

to

```ts
/** Every test here interacts, on `/` and on other routes alike, so each one starts hydrated. */
async function open(page: Page, path: string) {
  await gotoHydrated(page, path);
}
```

- [x] **Step 6: Run the four desktop specs**

Run: `pnpm --filter web exec playwright test e2e/work-cards.spec.ts e2e/case-study.spec.ts e2e/not-found.spec.ts e2e/theme.spec.ts --project chromium`
Expected: exit 0. The `test.fail()` rows (R35, R36, R39) are reported as expected failures, not as
passes.

- [x] **Step 7: Run the phone spec on both phone projects**

Run: `pnpm --filter web exec playwright test e2e/mobile/navigation.spec.ts --project mobile-chrome --project mobile-safari`
Expected: exit 0, with R1-R9 still expected failures.

- [x] **Step 8: Confirm no spec here still writes its own wait**

Run: `grep -n "System Boot" apps/web/e2e/work-cards.spec.ts apps/web/e2e/case-study.spec.ts apps/web/e2e/not-found.spec.ts apps/web/e2e/theme.spec.ts apps/web/e2e/mobile/navigation.spec.ts`
Expected: exit 1, no output.

- [x] **Step 9: Commit**

```bash
git add apps/web/e2e/work-cards.spec.ts apps/web/e2e/case-study.spec.ts apps/web/e2e/not-found.spec.ts apps/web/e2e/theme.spec.ts apps/web/e2e/mobile/navigation.spec.ts docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "test(web): wait for hydration before interacting off the home page"
```

---

### Task 6: Documentation

**Files:**

- Modify: `CLAUDE.md` (Testing, the hydration bullet)
- Modify: `README.md:85`
- Modify: `CLAUDE.md` (Gotchas, the `NoFallbackError` bullet)

- [x] **Step 1: Rewrite the CLAUDE.md Testing bullet**

Replace

```markdown
- e2e specs must wait for hydration before interacting, because events fired before it are lost.
  `e2e/hero.spec.ts` waits for the `System Boot` loader to be hidden, and also asserts the page
  title.
```

with

```markdown
- e2e specs must wait for hydration before interacting, because events fired before it are lost.
  The root layout renders `HydrationMarker` (`src/components/hydration-marker.tsx`) on every route:
  a hidden `#hydration-marker` whose `data-hydrated` is `false` in the served HTML and `true` once
  React has hydrated. Wait through `e2e/support/hydration.ts` rather than writing a wait of your
  own: `gotoHydrated(page, path)` for a navigation, `expectHydrated(page)` after `page.reload()`. A
  soft navigation needs neither, and a spec with JavaScript off must call neither, because the
  marker never flips. The helper also waits out the home page's `System Boot` loader until #47
  deletes it; #74 moves six of the inline loader waits into the helper, and #47 removes the rest
  with the loader. The marker hydrates with the layout, so content a page wraps in `<Suspense>` or
  puts under a `loading.tsx` would hydrate after it flips. No route puts `<main>` inside a
  boundary; the one boundary with content today, the decorative `TmuxBackground` on `/`, may
  hydrate after the marker. `e2e/hero.spec.ts` asserts the page title.
```

The rest of that bullet, from "That assertion is only a smoke check", stays as it is.

- [x] **Step 2: Rewrite the last sentence of README.md:85**

Replace

```markdown
Interactions must wait for hydration: the hero spec waits for the boot loader to disappear before scrolling or clicking, because event listeners only exist after React mounts.
```

with

```markdown
Interactions must wait for hydration, because event listeners only exist after React mounts: the root layout renders a hidden `#hydration-marker` on every route that reads `false` in the served HTML and `true` once React has hydrated, and `apps/web/e2e/support/hydration.ts` waits on it.
```

- [x] **Step 2b: Correct the `NoFallbackError` Gotchas bullet**

Found while verifying: the bullet said the stack prints "twice per run", which was already four on
`main`, and `hydration-marker.spec.ts` requests `/work/does-not-exist` twice more. Replace its
opening with a count-free statement, "once for every request of an unknown `/work/*` slug", and
name the specs that request `/work/does-not-exist`.

- [x] **Step 3: Format check**

Run: `pnpm format:check`
Expected: exit 0.

- [x] **Step 4: Commit**

```bash
git add CLAUDE.md README.md docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "docs: describe the route-wide hydration marker and the shared wait"
```

---

### Task 7: Verification

**Files:** `docs/plans/2026-09-15-route-hydration-marker-plan.md` (ticks only)

- [ ] **Step 1: The seven CI gates**

Run: `pnpm check:allowbuilds && pnpm test:scripts && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: exit 0. Paste the tail of each into the pull request's Verification section.

- [ ] **Step 2: The whole e2e suite against the dev server**

Run: `pnpm --filter web test:e2e`
Expected: exit 0, no unexpected passes. If port 3210 is held by an orphan, clear it with
`lsof -ti tcp:3210 | xargs kill` rather than moving to another port.

- [ ] **Step 3: The whole e2e suite against the production build**

Run: `pnpm --filter web build && CI=true pnpm --filter web test:e2e`
Expected: exit 0.

- [ ] **Step 4: First-load JS after the change**

Repeat Task 1 Steps 2-4 against this build. Expected: `/` and `/work` each grow by the marker
component alone, a few hundred bytes gzip at most. Record both before-and-after pairs in the pull
request.

- [ ] **Step 5: The working tree is clean**

Run: `git status --porcelain apps/web`
Expected: no output. `next dev` writes untracked `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` in an
agent session; delete them, never commit them.

- [ ] **Step 6: Commit the ticks**

```bash
git add docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "docs(plans): record the hydration marker verification"
```

---

### Task 8: Review by agents that did not write the change

**Files:** none (findings go into the pull request's Review section)

- [ ] **Step 1: `ui-reviewer`** on `apps/web/src/components/hydration-marker.tsx` and
      `apps/web/src/app/layout.tsx`, given the file list.
- [ ] **Step 2: `adversarial-reviewer`**, given only `git diff origin/main...HEAD`.
- [ ] **Step 3: `edge-case-hunter`**, given the changed files.
- [ ] **Step 4: Triage every finding** as fixed, deferred with a reason, or rejected with a reason. A fix
      re-runs the task's own stop condition and the affected e2e spec.

---

### Task 9: Pull request

**Files:** `docs/plans/README.md` (the design's and the plan's rows name the pull request number)

- [ ] **Step 1: Push**

Run: `git push -u origin test/route-hydration-marker`

- [ ] **Step 2: Open it from `.github/pull_request_template.md`**

Title: `test(web): wait for hydration on every route, not only the home page`. The body carries:

- the red lines from Task 3 Steps 3 and 4;
- the verification output from Task 7;
- the first-load JS pairs;
- the review triage;
- a note for #47 (hero-9 no longer needs a marker of its own, and deleting the loader also deletes
  the loader line in `expectHydrated`) and for #50 (AC 12's helper now waits on this marker);
- a note that #74 will have a one-file add/add conflict on `e2e/support/hydration.ts`, resolved by
  keeping this body.

No local paths and no personal data.

- [ ] **Step 3: Put the pull request number in the Index rows and push**

```bash
git add docs/plans/README.md docs/plans/2026-09-15-route-hydration-marker-plan.md
git commit -m "docs(plans): link the hydration marker rows to their pull request"
git push
```

- [ ] **Step 4: Watch CI**

Expected: `Quality checks`, `E2E tests` and `Commit messages` are green on the head commit.
