import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PostArticleJsonLd, PostBreadcrumbJsonLd, PostWebPageJsonLd } from '@/components/json-ld';
import { PostBody } from '@/components/post-body';
import { FOOTER_LINES, getPost, publishedPosts } from '@/data/posts';
import { formatContentDates } from '@/lib/content-date';
import { buildMetadata } from '@/lib/metadata';
import { cardAlt } from '@/lib/og-image';
import { postPageTitle, postPath } from '@/lib/post-page';
import { postStaticParams } from '@/lib/post-static-params';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// A post page, rendered from `posts.ts` through the published index, so a draft reaches no page
// (ADR 0028). A server component with no client state, GSAP or AnimatedText (#61).
//
// `publishedPosts` enumerates every slug a post page has, so generateStaticParams below is
// exhaustive and an unknown slug, a draft's included, can only be a bad URL. Refusing dynamic
// params makes that a routing-level 404, as `/work/[slug]` does, instead of a render-time
// notFound() that unwinds past the root layout and serves Next's bare recovery shell without the
// theme init script (docs/adr/0015-static-case-study-params.md). With no post published the list
// is empty, and the route still prerenders, as zero pages: every `/blog/<slug>` is that 404. The
// development server needs one placeholder in an empty list to do the same: `postStaticParams`.
export const dynamicParams = false;

export async function generateStaticParams() {
  return postStaticParams(publishedPosts);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    return { title: 'Not Found' };
  }

  return buildMetadata({
    // A results page shows the shorter `metaTitle` when the post sets one; a link preview has the
    // room for the whole title, and no template. The page node is named with the same helper.
    title: postPageTitle(post),
    socialTitle: post.title,
    description: post.summary,
    path: postPath(post),
    type: 'article',
    // `buildMetadata()` declares a complete `openGraph`, so `blog/opengraph-image.tsx` never reaches
    // a post: each has its own card, drawn by the handler beside this page.
    image: {
      url: `${postPath(post)}/og-image.png`,
      alt: cardAlt(`Writing: ${post.title}`),
    },
  });
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPost(slug);

  if (!post) {
    notFound();
  }

  // The visible dates, labelled, from the two fields the sitemap and the post's structured data
  // read too, so they cannot disagree. A date that does not format, or a pair updated before it
  // was published, throws here and fails the prerender.
  const { published, updated } = formatContentDates(
    postPath(post),
    post.publishedAt,
    post.updatedAt,
  );
  const footerLines = FOOTER_LINES[post.kind];

  return (
    <div className="py-16 md:py-24">
      {/* #57's nodes, as a case study renders them (#61): the page named with the title its head
          carries, the post as its TechArticle, and its trail. Outside the article below, which an
          extractor reads for the post alone. */}
      <PostWebPageJsonLd post={post} />
      <PostArticleJsonLd post={post} />
      <PostBreadcrumbJsonLd post={post} />
      <div className="mx-auto max-w-3xl px-6">
        <Link
          href="/blog"
          className="mb-8 flex w-fit items-center gap-2 text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Writing
        </Link>

        {/* The post itself, without the way back: an extractor that reads the article gets the
            title, the dates and the body, and nothing of the page around them. */}
        <article>
          <header className="mb-12">
            <h1 className="mb-6 text-4xl font-bold wrap-break-word md:text-5xl">{post.title}</h1>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">Published</dt>
                <dd>
                  <time dateTime={post.publishedAt}>{published}</time>
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-[var(--muted)]">Updated</dt>
                <dd>
                  <time dateTime={post.updatedAt}>{updated}</time>
                </dd>
              </div>
            </dl>
          </header>

          <PostBody blocks={post.body} />
          {/* The kind's closing lines, last inside the article (ADR 0034). Readers that strip
              every `<footer>`, as Readability and trafilatura do, drop them. `--muted` rather
              than an opacity step (ADR 0011). */}
          {footerLines.length > 0 ? (
            <footer className="mt-12 space-y-2 border-t border-[var(--border)] pt-6 text-[var(--muted)]">
              {footerLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </footer>
          ) : null}
        </article>
      </div>
    </div>
  );
}
