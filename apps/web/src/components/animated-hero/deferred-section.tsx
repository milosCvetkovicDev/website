'use client';

import { Suspense, type ReactNode } from 'react';

/** What a section shows while its chunk is still loading. */
export function SectionPlaceholder() {
  return <div className="min-h-screen" />;
}

export function DeferredSection({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SectionPlaceholder />}>{children}</Suspense>;
}
