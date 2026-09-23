import type { Metadata } from 'next';
import { OG_CONTENT_TYPE, OG_SIZE } from './og-image';

/**
 * The per-route half of the head. The root layout keeps only what is true of every response, the
 * 404 included (`metadataBase`, the title template, the card type); everything that names a route
 * or says whether to index it comes from here.
 *
 * Next merges metadata one key deep: a segment that sets `openGraph`, `twitter` or `robots` replaces
 * the parent's object wholesale. So each of those is built complete, never partially overridden.
 * A server module like `theme.ts`, not a client one.
 */

export const SITE_NAME = 'Milos Cvetkovic';
export const TWITTER_HANDLE = '@milos_dev';

interface PageMetadata {
  /** The route's title. A string goes through the root template (`%s | Milos Cvetkovic`). */
  title: string | { absolute: string };
  description: string;
  /** The route's pathname, `/` for home. `metadataBase` resolves it into the canonical and og:url. */
  path: string;
  /** `article` for a case study. */
  type?: 'website' | 'article';
  /** The title for link previews, where the template never applies; defaults to `title`. */
  socialTitle?: string;
  /** `false` keeps the page out of search while it can still be followed. */
  index?: boolean;
  /**
   * A card served by a route handler, with alt text of its own. Only for a card whose alt has to
   * vary with the route's params, which an `opengraph-image` file cannot do; a segment with such a
   * file leaves this out, and Next adds the file's card by itself.
   */
  image?: { url: string; alt: string };
}

// A pathname and nothing else: a leading slash, no trailing one (the root aside), no query, no
// fragment, no origin. A canonical naming any other URL than the route's own is worse than none.
const PATHNAME = /^\/(?:[\w-]+(?:\/[\w-]+)*)?$/;

export function buildMetadata({
  title,
  description,
  path,
  type = 'website',
  socialTitle,
  index = true,
  image,
}: PageMetadata): Metadata {
  if (!PATHNAME.test(path)) {
    throw new Error(`buildMetadata: "${path}" is not a clean pathname such as /work or /`);
  }
  const shareTitle = socialTitle ?? (typeof title === 'string' ? title : title.absolute);

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      locale: 'en_US',
      title: shareTitle,
      description,
      // twitter:image and its alt follow from these: Next copies og:image into a twitter block that
      // has no images of its own.
      ...(image && { images: [{ ...image, ...OG_SIZE, type: OG_CONTENT_TYPE }] }),
    },
    twitter: {
      card: 'summary_large_image',
      creator: TWITTER_HANDLE,
      title: shareTitle,
      description,
    },
    robots: index
      ? {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        }
      : { index: false, follow: true },
  };
}
