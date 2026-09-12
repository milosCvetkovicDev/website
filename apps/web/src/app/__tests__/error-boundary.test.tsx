import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorPage from '../error';

/**
 * The route error boundary, and the global one that does not exist yet.
 *
 * Row R37 of the RED manifest, fixed by #49, plus the green assertions for `error.tsx` — which had no
 * test at all, despite holding the only `console.error` in shipped source.
 *
 * `error.tsx` catches a throw inside `<main>`. It cannot catch one in the root layout's own client
 * components — `ThemeProvider`, `Navigation`, `Footer` — because a route-level boundary lives *inside*
 * the layout it is rendered by. That is what `global-error.tsx` is for, and there is no such file, so a
 * throw in the header today falls through to Next's built-in page: unthemed, unbranded, with no way
 * back to the site.
 */

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

beforeEach(() => {
  // error.tsx logs through console.error in an effect. Silenced rather than left to print, so a real
  // unexpected error still stands out in the run output, and asserted on below.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const anError = (digest?: string): Error & { digest?: string } =>
  Object.assign(new Error('Boom'), digest === undefined ? {} : { digest });

describe('error.tsx', () => {
  it('renders a heading, an explanation and both recovery controls', () => {
    render(<ErrorPage error={anError()} reset={() => {}} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
  });

  it('calls reset when Try Again is pressed', () => {
    // The whole point of the boundary: it must be able to re-render the segment rather than only
    // apologise. A button wired to nothing looks identical on screen.
    const reset = vi.fn();
    render(<ErrorPage error={anError()} reset={reset} />);

    act(() => screen.getByRole('button', { name: 'Try Again' }).click());

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows the digest, so a report can be matched to a server log', () => {
    render(<ErrorPage error={anError('abc123def')} reset={() => {}} />);

    expect(screen.getByText(/Error ID: abc123def/)).toBeInTheDocument();
  });

  it('omits the error ID line entirely when there is no digest', () => {
    // A visitor should not be shown "Error ID: undefined". The digest only exists on errors React
    // caught on the server.
    render(<ErrorPage error={anError()} reset={() => {}} />);

    expect(screen.queryByText(/Error ID/)).not.toBeInTheDocument();
  });

  it('reports the error to the console once', () => {
    render(<ErrorPage error={anError('xyz')} reset={() => {}} />);

    // The effect depends on `error`, so a re-render with the same error must not log again.
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Application error:', expect.any(Error));
  });

  it.fails('R37 (#49): a global-error module exists and renders its own <html> and <body>', () => {
    // Asserted over the file rather than by rendering it, and the reason is the row itself: the module
    // does not exist, and a static `import('../global-error')` for a file that is not there fails at
    // transform time and takes the whole suite down instead of this one test. A variable import is
    // worse — it only produces a Vite warning today and a resolution surprise later. So the instrument
    // is the source text, which is enough to tell a module that renders the document shell from one
    // that does not. Once #49 adds the file, that pull request can strengthen this to a real render.
    const files = readdirSync(APP_DIR);
    const globalError = files.find((file) => /^global-error\.(tsx|jsx|ts|js)$/.test(file));
    expect(
      globalError,
      `no global-error module under src/app (found: ${files.join(', ')}). error.tsx is nested inside ` +
        'the root layout, so it cannot catch a throw from ThemeProvider, Navigation or Footer: that ' +
        "falls through to Next's unthemed built-in page, with no way back to the site.",
    ).toBeDefined();

    // `global-error` *replaces* the root layout when it renders, so it has to supply the document
    // shell itself. One that omits <html>/<body> renders a blank page — a worse outcome than the
    // built-in it was added to replace.
    const source = readFileSync(join(APP_DIR, globalError as string), 'utf8');
    expect(source, 'global-error must render its own <html>').toMatch(/<html[\s>]/);
    expect(source, 'global-error must render its own <body>').toMatch(/<body[\s>]/);
  });
});
