import { renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { useIsHydrated } from '../use-is-hydrated';

function Probe() {
  const hydrated = useIsHydrated();
  return <span>{hydrated ? 'client' : 'server'}</span>;
}

describe('useIsHydrated', () => {
  it('is false during server rendering', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('is true once mounted on the client', () => {
    const { result } = renderHook(() => useIsHydrated());
    expect(result.current).toBe(true);
  });
});
