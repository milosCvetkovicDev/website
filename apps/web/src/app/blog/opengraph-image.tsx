import { cardAlt, cardText, OG_CONTENT_TYPE, OG_SIZE, socialCard } from '@/lib/og-image';
import { metadata } from './page';

// A card of its own: the root one never reaches a page that declares its own openGraph.
const { title, description } = cardText(metadata);

export const alt = cardAlt(title);
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return socialCard({ eyebrow: 'Writing', title, description });
}
