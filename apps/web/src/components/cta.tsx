import Link from 'next/link';

export function CTA() {
  return (
    <section className="py-20 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Got a Hard Problem?
        </h2>
        <p className="text-lg text-[var(--muted)] mb-8 max-w-2xl mx-auto">
          Whether you need a senior engineer, a technical consultant, or someone
          to rescue that legacy system everyone&apos;s afraid to touch—let&apos;s talk.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center justify-center px-8 py-4 bg-[var(--accent)] text-white font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors text-lg"
        >
          Get In Touch
        </Link>
      </div>
    </section>
  );
}
