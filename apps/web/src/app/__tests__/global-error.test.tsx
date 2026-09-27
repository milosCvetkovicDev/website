import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '../global-error';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * `global-error.tsx` rendered the way Next renders it, with `document` as the React root, since its
 * own root element is <html>. That is why it is a file of its own rather than a block in
 * `error-boundary.test.tsx`: once any earlier test in the same jsdom window has mounted a root, React
 * has already marked `document` as listening, a later root on `document` gets no event listeners of
 * its own, and the retry click never arrives. Row R37's check that the file exists stays there.
 */
describe('global-error.tsx', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders the document shell: lang, title, theme, a heading and both ways out', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const retry = vi.fn();
    // Rendered into the document itself, as Next does: the component's root is <html>.
    await act(async () => {
      render(
        <GlobalError
          error={Object.assign(new Error('Boom'), { digest: 'abc123' })}
          retry={retry}
        />,
        { container: document },
      );
    });

    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.title).toBe('Something went wrong | Milos Cvetkovic');
    // The stored choice lands on <html> as the layout's inline script would have put it there, and
    // no <script> is rendered: React never runs one on the client and reports it as an error.
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveClass('light');
    expect(document.querySelectorAll('script')).toHaveLength(0);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    // A full load home, not a client navigation through the router that just failed.
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument();
  });
});
