import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LinkProps = { href: string; prefetch?: boolean | null; children?: ReactNode };

const route = vi.hoisted(() => ({ pathname: '/' }));
const links = vi.hoisted(() => [] as LinkProps[]);

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
// Records the props every `Link` is rendered with. Next only prefetches in a production build, so
// the prop is what a unit test can pin; `e2e/mobile/navigation.spec.ts` checks the requests.
vi.mock('next/link', () => ({
  default: function RecordingLink(props: LinkProps) {
    links.push(props);
    return <a href={props.href}>{props.children}</a>;
  },
}));

import { Navigation } from '../navigation';

/** The props of the header logo: with the menu closed, it is the only link to `/`. */
function logoLinks() {
  const toHome = links.filter((props) => props.href === '/');
  expect(toHome.length, 'the header should render its logo link to /').toBeGreaterThan(0);
  return toHome;
}

describe('Navigation', () => {
  beforeEach(() => {
    links.length = 0;
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
});
