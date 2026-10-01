import type { Page } from '@playwright/test';

/**
 * The tmux background's log stream on `/`: the slot container in each of its five panes
 * (`AnimatedPane` in `tmux-background.tsx`). Its lines are decoration painted in the `--log-*`
 * colours at 0.35 to 0.55 alpha, and they stream on a clock for as long as the page is open, so two
 * checks leave the containers out: the at-rest axe pass on `/` (`auditExcludingTmuxLogStream` in
 * `accessibility.spec.ts`, which gives the reasons) and the partial-alpha sweep of the hero in
 * `hero-contrast.spec.ts`. They share this one constant, so a renamed attribute breaks both at once
 * rather than turning one exclusion into a silent no-op, and each runs `tmuxLogStreamProblems`
 * before and after it reads the page, so the selector cannot come to cover anything but the stream.
 */
export const TMUX_LOG_STREAM = '[data-tmux-slots]';

/**
 * Everything wrong with what `TMUX_LOG_STREAM` matches, as messages, empty when it is safe to
 * exclude. It must match five elements, one in each `[data-tmux-pane]`, in a tree under
 * `aria-hidden="true"`. Each must be a `div` carrying only `data-tmux-slots`, `class` and `style`,
 * so it is itself no link, button, heading, landmark or focus stop. Each may hold only the slots
 * `createSlot` makes: a `div` with text, a pinned height and no attribute but `style`. A slot has no
 * child element, so nothing can sit deeper, and `StaticPane`'s reduced-motion lines, which pin no
 * height, fail. The negative control at the bottom of `accessibility.spec.ts` proves each part can
 * fail.
 */
export async function tmuxLogStreamProblems(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const containers = [...document.querySelectorAll(selector)];
    const found: string[] = [];
    if (containers.length !== 5) {
      found.push(`${selector} matches ${containers.length} elements, not the five slot containers`);
    }
    const panes = new Set<Element>();
    containers.forEach((container, index) => {
      const name = `slot container ${index + 1} of ${containers.length}`;
      const pane = container.closest('[data-tmux-pane]');
      if (!pane) found.push(`${name} is not inside a [data-tmux-pane]`);
      else if (panes.has(pane)) found.push(`${name} shares its pane with another`);
      else if (!pane.closest('[aria-hidden="true"]')) {
        found.push(`${name} is in a pane with no aria-hidden="true" ancestor`);
      }
      if (pane) panes.add(pane);
      if (container.tagName !== 'DIV') found.push(`${name} is a <${container.localName}>`);
      const allowed = ['data-tmux-slots', 'class', 'style'];
      for (const attribute of container.getAttributeNames()) {
        if (!allowed.includes(attribute)) found.push(`${name} carries ${attribute}`);
      }
      for (const node of container.childNodes) {
        const slot =
          node instanceof HTMLDivElement &&
          node.childElementCount === 0 &&
          node.getAttributeNames().every((attribute) => attribute === 'style') &&
          node.style.height !== '';
        if (slot) continue;
        const shown =
          node instanceof Element
            ? node.outerHTML.slice(0, 120)
            : `the text ${JSON.stringify(node.textContent)}`;
        found.push(`${name} holds ${shown}, which is not a slot div with a pinned height`);
      }
    });
    return found;
  }, TMUX_LOG_STREAM);
}
