'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { isCurrentLink } from './current-link';
import { Logo } from './logo';
import { useTheme } from './theme-provider';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/work', label: 'Work' },
  { href: '/skills', label: 'Skills' },
  { href: '/blog', label: 'Writing' },
  { href: '/contact', label: 'Connect' },
];

/** The menu dialog's id, for the open button's `aria-controls`. The root layout renders one header. */
const MENU_ID = 'site-menu';

/** Tailwind's `md`, from which the desktop nav shows and the menu button does not. */
const DESKTOP_QUERY = '(min-width: 48rem)';

/**
 * How the current link looks, in the desktop nav and the menu alike. `--accent-text` and `--muted`
 * are under 1.2:1 apart in both themes, so colour alone would not tell the current link from the
 * others (WCAG 1.4.1): it is underlined as well. The underline is drawn in the text's own colour.
 */
const CURRENT_LINK = 'text-[var(--accent-text)] underline decoration-2 underline-offset-4';
const OTHER_LINK = 'text-[var(--muted)] hover:text-[var(--foreground)]';

function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();

  // Until mount, show the sun icon, as the server does (its theme snapshot is dark), so that
  // hydration matches the served markup.
  const isDark = mounted ? theme === 'dark' : true;

  return (
    <button
      onClick={toggleTheme}
      className="rounded-lg p-2 transition-colors hover:bg-[var(--card-hover)]"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}

export function Navigation() {
  const pathname = usePathname();
  // Whether the menu dialog is open, for the button's `aria-expanded`. `false` on the server and at
  // hydration, and changed only in event handlers (ADR 0006): `openMenu` sets it, and the dialog's
  // own `close` event clears it however the dialog was closed.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const logoRef = useRef<HTMLAnchorElement>(null);

  // Growing past `md` hides the menu button, and a rotation or a resized window can do that with the
  // menu open. A modal dialog leaves the rest of the page inert for as long as it is open, visible or
  // not, so it is closed rather than hidden. The effect only closes it; the state follows in onClose.
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) menuRef.current?.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  // A route change the menu's links did not make, the browser's Back button say, closes it too.
  // `close()` on a closed dialog does nothing, so the run at mount is harmless.
  useEffect(() => {
    menuRef.current?.close();
  }, [pathname]);

  // A modal dialog makes the page behind it inert, but it does not keep Tab inside itself. Chromium
  // let the seventh Tab from the Close button leave for the browser's own UI, leaving
  // `document.activeElement` on <body>; WebKit, which leaves links out of the tab order by default,
  // did the same on the first Tab, since Close is the menu's only control it tabs to; and with focus
  // on no control at all, after a tap on empty panel space, Tab went to <body> in both. So while the
  // menu is open it moves focus itself: every Tab and Shift+Tab steps through the menu's controls in
  // order and wraps at the ends, the same in every engine. The listener is on the document because
  // with focus on <body> a key event never reaches the dialog. The effect subscribes and sets no
  // state (ADR 0006). Ctrl and Meta chords belong to the browser and the OS, and a key pressed during
  // an IME composition to the IME; Option+Tab, Safari's own "Tab to links", is treated as Tab.
  useEffect(() => {
    const menu = menuRef.current;
    if (!menuOpen || !menu) return;
    const moveFocusInMenu = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.isComposing) return;
      const controls = [...menu.querySelectorAll<HTMLElement>('a[href], button')];
      if (controls.length === 0) return;
      event.preventDefault();
      const at = controls.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const next =
        at === -1
          ? event.shiftKey
            ? controls.length - 1
            : 0
          : (at + step + controls.length) % controls.length;
      controls[next].focus();
    };
    document.addEventListener('keydown', moveFocusInMenu);
    return () => document.removeEventListener('keydown', moveFocusInMenu);
  }, [menuOpen]);

  const openMenu = () => {
    const menu = menuRef.current;
    if (!menu || menu.open) return;
    menu.showModal();
    setMenuOpen(true);
  };

  const closeMenu = () => menuRef.current?.close();

  // A menu link closes the menu when it navigates this tab. A modified or middle click opens the page
  // in another tab or window and leaves this one where it is, so the menu stays open.
  const closeMenuOnNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    closeMenu();
  };

  // Runs however the dialog closed: the Close button, a link, Escape (through the `cancel` event),
  // the backdrop, the breakpoint or the route. Focus goes back to the button that opened it rather
  // than to wherever each engine's own restore would put it. Past `md` that button is `md:hidden`
  // and cannot take focus, so it goes to the header's first control, the logo link, instead of
  // falling to <body> at the top of the document.
  const handleMenuClose = () => {
    setMenuOpen(false);
    if (window.matchMedia(DESKTOP_QUERY).matches) logoRef.current?.focus();
    else menuButtonRef.current?.focus();
  };

  // A click on the `::backdrop` is dispatched to the `<dialog>` itself. So is a click whose press
  // began on the panel and ended on the backdrop (a text selection or a drag, whose target is their
  // common ancestor), and one on the panel's own left border. The menu closes only when the press
  // both began and ended outside the dialog's box, which is the backdrop and nothing else.
  const pressBeganOnBackdrop = useRef(false);
  const isOnBackdrop = (event: PointerEvent<HTMLDialogElement> | MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return false;
    const box = event.currentTarget.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    return x < box.left || x > box.right || y < box.top || y > box.bottom;
  };
  const notePressStart = (event: PointerEvent<HTMLDialogElement>) => {
    pressBeganOnBackdrop.current = isOnBackdrop(event);
  };
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    const began = pressBeganOnBackdrop.current;
    pressBeganOnBackdrop.current = false;
    if (began && isOnBackdrop(event)) event.currentTarget.close();
  };

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          {/* The mark is aria-hidden, so the link carries the name. It starts with "MC", the visible
              "mc" (WCAG 2.5.3), and says where the link goes; e2e/client-navigation.spec.ts finds
              the link by it. On a phone this is the only link in view at load, and on `/` it would
              prefetch the page it is on: three requests racing the page's own for no navigation
              it can make. */}
          <Link
            ref={logoRef}
            href="/"
            aria-label="MC, home"
            prefetch={pathname === '/' ? false : undefined}
            className="transition-colors hover:text-[var(--accent-text)]"
          >
            <Logo size={20} />
          </Link>

          {/* Desktop Navigation. It and the menu's nav share a name, since only one of them is ever
              rendered, and the name tells them apart from the page's own navs in a landmark list. */}
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {navLinks.slice(1).map((link) => {
              const current = isCurrentLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={`text-sm transition-colors ${current ? CURRENT_LINK : OTHER_LINK}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <ThemeToggle />
          </nav>

          {/* Mobile Navigation */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              ref={menuButtonRef}
              type="button"
              onClick={openMenu}
              className="p-2"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              aria-controls={MENU_ID}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="6" y2="6" />
                <line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* The phone menu: a native modal dialog, always rendered, closed until the button above opens
          it with showModal(). Open, it sits in the top layer, which no ancestor can clip: inside the
          header, whose backdrop-filter makes it the containing block of its `fixed` descendants,
          the old menu was cut to the header's 72px. It renders after the header all the same. The
          browser supplies the dialog role, Escape and an inert page behind it; a closed dialog is
          `display: none`, outside the accessibility tree and the tab order.

          The geometry is on the dialog, since Tailwind's preflight removes the user agent's
          `margin: auto` and its `max-width`/`max-height` would still hold the panel short of the
          screen. No display utility goes on it: author CSS would beat the user agent's
          `dialog:not([open]) { display: none }` and show the closed menu in the page. The inner
          wrapper fills it and carries the layout. The background and the text colour are both set
          here, on the surface itself (ADR 0011). The backdrop is a literal colour: `::backdrop`
          inherits custom properties from its dialog only since Chrome 122, Firefox 120 and Safari
          17.4, and Next 16 builds for Chrome 111 and Safari 16.4 up. `aria-modal` is explicit:
          showModal() makes the dialog modal but does not set the attribute. So is the `dialog`
          role, which the element has anyway: axe 4.13's aria-dialog-name selects explicit roles
          only, and would otherwise never check the name.

          A modal dialog leaves the page inert but still scrollable: `html:has(dialog:modal)` in
          globals.css stops the page scrolling while the menu is open, and `overscroll-contain`
          keeps a swipe on the panel from chaining to it. */}
      <dialog
        ref={menuRef}
        id={MENU_ID}
        role="dialog"
        aria-label="Site menu"
        aria-modal="true"
        onClose={handleMenuClose}
        onPointerDown={notePressStart}
        onClick={closeOnBackdrop}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-64 max-w-none overscroll-contain border-l border-[var(--border)] bg-[var(--background)] p-0 text-[var(--foreground)] backdrop:bg-black/50"
      >
        <div className="relative h-full p-6">
          <button
            type="button"
            onClick={closeMenu}
            className="absolute top-4 right-4 p-2"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <nav aria-label="Main" className="mt-12 flex flex-col gap-4">
            {/* Opening the menu on a page would otherwise prefetch that page from its own link, as
                the header logo would on `/`. Only the page itself: on a case study the Work link is
                current, and prefetching /work from there is worth it. */}
            {navLinks.map((link) => {
              const current = isCurrentLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={pathname === link.href ? false : undefined}
                  onClick={closeMenuOnNavigation}
                  aria-current={current ? 'page' : undefined}
                  className={`text-lg transition-colors ${current ? CURRENT_LINK : OTHER_LINK}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </dialog>
    </>
  );
}
