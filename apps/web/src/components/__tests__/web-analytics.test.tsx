import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAnalytics } from '../web-analytics';

// The tracker reads the route through next/navigation, which has no App Router context in jsdom.
vi.mock('next/navigation.js', () => ({
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// The production script is /_vercel/insights/script.js; the debug one is on va.vercel-scripts.com.
// The package picks the debug one at runtime when NODE_ENV is `test` or `development`, which is why
// every case stubs NODE_ENV to `production`.
const trackerScripts = () =>
  [...document.head.querySelectorAll('script')].filter(
    (script) => script.src.includes('insights') || script.src.includes('vercel-scripts'),
  );

/** Renders the component and lets its Suspense boundary and effects settle. */
async function renderSettled() {
  await act(async () => {
    render(<WebAnalytics />);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  trackerScripts().forEach((script) => script.remove());
});

describe('WebAnalytics', () => {
  it.each(['production', 'preview'])(
    'loads the tracker from this origin in a %s deployment',
    async (deployment) => {
      vi.stubEnv('VERCEL_ENV', deployment);
      vi.stubEnv('NODE_ENV', 'production');
      await renderSettled();

      await vi.waitFor(() => expect(trackerScripts()).toHaveLength(1));
      // A path on this origin, so the CSP's script-src and connect-src 'self' cover it.
      expect(trackerScripts()[0].getAttribute('src')).toBe('/_vercel/insights/script.js');
    },
  );

  // Unset in CI and a local `next start`; `development` is what `vercel env pull` writes.
  it.each([undefined, 'development'])(
    'renders nothing when VERCEL_ENV is %s, where /_vercel/insights does not exist',
    async (deployment) => {
      vi.stubEnv('VERCEL_ENV', deployment);
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('NODE_ENV', 'production');
      await renderSettled();

      expect(trackerScripts()).toHaveLength(0);
    },
  );
});
