import { ImageResponse } from 'next/og';
import { CARD_COLORS } from './og-image';

/**
 * The navigation's "MC" mark as the site's icon: white letters on the accent, the one surface
 * `--accent` is meant for (ADR 0011), at 5.7:1. `/icon`, `/apple-icon` and `/favicon.ico` all draw
 * it from here, so they cannot drift apart.
 *
 * ImageResponse only has Geist Regular, and the nav mark is semibold; a white stroke of a few
 * percent of the size thickens the letters to match.
 */
export function markImage(size: number, { rounded = true } = {}): ImageResponse {
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
        fontSize: Math.round(size * 0.5),
        letterSpacing: -size * 0.02,
        WebkitTextStroke: `${Math.max(0.5, size * 0.025)}px #ffffff`,
      }}
    >
      MC
    </div>,
    { width: size, height: size },
  );
}
