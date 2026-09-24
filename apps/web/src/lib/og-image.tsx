import type { Metadata } from 'next';
import { ImageResponse } from 'next/og';

/**
 * The link-preview card every route serves as its og:image (and, through Next's fallback, its
 * twitter:image). One renderer, so the cards share a design; each `opengraph-image.tsx`, and the
 * case studies' `og-image.png` route, passes only its words, read from the page's own metadata or
 * the case-study data rather than restated.
 *
 * Rendered at build time: every route that uses it is static. It draws with ImageResponse's bundled
 * Geist Regular, because the site's own files are woff2, which ImageResponse cannot read, and any
 * glyph that font lacks would be fetched from the network. Keep the text to Latin punctuation.
 */

// ImageResponse cannot read CSS variables, so these mirror the dark theme's tokens in
// `app/globals.css` (`.dark`). A link preview has no colour scheme to follow, so the card takes the
// dark one, the look of the site's HUD panels. Text on the background: foreground 19:1, muted
// 7.8:1, accentText 7.3:1, all past AAA's 7:1.
export const CARD_COLORS = {
  background: '#0a0a0a', // --background
  foreground: '#fafafa', // --foreground
  muted: '#a3a3a3', // --muted
  accent: '#7c3aed', // --accent: surfaces and rules only, never text (ADR 0011)
  accentText: '#a78bfa', // --accent-text
  border: '#262626', // --border
} as const;

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

const DOMAIN = 'miloscvetkovic.dev';
export const ROLE = 'Senior Full-Stack Engineer & Architect';
const BYLINE = `Milos Cvetkovic · ${ROLE}`;

interface Card {
  /** The small uppercase label above the title: the section, e.g. `Case study`. */
  eyebrow: string;
  title: string;
  description?: string;
  /** Short chips under the description, e.g. a case study's tags. */
  tags?: readonly string[];
  /** The footer's left-hand line; `null` on the site card, whose title already is the name. */
  byline?: string | null;
}

/** A corner bracket like the ones framing the site's HUD panels, drawn in the accent. */
function Bracket({ rotate }: { rotate: number }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M2 30 L2 2 L30 2" fill="none" stroke={CARD_COLORS.accent} strokeWidth="4" />
    </svg>
  );
}

export function socialCard({
  eyebrow,
  title,
  description,
  tags = [],
  byline = BYLINE,
}: Card): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 88px',
        background: CARD_COLORS.background,
        color: CARD_COLORS.foreground,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', top: 28, left: 28, display: 'flex' }}>
        <Bracket rotate={0} />
      </div>
      <div style={{ position: 'absolute', top: 28, right: 28, display: 'flex' }}>
        <Bracket rotate={90} />
      </div>
      <div style={{ position: 'absolute', bottom: 28, right: 28, display: 'flex' }}>
        <Bracket rotate={180} />
      </div>
      <div style={{ position: 'absolute', bottom: 28, left: 28, display: 'flex' }}>
        <Bracket rotate={270} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 26,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: CARD_COLORS.accentText,
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              marginRight: 18,
              borderRadius: 7,
              background: CARD_COLORS.accent,
            }}
          />
          {eyebrow}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: title.length > 42 ? 60 : 72,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        {description ? (
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.4,
              color: CARD_COLORS.muted,
              maxWidth: 980,
              // Satori clamps only a block; as a flex item, which a div is by default, it ignores it.
              display: 'block',
              lineClamp: 3,
            }}
          >
            {description}
          </div>
        ) : null}
        {tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 28 }}>
            {tags.map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  marginRight: 14,
                  padding: '8px 20px',
                  borderRadius: 999,
                  border: `2px solid ${CARD_COLORS.border}`,
                  fontSize: 22,
                  color: CARD_COLORS.accentText,
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 28,
          borderTop: `2px solid ${CARD_COLORS.border}`,
          fontSize: 24,
          color: CARD_COLORS.muted,
        }}
      >
        <div style={{ display: 'flex' }}>{byline ?? ''}</div>
        <div style={{ display: 'flex', color: CARD_COLORS.accentText }}>{DOMAIN}</div>
      </div>
    </div>,
    OG_SIZE,
  );
}

/**
 * The words a static route's card shows: the title and description its page already declares
 * through `buildMetadata()`, so a copy edit reaches the card without a second one.
 */
export function cardText(metadata: Metadata): { title: string; description: string } {
  const title = metadata.openGraph?.title;
  const description = metadata.openGraph?.description;
  if (typeof title !== 'string' || typeof description !== 'string') {
    throw new Error('cardText: the page metadata has no plain openGraph title and description');
  }
  return { title, description };
}

/** A card's alt text: its title, and whose site it is unless the title already says. */
export function cardAlt(title: string): string {
  return title.includes('Milos Cvetkovic') ? title : `${title} — Milos Cvetkovic`;
}
