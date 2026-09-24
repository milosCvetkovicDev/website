/**
 * Packs PNG images into one ICO file, the format `/favicon.ico` has to answer in. Every browser that
 * still requests that path reads PNG frames inside an ICO (Windows Vista's extension of the format),
 * so no bitmap conversion is needed: a 6-byte header, one 16-byte directory entry per frame, then the
 * PNGs themselves. All fields are little-endian.
 */
export function icoFromPngs(
  frames: readonly { size: number; data: Uint8Array }[],
): Uint8Array<ArrayBuffer> {
  if (frames.length === 0) throw new Error('icoFromPngs: at least one frame is needed');
  const HEADER = 6;
  const ENTRY = 16;
  let offset = HEADER + frames.length * ENTRY;
  const total = offset + frames.reduce((sum, { data }) => sum + data.byteLength, 0);
  const ico = new Uint8Array(total);
  const view = new DataView(ico.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // 1 = icon
  view.setUint16(4, frames.length, true);

  frames.forEach(({ size, data }, index) => {
    if (!Number.isInteger(size) || size < 1 || size > 256) {
      throw new Error(`icoFromPngs: a ${size}px frame cannot be described in an ICO directory`);
    }
    const entry = HEADER + index * ENTRY;
    view.setUint8(entry, size % 256); // width; 0 means 256
    view.setUint8(entry + 1, size % 256); // height
    view.setUint8(entry + 2, 0); // palette size: none
    view.setUint8(entry + 3, 0); // reserved
    view.setUint16(entry + 4, 1, true); // colour planes
    view.setUint16(entry + 6, 32, true); // bits per pixel
    view.setUint32(entry + 8, data.byteLength, true);
    view.setUint32(entry + 12, offset, true);
    ico.set(data, offset);
    offset += data.byteLength;
  });
  return ico;
}
