import Link from 'next/link';

export function CTA() {
  return (
    <section className="py-20 border-t border-[var(--border)]">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">
          Let&apos;s Build Something Together
        </h2>
        <p className="text-lg text-[var(--muted)] mb-8 max-w-2xl mx-auto">
          Open to new opportunities, consulting projects, and interesting
          collaborations. Let&apos;s connect and discuss how I can help.
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
