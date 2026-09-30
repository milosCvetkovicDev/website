import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MouseEvent, ReactNode, Ref } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LinkProps = {
  href: string;
  ref?: Ref<HTMLAnchorElement>;
  prefetch?: boolean | null;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
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
// the prop is what a unit test can pin; `e2e/mobile/navigation.spec.ts` checks the requests. The
// anchor forwards the ref and the click handler, as Next's does, and then cancels the click so that
// jsdom does not try to navigate.
vi.mock('next/link', () => ({
  default: function RecordingLink(props: LinkProps) {
    links.push(props);
    return (
      <a
        ref={props.ref}
        href={props.href}
        aria-label={props['aria-label']}
        aria-current={props['aria-current']}
        className={props.className}
        onClick={(event) => {
          props.onClick?.(event);
          event.preventDefault();
        }}
      >
        {props.children}
      </a>
    );
  },
}));

import { Navigation } from '../navigation';

/**
 * jsdom 30 implements no dialog behaviour: `HTMLDialogElement` reflects `open` and has no
 * `showModal` or `close`. These stand-ins do only what the component relies on: `showModal` opens
 * the dialog, and `close` closes an open one at once and fires `close` from a later task, as a
 * browser does (the HTML standard queues it), so the component's close handling is asserted with
 * `waitFor`. The top layer, the inert page, the Escape key and focus are the browser's, and
 * `e2e/mobile/navigation.spec.ts` proves them there. Vitest gives each test file its own jsdom, so
 * the prototype patches end with this file.
 */
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const close = vi.fn(function (this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  setTimeout(() => this.dispatchEvent(new Event('close')), 0);
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

/** Waits for the dialog's queued `close` event to have reset the open button. */
async function expectClosed(dialog: HTMLDialogElement, button: HTMLElement) {
  expect(dialog.open).toBe(false);
  await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'));
}

/** Presses Tab (or Shift+Tab) on whatever has focus, and says whether the default went ahead. */
const pressTab = (options: { shiftKey?: boolean; ctrlKey?: boolean } = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', ...options });

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
      const classes = props.className?.split(/\s+/) ?? [];
      const isCurrent = props['aria-current'] === 'page';
      // A class token of its own: the logo's `hover:text-[var(--accent-text)]` is a hover colour.
      expect(
        classes.includes('text-[var(--accent-text)]'),
        `${props.href}: the accent colour follows aria-current`,
      ).toBe(isCurrent);
      // Colour is not the only cue (WCAG 1.4.1): the current link is underlined too.
      expect(
        classes.includes('underline'),
        `${props.href}: the underline follows aria-current`,
      ).toBe(isCurrent);
    }
  });

  it('names the desktop nav and the menu nav alike, as the header navigation', () => {
    render(<Navigation />);

    // Only one of them is ever rendered, so they share the name; hidden ones count here, since jsdom
    // applies no media query and the closed dialog's nav is hidden.
    const navs = screen.getAllByRole('navigation', { hidden: true });
    expect(navs.map((nav) => nav.getAttribute('aria-label'))).toEqual(['Main', 'Main']);
  });

  it('renders the menu as a closed, named modal dialog that the open button controls', () => {
    const { dialog, button } = renderOpenable();

    expect(dialog.open).toBe(false);
    expect(dialog.id).not.toBe('');
    // Explicit, so that axe's aria-dialog-name, which selects explicit roles only, checks the name.
    expect(dialog).toHaveAttribute('role', 'dialog');
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

  it('resets the button and returns focus to it when the Close button closes the menu', async () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close menu' }));

    expect(close).toHaveBeenCalled();
    await expectClosed(dialog, button);
    expect(document.activeElement).toBe(button);
  });

  it('closes the menu when one of its links is followed', async () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);

    fireEvent.click(within(dialog).getByRole('link', { name: 'About' }));

    await expectClosed(dialog, button);
  });

  it('keeps the menu open when a link is opened in another tab or window', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);
    // The route effect's close() at mount is not one of these.
    close.mockClear();
    const about = within(dialog).getByRole('link', { name: 'About' });

    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const) {
      fireEvent.click(about, { [modifier]: true });
      expect(dialog.open, modifier).toBe(true);
    }
    fireEvent.click(about, { button: 1 });
    expect(dialog.open, 'a middle click').toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it('closes the menu on a tap on its backdrop, and not on one that began or ended on the panel', async () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);
    // The panel's box at 375x812: 256px wide on the right, its 1px left border included.
    dialog.getBoundingClientRect = () => new DOMRect(119, 0, 256, 812);
    const panel = dialog.firstElementChild as Element;
    const backdrop = { clientX: 20, clientY: 700 };

    // A tap on the panel lands on the wrapper inside the dialog.
    fireEvent.pointerDown(panel, { clientX: 200, clientY: 400 });
    fireEvent.click(panel, { clientX: 200, clientY: 400 });
    expect(dialog.open).toBe(true);

    // A drag from the panel that ends on the backdrop: the click goes to the dialog, their common
    // ancestor.
    fireEvent.pointerDown(panel, { clientX: 200, clientY: 400 });
    fireEvent.click(dialog, backdrop);
    expect(dialog.open, 'a drag from the panel closed the menu').toBe(true);

    // A tap on the panel's left border also targets the dialog, but lies inside its box.
    fireEvent.pointerDown(dialog, { clientX: 119.5, clientY: 400 });
    fireEvent.click(dialog, { clientX: 119.5, clientY: 400 });
    expect(dialog.open, 'a tap on the border closed the menu').toBe(true);

    // A tap on the backdrop: it both begins and ends outside the dialog's box.
    fireEvent.pointerDown(dialog, backdrop);
    fireEvent.click(dialog, backdrop);
    await expectClosed(dialog, button);
  });

  // A modal dialog does not keep Tab inside itself (Chromium lets it out after the last control,
  // WebKit after Close, and both from <body>), so the open menu moves focus itself.
  it('moves Tab and Shift+Tab through the menu and wraps at the ends', () => {
    const { dialog, button } = renderOpenable();
    fireEvent.click(button);
    const controls = [...dialog.querySelectorAll<HTMLElement>('a[href], button')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first).toHaveAccessibleName('Close menu');
    expect(last).toHaveTextContent('Connect');

    first.focus();
    for (const expected of [...controls.slice(1), first]) {
      expect(pressTab(), 'Tab should be taken over').toBe(false);
      expect(document.activeElement).toBe(expected);
    }
    expect(pressTab({ shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);
    expect(pressTab({ shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(controls[controls.length - 2]);

    // From no control at all, Tab goes to the first and Shift+Tab to the last.
    (document.activeElement as HTMLElement).blur();
    expect(pressTab()).toBe(false);
    expect(document.activeElement).toBe(first);
    (document.activeElement as HTMLElement).blur();
    expect(pressTab({ shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(last);

    // A Ctrl chord is the browser's.
    expect(pressTab({ ctrlKey: true }), 'Ctrl+Tab was taken over').toBe(true);
  });

  it('leaves Tab alone while the menu is closed', async () => {
    const { dialog, button } = renderOpenable();
    button.focus();
    expect(pressTab(), 'Tab was taken over with the menu closed').toBe(true);

    fireEvent.click(button);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close menu' }));
    await expectClosed(dialog, button);
    expect(pressTab(), 'Tab was still taken over after the menu closed').toBe(true);
  });

  it('closes the menu when the viewport grows past md, and focuses the logo link', async () => {
    const { dialog, button, unmount } = renderOpenable();
    fireEvent.click(button);

    act(() => media.setWide(true));

    // The open button is `md:hidden` now, so focus goes to the header's first control instead of
    // falling to <body>.
    await expectClosed(dialog, button);
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'MC, home' }));

    unmount();
    expect(media.listenerCount(), 'the breakpoint listener outlived the header').toBe(0);
  });

  it('closes the menu when the route changes under it, as the browser Back button does', async () => {
    const { dialog, button, rerender } = renderOpenable();
    fireEvent.click(button);

    route.pathname = '/about';
    rerender(<Navigation />);

    await expectClosed(dialog, button);
  });
});
