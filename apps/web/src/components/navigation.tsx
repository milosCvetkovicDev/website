'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
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

  const openMenu = () => {
    const menu = menuRef.current;
    if (!menu || menu.open) return;
    menu.showModal();
    setMenuOpen(true);
  };

  const closeMenu = () => menuRef.current?.close();

  // Runs however the dialog closed: the Close button, a link, Escape (through the `cancel` event),
  // the backdrop, the breakpoint or the route. Focus goes back to the button that opened it rather
  // than to wherever each engine's own restore would put it.
  const handleMenuClose = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  // A click on the `::backdrop` is dispatched to the `<dialog>` itself. The dialog has no padding and
  // its panel fills it, so a click that targets the dialog element can only be on the backdrop.
  const closeOnBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  // A modal dialog makes the page behind it inert, but Chromium still lets Tab leave it: past the
  // last link focus goes out to the browser's own UI and `document.activeElement` becomes <body>
  // (measured on the mobile-chrome project, at the seventh Tab from the Close button). So Tab from
  // the last control and Shift+Tab from the first wrap round, and focus stays in the menu until it
  // closes. WebKit, which leaves links out of the tab order, gets the same wrap from a focused link.
  const keepTabInMenu = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>('a[href], button');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const leaving = event.shiftKey ? first : last;
    if (document.activeElement !== leaving) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
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
            href="/"
            aria-label="MC, home"
            prefetch={pathname === '/' ? false : undefined}
            className="transition-colors hover:text-[var(--accent-text)]"
          >
            <Logo size={20} />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-6 md:flex">
            {navLinks.slice(1).map((link) => {
              const current = isCurrentLink(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={`text-sm transition-colors ${
                    current
                      ? 'text-[var(--accent-text)]'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
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
          here, on the surface itself (ADR 0011), and the backdrop is a literal colour, because
          custom properties do not reach `::backdrop` in every engine. `aria-modal` is explicit:
          showModal() makes the dialog modal but does not set the attribute. */}
      <dialog
        ref={menuRef}
        id={MENU_ID}
        aria-label="Site menu"
        aria-modal="true"
        onClose={handleMenuClose}
        onClick={closeOnBackdrop}
        onKeyDown={keepTabInMenu}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-64 max-w-none border-l border-[var(--border)] bg-[var(--background)] p-0 text-[var(--foreground)] backdrop:bg-black/50"
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
          <nav className="mt-12 flex flex-col gap-4">
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
                  onClick={closeMenu}
                  aria-current={current ? 'page' : undefined}
                  className={`text-lg transition-colors ${
                    current
                      ? 'text-[var(--accent-text)]'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                  }`}
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
