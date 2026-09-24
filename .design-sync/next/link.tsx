// Stand-in for next/link in the Claude Design bundle: tsconfig.paths.json maps the import here. A
// design renders outside Next.js with no router to hand a navigation to, so Link renders the anchor
// it would put in the page anyway and leaves the click to the browser. The real next/link also drags
// in Next's router internals, which read `process` and `__dirname` while the bundle loads. Router-only
// props are accepted and dropped, so a component's markup matches the site's.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';

type Url = string | { pathname?: string | null; search?: string | null; hash?: string | null };

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: Url;
  as?: Url;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  prefetch?: boolean | 'auto' | null;
  locale?: string | false;
  legacyBehavior?: boolean;
  onNavigate?: (event: { preventDefault: () => void }) => void;
  children?: ReactNode;
}

function toHref(url: Url): string {
  if (typeof url === 'string') return url;
  return `${url.pathname ?? ''}${url.search ?? ''}${url.hash ?? ''}` || '#';
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  {
    href,
    as,
    replace,
    scroll,
    shallow,
    passHref,
    prefetch,
    locale,
    legacyBehavior,
    onNavigate,
    ...anchor
  },
  ref,
) {
  return <a ref={ref} href={toHref(as ?? href)} {...anchor} />;
});

export default Link;
