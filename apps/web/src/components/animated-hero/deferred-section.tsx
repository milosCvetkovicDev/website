'use client';

import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIsHydrated } from '@/hooks/use-is-hydrated';

/** What a section shows when it has no server HTML yet (client-side navigation) or its chunk failed. */
export function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

// Anything already scrolled past counts as approached, so a restored scroll position, the End key
// or a progress-dot jump hydrates the sections above the viewport before the visitor scrolls back
// up into them. Below the viewport nothing is touched, which is what keeps every section out of
// the page-load work: the first one starts a navigation bar below the fold.
const ROOT_MARGIN = '10000px 0px 0px 0px';

interface Gate {
  promise: Promise<void>;
  open: () => void;
}

function createGate(): Gate {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/**
 * Suspends a server-rendered subtree during hydration until `ready`. While a Suspense boundary is
 * dehydrated React leaves the server HTML in place, so the section's markup is there for crawlers,
 * assistive technology, find-in-page and print from the first byte, and none of its client work
 * (the chunk, hydration, GSAP) runs before the visitor is about to reach it. Throwing the promise
 * is the mechanism React.lazy itself uses. On a client-side navigation there is no server HTML, so
 * the boundary shows its fallback until `ready` instead. The server never throws: it renders.
 */
function HydrationGate({
  gate,
  ready,
  children,
}: {
  gate: Gate;
  ready: boolean;
  children: ReactNode;
}) {
  if (!ready && typeof window !== 'undefined') throw gate.promise;
  return <>{children}</>;
}

/**
 * Server-renders its section and hydrates it only when the section approaches the viewport.
 * Browsers without IntersectionObserver hydrate every section once the page itself has hydrated.
 */
export function DeferredSection({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [gate] = useState(createGate);
  const [approached, setApproached] = useState(false);
  const hydrated = useIsHydrated();

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setApproached(true);
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const ready = approached || (hydrated && typeof IntersectionObserver === 'undefined');

  // React retries a dehydrated boundary when the promise it was suspended on settles.
  useEffect(() => {
    if (ready) gate.open();
  }, [ready, gate]);

  return (
    <div ref={wrapperRef}>
      <Suspense fallback={<SectionPlaceholder />}>
        <HydrationGate gate={gate} ready={ready}>
          {children}
        </HydrationGate>
      </Suspense>
    </div>
  );
}
