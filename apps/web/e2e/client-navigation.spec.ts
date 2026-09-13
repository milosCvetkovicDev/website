import { expect, test, type Page } from '@playwright/test';
import { caseStudies } from '../src/data/case-studies';

/**
 * A real client-side navigation, by clicking links.
 *
 * Every other spec reaches a page with `page.goto` or `request.get`, which is a full document load:
 * the App Router's soft navigation — the one the comment at `animated-hero/index.tsx:36` is about —
 * was never executed by any test. That leaves a whole class of bug uncovered. A soft navigation keeps
 * the React tree and the module registry alive, so state that should be per-route survives, an effect
 * that should have torn down keeps running, and a GSAP timeline built on the old DOM can write into
 * nodes React has since replaced. None of that is reachable from a `goto`.
 *
 * Green on arrival, and that is the point: it is the regression floor for #46 to #49, which all
 * change components on this path. The console collector listens for the whole walk, so a hydration
 * mismatch or a stray warning on any hop fails here — `console-clean.spec.ts` only ever sees the
 * first load of each route.
 *
 * Two assertions are about the soft navigation specifically rather than about arriving:
 * the boot loader must not reappear when we come back to `/` (it is gated on `useIsHydrated`, which
 * stays true for the life of the document, so a loader on the second visit means the tree was
 * remounted — a hard navigation dressed up as a soft one), and the story must still run, which is
 * what says the ScrollTriggers were rebuilt for the new DOM rather than left pointing at the old.
 */

interface Problem {
  kind: string;
  text: string;
}

function collectProblems(page: Page): Problem[] {
  const problems: Problem[] = [];
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning' || type === 'assert') {
      problems.push({ kind: `console.${type}`, text: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    problems.push({ kind: 'pageerror', text: error.stack || `${error.name}: ${error.message}` });
  });
  return problems;
}

test.describe('client-side navigation', () => {
  // 90 s covers four navigations, two loader waits and the story's own ~8 s of timers. No retries: this
  // is the regression floor for four tasks that all change components on this path, and a retry would
  // turn an intermittent hydration mismatch on a soft navigation — the exact class of bug this exists to
  // catch — into a green "flaky" run.
  test.describe.configure({ retries: 0, timeout: 90_000 });

  test('walks / to /work to a case study and back by link clicks', async ({ page }) => {
    const [study] = caseStudies;
    const problems = collectProblems(page);

    await page.goto('/');
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden({ timeout: 30_000 });

    // The header, scoped as `banner` rather than `navigation`: the `MC` home link is a sibling of the
    // `<nav>`, not inside it, so a `navigation`-scoped query for it resolves nothing and waits out the
    // whole test budget.
    const header = page.getByRole('banner');

    // 1. / -> /work, through the header's own nav link.
    await header.getByRole('link', { name: 'Work' }).click();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 2. /work -> a case study, by its card.
    await page
      .getByRole('link', { name: new RegExp(study.title, 'i') })
      .first()
      .click();
    await expect(page).toHaveURL(new RegExp(`/work/${study.slug}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(study.title);

    // 3. Back, which is the history entry the soft navigation pushed rather than a fresh load.
    await page.goBack();
    await expect(page).toHaveURL(/\/work$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // 4. Back to /, by the header's home link.
    await header.getByRole('link', { name: 'MC', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);

    // The loader is rendered on `visible={!mounted}` from `useIsHydrated()`, which never flips back
    // for the life of the document. Seeing it again would mean the tree was thrown away, so the
    // "client-side" navigation was really a document load.
    await expect(page.getByText('System Boot', { exact: true })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('This happened at 3am');

    // The story still runs after arriving softly: its ScrollTriggers were created against this DOM.
    // The closing CTA's breathing glow is the deepest signal on the page — it only starts once the
    // last section's entrance has run to completion, which means every trigger above it fired too.
    // `e2e/story.spec.ts` and `console-clean.spec.ts` read the same one.
    await page.evaluate(() => {
      const step = Math.max(1, Math.round(window.innerHeight * 0.75));
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      for (let y = 0; y <= bottom; y += step) window.scrollTo({ top: y, behavior: 'instant' });
      window.scrollTo({ top: bottom, behavior: 'instant' });
    });
    const cta = page.locator('a[href*="linkedin.com/in/"]', { hasText: 'Connect on LinkedIn' });
    await expect(cta).toHaveCount(1);
    await cta.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect
      .poll(() => cta.evaluate((el) => getComputedStyle(el).boxShadow), { timeout: 30_000 })
      .not.toBe('none');

    // Asserted last, so every hop's messages are in. Soft navigations are where a stale effect writing
    // into a replaced DOM shows up, and it shows up here as a console error, not as a wrong pixel.
    expect(
      problems.map(({ kind, text }) => `${kind}: ${text}`),
      'the whole client-side walk must stay silent: a "Minified React error #418"/"#423" or ' +
        '"Hydration failed" entry means a mismatch on one of the soft navigations.',
    ).toEqual([]);
  });
});
