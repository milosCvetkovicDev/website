import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { CARD_COLORS } from './og-image';

/**
 * The mc_ mark as the site's icon: white Geist Mono semibold on the accent, the one surface
 * `--accent` is meant for (ADR 0011), at 5.7:1. `/icon`, `/apple-icon` and `/favicon.ico` all draw
 * it from here, so they cannot drift apart.
 *
 * At 32px and under it is a single "m", so it stays legible in a browser tab; above that it is "mc"
 * with the cursor at 60% opacity, as in the header's `Logo`.
 *
 * ImageResponse cannot read the site's woff2 files, so it draws with `geist-mono-600-mark.ttf`, a
 * static Geist Mono 600 cut from the site's own mono font down to the three characters the mark
 * uses (see `app/fonts/README.md`). A character outside m, c and _ would make ImageResponse fetch a
 * font from the network at build time.
 */
let markFont: ArrayBuffer | undefined;

function loadMarkFont(): ArrayBuffer {
  if (!markFont) {
    const file = readFileSync(join(process.cwd(), 'src/app/fonts/geist-mono-600-mark.ttf'));
    markFont = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
  }
  return markFont;
}

export function markImage(size: number, { rounded = true } = {}): ImageResponse {
  const small = size <= 32;
  const fontSize = Math.round(size * (small ? 0.7 : 0.46));
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: CARD_COLORS.accent,
        // iOS masks the touch icon to its own shape, so that one stays a full square.
        borderRadius: rounded ? Math.round(size * 0.22) : 0,
        color: '#ffffff',
        fontFamily: 'Geist Mono',
        fontWeight: 600,
        fontSize,
        // The wordmark's tracking, -5%.
        letterSpacing: -fontSize * 0.05,
      }}
    >
      {small ? (
        'm'
      ) : (
        <>
          mc<span style={{ opacity: 0.6 }}>_</span>
        </>
      )}
    </div>,
    {
      width: size,
      height: size,
      fonts: [{ name: 'Geist Mono', data: loadMarkFont(), weight: 600, style: 'normal' }],
    },
  );
}
