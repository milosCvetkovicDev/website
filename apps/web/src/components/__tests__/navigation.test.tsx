import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LinkProps = {
  href: string;
  prefetch?: boolean | null;
  onClick?: () => void;
  className?: string;
  'aria-current'?: 'page';
  'aria-label'?: string;
  children?: ReactNode;
};

const route = vi.hoisted(() => ({ pathname: '/' }));
const links = vi.hoisted(() => [] as LinkProps[]);

/**
 * A `matchMedia` for the one query the header listens to, Tailwind's `md`, whose answer the tests
 * move across the breakpoint as a resize or a rotation would. Installed afresh in each
 * `beforeEach`: jsdom has no `matchMedia` at all, and stubs stay in the file that needs them.
 */
const media = vi.hoisted(() => {
  const state = { wide: false };
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    install() {
      state.wide = false;
      listeners.clear();
      const matchMedia = (query: string) => ({
        get matches() {
          return query === '(min-width: 48rem)' && state.wide;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
          if (query === '(min-width: 48rem)') listeners.add(listener);
        },
        removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => {
          listeners.delete(listener);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      });
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: matchMedia,
      });
    },
    setWide(wide: boolean) {
      state.wide = wide;
      for (const listener of [...listeners]) listener({ matches: wide });
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
// Records the props every `Link` is rendered with. Next only prefetches in a production build, so
// the prop is what a unit test can pin; `e2e/mobile/navigation.spec.ts` checks the requests.
vi.mock('next/link', () => ({
  default: function RecordingLink(props: LinkProps) {
    links.push(props);
    return (
      <a href={props.href} aria-label={props['aria-label']} aria-current={props['aria-current']}>
        {props.children}
      </a>
    );
  },
}));

import { Navigation } from '../navigation';

/**
 * jsdom 30 implements no dialog behaviour: `HTMLDialogElement` reflects `open` and has no
 * `showModal` or `close`. These stand-ins do only what the component relies on: `showModal` opens
 * the dialog, and `close` closes an open one and fires `close`, as a browser does. The top layer,
 * the inert page, the Escape key and focus are the browser's, and `e2e/mobile/navigation.spec.ts`
 * proves them there.
 */
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const close = vi.fn(function (this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  this.dispatchEvent(new Event('close'));
});

/** The props of the header logo, the one link named after the mark. */
function logoLinks() {
  const logos = links.filter((props) => props['aria-label']?.startsWith('MC'));
  expect(logos.length, 'the header should render its logo link to /').toBeGreaterThan(0);
  for (const logo of logos) expect(logo.href).toBe('/');
  return logos;
}

/** The menu's links are the ones that close it on click; the desktop nav's have no handler. */
const menuLinks = () => links.filter((props) => props.onClick);

function renderOpenable() {
  const view = render(<Navigation />);
  const dialog = view.container.ownerDocument.querySelector('dialog');
  if (!dialog) throw new Error('the header should always render its menu dialog, closed');
  const button = screen.getByRole('button', { name: 'Open menu' });
  return { ...view, dialog, button };
}

describe('Navigation', () => {
  beforeEach(() => {
    links.length = 0;
    route.pathname = '/';
    showModal.mockClear();
    close.mockClear();
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
    media.install();
  });

  it('does not let the logo prefetch / while / is the page', () => {
    route.pathname = '/';
    render(<Navigation />);
    for (const logo of logoLinks()) expect(logo.prefetch).toBe(false);
  });

  it("leaves the logo on Next's default prefetch on every other route", () => {
    route.pathname = '/about';
    render(<Navigation />);
    for (const logo of logoLinks()) expect(logo.prefetch).toBeUndefined();
  });

  it('names the logo link after the visible mark and says where it goes', () => {
    render(<Navigation />);
    for (const logo of logoLinks()) {
      // The mark reads "mc", so the name starts with it (WCAG 2.5.3, axe's
      // label-content-name-mismatch) and then says the link goes home.
      expect(logo['aria-label']).toMatch(/^MC\b/);
      expect(logo['aria-label']).toMatch(/home/i);
    }
  });

  // Opening the menu must not prefetch the page the visitor is on from that page's own entry, and
  // leaves every other entry on Next's default.
  it.each(['/', '/about'])('does not let the open menu prefetch %s from its own link', (path) => {
    route.pathname = path;
    const { button } = renderOpenable();
    links.length = 0;
    fireEvent.click(button);

    const menu = menuLinks();
    expect(menu.length, 'the open menu should render its links').toBeGreaterThan(0);
    for (const link of menu) {
      expect(link.prefetch, link.href).toBe(link.href === path ? false : undefined);
    }
    expect(menu.some((link) => link.href === path)).toBe(true);
  });

  it('marks the section current on a page below it, in the desktop nav and the menu alike', () => {
    route.pathname = '/work/self-healing-agent';
    render(<Navigation />);

    const current = links.filter((props) => props['aria-current'] === 'page');
    // One in the desktop nav, one in the menu, and both are the Work link.
    expect(current.map((props) => props.href)).toEqual(['/work', '/work']);
    for (const props of links) {
      // A class token of its own: the logo's `hover:text-[var(--accent-text)]` is a hover colour.
      const accent = props.className?.split(/\s+/).includes('text-[var(--accent-text)]') ?? false;
      expect(accent, `${props.href}: the accent colour follows aria-current`).toBe(
        props['aria-current'] === 'page',
      );
    }
  });

  it('renders the menu as a closed, named modal dialog that the open button controls', () => {
    const { dialog, button } = renderOpenable();

    expect(dialog.open).toBe(false);
    expect(dialog.id).not.toBe('');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('aria-label')?.trim()).toBeTruthy();
    expect(button).toHaveAttribute('aria-controls', dialog.id);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the dialog as a modal from the open button, once', () => {
    const { dialog, button } = renderOpenable();

    fireEvent.click(button);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(showModal.mock.contexts[0]).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // A second activation must not call showModal() on a dialog that is already open.
    fireEvent.click(button);
    expect(showModal).toHaveBeenCalledTimes(1);
  });

  it('resets the button and returns focus to it when the Close button closes the menu', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close menu' }));

    expect(close).toHaveBeenCalled();
    expect(dialog.open).toBe(false);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(button);
  });

  it('closes the menu when one of its links is followed', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);

    const about = menuLinks().findLast((props) => props.href === '/about');
    act(() => about?.onClick?.());

    expect(dialog.open).toBe(false);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu on a click on its backdrop, and not on a click inside the panel', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);

    // A click on `::backdrop` is dispatched to the dialog element itself; one on the panel lands
    // on the wrapper inside it.
    fireEvent.click(dialog.firstElementChild as Element);
    expect(dialog.open).toBe(true);

    fireEvent.click(dialog);
    expect(dialog.open).toBe(false);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  // Chromium lets Tab leave a modal dialog after its last control, so the menu wraps focus itself.
  it('wraps Tab from the last control to the first, and Shift+Tab back', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);
    const controls = dialog.querySelectorAll<HTMLElement>('a[href], button');
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first).toHaveAccessibleName('Close menu');
    expect(last).toHaveTextContent('Connect');

    last.focus();
    expect(fireEvent.keyDown(last, { key: 'Tab' }), 'Tab should be taken over').toBe(false);
    expect(document.activeElement).toBe(first);

    expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);

    // Anywhere else, Tab is left to the browser.
    controls[1].focus();
    expect(fireEvent.keyDown(controls[1], { key: 'Tab' }), 'a middle Tab was taken over').toBe(
      true,
    );
    expect(document.activeElement).toBe(controls[1]);
  });

  it('closes the menu when the viewport grows past the md breakpoint', () => {
    const { dialog, button, unmount } = renderOpenable();
    fireEvent.click(button);

    act(() => media.setWide(true));

    expect(dialog.open).toBe(false);
    expect(button).toHaveAttribute('aria-expanded', 'false');

    unmount();
    expect(media.listenerCount(), 'the breakpoint listener outlived the header').toBe(0);
  });

  it('closes the menu when the route changes under it, as the browser Back button does', () => {
    const { dialog, button, rerender } = renderOpenable();
    fireEvent.click(button);

    route.pathname = '/about';
    rerender(<Navigation />);

    expect(dialog.open).toBe(false);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
