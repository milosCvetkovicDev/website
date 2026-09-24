/**
 * @vitest-environment node
 *
 * `markImage()` draws /icon, /apple-icon and every /favicon.ico frame. It must render from the font
 * file it ships with: a glyph missing from that file would make ImageResponse fetch a font from the
 * network during the build.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { markImage } from '../brand-mark';

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('markImage()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([16, 32, 48, 180])('renders a %ipx PNG without reaching the network', async (size) => {
    // ImageResponse loads its own WebAssembly through fetch() of a data: URL; let those through
    // and record anything else, which would be a request for a missing glyph's font.
    const realFetch = globalThis.fetch;
    const network: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('data:')) return realFetch(input, init);
      network.push(url);
      return Promise.reject(new Error(`markImage fetched ${url}`));
    });

    const bytes = new Uint8Array(await markImage(size).arrayBuffer());

    expect(network).toEqual([]);
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pngSize(bytes)).toEqual({ width: size, height: size });
  });
});
