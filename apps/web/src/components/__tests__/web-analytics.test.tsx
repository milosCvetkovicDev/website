import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAnalytics } from '../web-analytics';

// The tracker reads the route through next/navigation, which has no App Router context in jsdom.
vi.mock('next/navigation.js', () => ({
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const insightScripts = () =>
  [...document.head.querySelectorAll('script')].filter((script) => script.src.includes('insights'));

afterEach(() => {
  vi.unstubAllEnvs();
  insightScripts().forEach((script) => script.remove());
});

describe('WebAnalytics', () => {
  it('loads the tracker from this origin in a production build on Vercel', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    render(<WebAnalytics />);

    // The Suspense boundary around the tracker resolves on a later tick.
    await vi.waitFor(() => expect(insightScripts()).toHaveLength(1));
    // Same origin, so the CSP's script-src and connect-src 'self' cover it.
    expect(new URL(insightScripts()[0].src).pathname).toBe('/_vercel/insights/script.js');
    expect(new URL(insightScripts()[0].src).origin).toBe(window.location.origin);
  });

  it('renders nothing outside Vercel, where /_vercel/insights does not exist', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(<WebAnalytics />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
    expect(insightScripts()).toHaveLength(0);
  });
});
