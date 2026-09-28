import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GlobalError from '../global-error';
import { THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * `global-error.tsx` rendered the way Next renders it, with `document` as the React root, since its
 * own root element is <html>. That is why it is a file of its own rather than a block in
 * `error-boundary.test.tsx`, and why it holds a single test: once any earlier test in the same jsdom
 * window has mounted a root, React has already marked `document` as listening, a later root on
 * `document` gets no event listeners of its own, and the retry click never arrives. Walk one mount
 * through every assertion instead of adding a second test. Row R37's check that the file exists
 * stays in `error-boundary.test.tsx`.
 */
describe('global-error.tsx', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
    document.title = '';
    vi.restoreAllMocks();
  });

  it('renders the document shell: lang, title, theme, focus, a log line and both ways out', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    // The class the layout's script set for the page that failed, so the removal half is tested too.
    document.documentElement.classList.add('light');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Boom'), { digest: 'abc123' });
    const retry = vi.fn();
    // Rendered into the document itself, as Next does: the component's root is <html>.
    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      ({ rerender } = render(<GlobalError error={error} retry={retry} />, { container: document }));
    });

    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.title).toBe('Something went wrong | Milos Cvetkovic');
    // The stored choice lands on <html> as the layout's inline script would have put it there, and
    // no <script> is rendered: React never runs one on the client and reports it as an error.
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveClass('light');
    expect(document.querySelectorAll('script')).toHaveLength(0);

    // The whole document was replaced, so focus starts on the heading rather than on <body>.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Something went wrong');
    expect(heading).toHaveFocus();
    expect(consoleError).toHaveBeenCalledWith('Global error:', error);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
    // A full load home, not a client navigation through the router that just failed.
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Error ID: abc123')).toBeInTheDocument();

    // Next passes whatever was thrown: `throw undefined` must still leave the page and its ways out.
    await act(async () => {
      rerender(<GlobalError error={undefined as unknown as Error} retry={retry} />);
    });
    expect(screen.queryByText(/Error ID/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
