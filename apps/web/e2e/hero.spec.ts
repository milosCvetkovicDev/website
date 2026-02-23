import { test, expect } from '@playwright/test';

test.describe('Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    // Wait for hero content to be visible instead of arbitrary timeout
    await page.waitForSelector('h1', { state: 'visible' });
  });

  test('renders the headline', async ({ page }) => {
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('This happened at 3am');
    await expect(h1).toContainText('Nobody woke up');
  });

  test('renders player card with CV data', async ({ page }) => {
    await expect(page.getByText('Milos Cvetkovic')).toBeVisible();
    await expect(page.getByText('Full Stack Engineer & Architect')).toBeVisible();
    await expect(page.getByText('AI-Native Development')).toBeVisible();
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
    // Wait for actual log content to appear instead of arbitrary timeout
    await expect(page.getByText('OOMKilled', { exact: false }).first()).toBeVisible({ timeout: 10000 });
  });

  test('scroll indicator fades on scroll', async ({ page }) => {
    const scrollIndicator = page.getByText('Scroll', { exact: true }).first();
    await expect(scrollIndicator).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);

    // Should be hidden after scrolling
    await expect(scrollIndicator).toBeHidden();
  });

  test('dark mode toggles hero appearance', async ({ page }) => {
    // Find and click the theme toggle
    const themeToggle = page.getByRole('button', { name: /switch to light mode/i });
    await themeToggle.click();

    // Verify the page switched (html should not have .dark class)
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).not.toContain('dark');

    // Toggle back
    const darkToggle = page.getByRole('button', { name: /switch to dark mode/i });
    await darkToggle.click();

    const htmlClass2 = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass2).toContain('dark');
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
