import { test, expect } from '@playwright/test';

test.describe('Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    // Wait for hero content to be visible instead of arbitrary timeout
    await page.waitForSelector('h1', { state: 'visible' });
    // Guard against reuseExistingServer attaching to some other project's dev server on :3000.
    await expect(page).toHaveTitle(/Milos Cvetkovic/);
    // The boot loader is removed once React has hydrated; interactions before that are lost.
    await expect(page.getByText('System Boot')).toBeHidden({ timeout: 30_000 });
  });

  test('renders the headline', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('This happened at 3am');
    await expect(h1).toContainText('Nobody woke up');
  });

  test('renders player card with CV data', async ({ page }) => {
    // exact: true — the sr-only SEO paragraph and the footer also contain the name.
    await expect(page.getByText('Milos Cvetkovic', { exact: true })).toBeVisible();
    await expect(page.getByText('Full Stack Engineer & Architect', { exact: true })).toBeVisible();
    await expect(page.getByText('AI-Native Development', { exact: true })).toBeVisible();
  });

  test('renders all skill tags', async ({ page }) => {
    const tags = [
      'TypeScript',
      'React',
      'NestJS',
      'Azure',
      'Terraform',
      'Claude Code',
      'DDD',
      'Kubernetes',
    ];
    for (const tag of tags) {
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
    }
  });

  test('tmux background renders with 5 panes', async ({ page }) => {
    await expect(page.getByText('kubectl', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('psql', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('gh actions', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('nginx', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('prometheus', { exact: false }).first()).toBeVisible();
  });

  test('tmux log lines animate into panes', async ({ page }) => {
    // The kubectl pane always starts with the same entries; later ones arrive every ~650 ms.
    await expect(page.getByText('$ kubectl get pods -n production -w').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('api-server-6d7f4c8b9-x2k9p').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('tmux log lines do not shift layout', async ({ page }) => {
    // Lines start arriving after an idle callback plus up to two seconds; the kubectl pane always
    // opens with the same command, so its arrival marks the point where the panes are ticking.
    const firstLine = page.getByText('$ kubectl get pods -n production -w').first();
    await expect(firstLine).toBeVisible({ timeout: 15_000 });
    const slotsBefore = await firstLine.locator('..').innerText();
    const shiftScore = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          if (!PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
            reject(new Error('layout-shift entries are not supported in this browser'));
            return;
          }
          let total = 0;
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
              if (!shift.hadRecentInput) total += shift.value;
            }
          });
          observer.observe({ type: 'layout-shift' });
          // Roughly thirty more lines land across the five panes in this window.
          setTimeout(() => {
            observer.disconnect();
            resolve(total);
          }, 4_000);
        }),
    );
    // The window measured something: the pane's text moved on.
    expect(await firstLine.locator('..').innerText()).not.toBe(slotsBefore);
    expect(shiftScore).toBeLessThan(0.005);
  });

  test('story sections stay in the DOM after hydration', async ({ page }) => {
    // Holding each section's Suspense boundary suspended during hydration put the markup in the
    // HTML but let React replace it with the placeholder the moment the page hydrated, so the copy
    // and the closing call to action left the document until the visitor scrolled to them. This is
    // the guard for that: read the live DOM well after hydration, without scrolling.
    await page.goto('/');
    await expect(page.getByText('System Boot')).toBeHidden({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    for (const copy of ['TECH TREE', 'CI/CD PIPELINE', 'SELF-HEALING LOG']) {
      await expect(page.getByText(copy, { exact: false }).first()).toBeAttached();
    }
    await expect(page.getByRole('link', { name: /connect on linkedin/i })).toBeAttached();
  });

  test('story sections are server-rendered', async ({ page }) => {
    const response = await page.goto('/');
    const html = (await response?.text()) ?? '';
    // Plain text from four of the six sections (the headlines are split into per-character spans).
    for (const copy of ['TECH TREE', 'CI/CD PIPELINE', 'SELF-HEALING LOG', 'Connect on LinkedIn']) {
      expect(html).toContain(copy);
    }
  });

  test('scrolling through the story does not shift visible layout', async ({ page }) => {
    // Reduced motion, deliberately: the phases stage their own content in as they animate (the CI
    // pipeline rows, the healing log), and those are intended movements, not layout instability.
    // With motion off every section renders its end state, so anything that moves while scrolling
    // is the page being unstable — which is what this guard is for. It also makes the measurement
    // independent of machine load, which a run on a busy laptop is not.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // Programmatic scrolling is not user input, so nothing here is discounted as recent input.
    const shiftScore = await page.evaluate(async () => {
      let total = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!shift.hadRecentInput) total += shift.value;
        }
      });
      observer.observe({ type: 'layout-shift' });
      const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let y = 0; y <= document.documentElement.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await wait(150);
      }
      await wait(1_000);
      observer.disconnect();
      return total;
    });
    expect(shiftScore).toBeLessThan(0.02);
  });

  test('scroll indicator fades on scroll', async ({ page }) => {
    const indicator = page.getByText('Scroll', { exact: true }).first().locator('..');
    await expect(indicator).toHaveCSS('opacity', '1');

    await page.evaluate(() => window.scrollTo(0, 500));

    // Playwright counts opacity:0 elements as visible, so assert the computed style the fade produces.
    await expect(indicator).toHaveCSS('opacity', '0');
  });

  test('dark mode toggles hero appearance', async ({ page }) => {
    // Find and click the theme toggle
    const themeToggle = page.getByRole('button', {
      name: /switch to light mode/i,
    });
    await themeToggle.click();

    // Verify the page switched (html should not have .dark class)
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

    // Toggle back
    const darkToggle = page.getByRole('button', {
      name: /switch to dark mode/i,
    });
    await darkToggle.click();

    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  });

  test('hero content is SSR-rendered (SEO)', async ({ page }) => {
    // Check the raw HTML response for SSR content
    const response = await page.goto('/');
    const html = await response?.text();

    expect(html).toContain('This happened at 3am');
    expect(html).toContain('Milos Cvetkovic');
    expect(html).toContain('Full Stack Engineer');
    expect(html).toContain('TypeScript');
    expect(html).toContain('AI-native development'); // sr-only SEO text
  });

  test('has proper semantic HTML', async ({ page }) => {
    // Only one h1 on the page
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBe(1);

    // Hero section has aria-label
    const heroSection = page.locator(
      'section[aria-label="Hero - Milos Cvetkovic, Senior Full Stack Engineer"]',
    );
    await expect(heroSection).toBeAttached();

    // Skill tags use a list
    const skillList = page.locator('ul[aria-label="Technical skills"]');
    await expect(skillList).toBeAttached();
  });
});
