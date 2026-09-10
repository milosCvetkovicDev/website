import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeferredSection } from '../deferred-section';

describe('DeferredSection', () => {
  it('renders its section on the server, so the markup is in the HTML', () => {
    const html = renderToString(
      <DeferredSection>
        <p>Most bugs live in the gap</p>
      </DeferredSection>,
    );
    expect(html).toContain('Most bugs live in the gap');
    // A boundary that suspends during hydration is client-rendered from scratch, and React throws
    // the server markup away. Nothing here may suspend once its chunk has loaded.
    expect(html).not.toContain('<!--$!-->');
  });

  it('keeps its section in the DOM on the client', () => {
    render(
      <DeferredSection>
        <p>story section</p>
      </DeferredSection>,
    );
    expect(screen.getByText('story section')).toBeInTheDocument();
  });
});
