import Link from 'next/link';
import { COLLECTED, privacyCopy, privacyRecord } from '@/data/pages/privacy';
import type { Paragraph } from '@/data/pages/types';
import { linkKind } from '@/lib/links';
import { WebPageJsonLd } from '@/components/json-ld';
import { buildMetadata } from '@/lib/metadata';
import { STATIC_ROUTE_UPDATED } from '@/data/static-routes';

export const metadata = buildMetadata({
  title: privacyRecord.title,
  description: privacyRecord.summary,
  path: privacyRecord.path,
});

const LINK_CLASS = 'text-[var(--accent-text)] underline underline-offset-4';

/** A paragraph from the record: its text, with each link in it styled as the notice's links are. */
function Sentence({ paragraph }: { paragraph: Paragraph }) {
  if (typeof paragraph === 'string') return paragraph;
  return paragraph.map((piece, index) => {
    if (typeof piece === 'string') return piece;
    // An on-site path goes through the router, an external URL is a plain link, as before, and any
    // other href throws at build time.
    return linkKind(piece.href) === 'site' ? (
      <Link key={index} href={piece.href} className={LINK_CLASS}>
        {piece.text}
      </Link>
    ) : (
      <a key={index} href={piece.href} className={LINK_CLASS}>
        {piece.text}
      </a>
    );
  });
}

export default function PrivacyPage() {
  return (
    <div className="py-16 md:py-24">
      <WebPageJsonLd path={privacyRecord.path} name={privacyRecord.title} />
      <div className="mx-auto max-w-3xl px-6">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">{privacyRecord.heading}</h1>
        <p className="mb-12 text-xl text-[var(--muted)]">{privacyCopy.intro}</p>

        <section className="mb-10">
          <h2 className="mb-3 text-2xl font-semibold">{privacyCopy.statistics.heading}</h2>
          <p className="mb-4 text-[var(--muted)]">{privacyCopy.statistics.lead}</p>
          <ul className="mb-4 list-disc space-y-1 pl-6 text-[var(--muted)]">
            {COLLECTED.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-[var(--muted)]">
            <Sentence paragraph={privacyCopy.statistics.closing} />
          </p>
        </section>

        {privacyCopy.notes.map((note) => (
          <section key={note.heading} className="mb-10">
            <h2 className="mb-3 text-2xl font-semibold">{note.heading}</h2>
            {note.paragraphs.map((paragraph, index) => (
              <p key={index} className="text-[var(--muted)]">
                <Sentence paragraph={paragraph} />
              </p>
            ))}
          </section>
        ))}

        <p className="text-sm text-[var(--muted)]">
          Last updated{' '}
          <time dateTime={STATIC_ROUTE_UPDATED['/privacy']}>
            {STATIC_ROUTE_UPDATED['/privacy']}
          </time>
          .
        </p>
      </div>
    </div>
  );
}
