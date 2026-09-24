import { markImage } from '@/lib/brand-mark';
import { icoFromPngs } from '@/lib/ico';

// Browsers and crawlers still ask for /favicon.ico without reading any <link>, so it answers with
// the same mark as `icon.tsx`, packed as an ICO at build time rather than kept as a binary that a
// change to the mark would have to regenerate by hand.
export const dynamic = 'force-static';

const SIZES = [16, 32, 48];

export async function GET() {
  const frames = await Promise.all(
    SIZES.map(async (size) => ({
      size,
      data: new Uint8Array(await markImage(size).arrayBuffer()),
    })),
  );
  return new Response(icoFromPngs(frames), { headers: { 'Content-Type': 'image/x-icon' } });
}
