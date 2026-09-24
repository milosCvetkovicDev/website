/**
 * @vitest-environment node
 *
 * `icoFromPngs()`, which packs the favicon's PNG frames into an ICO container. Browsers read the
 * header to pick a frame, so every offset and size is asserted against the bytes it points at.
 */
import { describe, expect, it } from 'vitest';
import { icoFromPngs } from '../ico';

const frame = (size: number, fill: number) => ({ size, data: new Uint8Array(size).fill(fill) });

describe('icoFromPngs()', () => {
  const frames = [frame(16, 1), frame(32, 2), frame(48, 3)];
  const ico = icoFromPngs(frames);
  const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

  it('writes an ICONDIR header for an icon with one entry per frame', () => {
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // 1 = icon, 2 = cursor
    expect(view.getUint16(4, true)).toBe(3);
  });

  it('points each directory entry at its own PNG, with its size', () => {
    frames.forEach(({ size, data }, index) => {
      const entry = 6 + index * 16;
      expect(view.getUint8(entry), 'width').toBe(size);
      expect(view.getUint8(entry + 1), 'height').toBe(size);
      expect(view.getUint16(entry + 4, true), 'planes').toBe(1);
      expect(view.getUint16(entry + 6, true), 'bits per pixel').toBe(32);
      const length = view.getUint32(entry + 8, true);
      const offset = view.getUint32(entry + 12, true);
      expect(length).toBe(data.byteLength);
      expect([...ico.subarray(offset, offset + length)]).toEqual([...data]);
    });
  });

  it('ends with the last frame, leaving no gap or trailing bytes', () => {
    const total =
      6 + frames.length * 16 + frames.reduce((sum, { data }) => sum + data.byteLength, 0);
    expect(ico.byteLength).toBe(total);
  });

  it('writes 0 for a 256-pixel frame, as the format requires', () => {
    const big = new DataView(icoFromPngs([frame(256, 9)]).buffer);
    expect(big.getUint8(6)).toBe(0);
    expect(big.getUint8(7)).toBe(0);
  });

  it('refuses a frame the format cannot describe', () => {
    expect(() => icoFromPngs([])).toThrow();
    expect(() => icoFromPngs([frame(300, 0)])).toThrow();
  });
});
