// Next.js inlines process.env.NEXT_PUBLIC_* into client bundles at build time; the sync's esbuild
// bundle defines only process.env.NODE_ENV. json-ld.tsx reads NEXT_PUBLIC_SITE_URL at module scope,
// and the converter bundles every module under src/components, so without a `process` the bundle
// throws "process is not defined" while it loads and window.Portfolio never exists.
//
// config.json lists this module in extraEntries, which the converter imports ahead of the
// components, so it runs first. An empty env makes such reads undefined, which is exactly what the
// code falls back from (NEXT_PUBLIC_SITE_URL to https://miloscvetkovic.dev). Nothing else in the
// bundle touches `process` once next/link and next/navigation resolve to the stand-ins in next/.
globalThis.process ??= { env: {} };
