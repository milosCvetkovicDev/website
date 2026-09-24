import { OG_CONTENT_TYPE, OG_SIZE, ROLE, socialCard } from '@/lib/og-image';

// The site card: the home page's og:image, and the 404's, which inherits the root layout's.
export const alt = `Milos Cvetkovic, ${ROLE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return socialCard({
    eyebrow: 'Portfolio',
    title: 'Milos Cvetkovic',
    description: ROLE,
    byline: null,
  });
}
