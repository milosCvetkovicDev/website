/**
 * Whether a header link points at the page the visitor is on, or at the section that page belongs to.
 *
 * `/` is current on `/` only, since every path starts with it. Any other link is current on its own
 * path and on every path below it, so the Work link stays current on `/work/<slug>`, where a case
 * study would otherwise leave the header saying nothing about where the visitor is. The match stops
 * at a path segment: `/workshop` is not below `/work`.
 *
 * The desktop nav and the mobile menu both ask this one function, and each uses the answer for
 * `aria-current="page"` and for the accent colour alike, so what a screen reader is told and what a
 * sighted visitor sees cannot disagree. Kept free of React so its test runs without a DOM.
 */
export function isCurrentLink(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
