// JSON-LD structured data. The nodes are built in `lib/structured-data.ts`, one `@id` graph (#57,
// ADR 0031); this module only renders them, every block through `serializeJsonLd`. Their values come
// from NEXT_PUBLIC_SITE_URL and the content data, and plain JSON serialisation alone would let a
// `</script>` in any of them end the script element early.
import type { CaseStudy } from '@/data/case-studies';
import type { PageRecord } from '@/data/pages/types';
// A type alone: it compiles away, so this module never carries the posts' values (`posts.test.ts`).
import type { PublishedPost } from '@/data/posts';
import { postPageTitle, postPath } from '@/lib/post-page';
import {
  breadcrumbList,
  person,
  profilePage,
  techArticle,
  webPage,
  website,
} from '@/lib/structured-data';

/**
 * JSON for a `<script type="application/ld+json">`, with every `<` written as `\u003c`: a JSON
 * parser reads the same string, and the HTML tokeniser never sees a `</script>` inside it.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

/** The Person, from the root layout on every route. */
export function PersonJsonLd() {
  return <JsonLd data={person()} />;
}

/** The WebSite, from the root layout on every route. */
export function WebsiteJsonLd() {
  return <JsonLd data={website()} />;
}

/**
 * A route's WebPage: `path` and `name` are the pathname and the title the page passes to
 * `buildMetadata()`. A case study adds `breadcrumb` and renders its `BreadcrumbListJsonLd` too; a
 * post renders `PostWebPageJsonLd`, which does the same with its `PostBreadcrumbJsonLd`. /about
 * renders `ProfilePageJsonLd` instead, and the 404 renders neither.
 */
export function WebPageJsonLd(props: {
  path: string;
  name: PageRecord['title'];
  breadcrumb?: boolean;
}) {
  return <JsonLd data={webPage(props)} />;
}

/** /about's page node, dated with the day its "Last updated" line shows. */
export function ProfilePageJsonLd(props: { path: string; dateModified: string }) {
  return <JsonLd data={profilePage(props)} />;
}

/** The path of a case study's page. */
const studyPath = (caseStudy: CaseStudy) => `/work/${caseStudy.slug}`;

/** A case study as an article: its words from `case-studies.ts`, its author the site's Person. */
export function TechArticleJsonLd({ caseStudy }: { caseStudy: CaseStudy }) {
  return (
    <JsonLd
      data={techArticle({
        path: studyPath(caseStudy),
        headline: caseStudy.title,
        description: caseStudy.description,
        datePublished: caseStudy.publishedAt,
        dateModified: caseStudy.updatedAt,
        keywords: caseStudy.tags,
      })}
    />
  );
}

/** Home → Work → the case study, the path a results page shows above the title. */
export function BreadcrumbListJsonLd({ caseStudy }: { caseStudy: CaseStudy }) {
  const path = studyPath(caseStudy);
  return (
    <JsonLd
      data={breadcrumbList({
        path,
        trail: [
          { name: 'Home', path: '/' },
          { name: 'Work', path: '/work' },
          { name: caseStudy.title, path },
        ],
      })}
    />
  );
}

/**
 * A published post's page node (#61): its path and the title its head carries, from the same
 * helpers `generateMetadata` uses, with the `breadcrumb` its `PostBreadcrumbJsonLd` serves, so the
 * page cannot pass one path or name here and another to its head.
 */
export function PostWebPageJsonLd({ post }: { post: PublishedPost }) {
  return <WebPageJsonLd path={postPath(post)} name={postPageTitle(post)} breadcrumb />;
}

/**
 * A published post as an article (#61): the case studies' TechArticle, by the site's Person, its
 * headline the post's `h1` and its dates the ones its Published and Updated line shows. #61 adds no
 * node type, so a post is no BlogPosting. It leaves out `description` and `keywords`, which the
 * post page does not show (`techArticle()`), and asserts nothing about how the post was written,
 * which the page does not say either (ADR 0034).
 */
export function PostArticleJsonLd({ post }: { post: PublishedPost }) {
  return (
    <JsonLd
      data={techArticle({
        path: postPath(post),
        headline: post.title,
        description: undefined,
        datePublished: post.publishedAt,
        dateModified: post.updatedAt,
        keywords: undefined,
      })}
    />
  );
}

/** Home → Writing → the post: /blog is Writing in the navigation, its title and its card. */
export function PostBreadcrumbJsonLd({ post }: { post: PublishedPost }) {
  const path = postPath(post);
  return (
    <JsonLd
      data={breadcrumbList({
        path,
        trail: [
          { name: 'Home', path: '/' },
          { name: 'Writing', path: '/blog' },
          { name: post.title, path },
        ],
      })}
    />
  );
}
