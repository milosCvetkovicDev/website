// Stand-in for @vercel/analytics/next in the Claude Design bundle: tsconfig.paths.json maps the
// import here. web-analytics.tsx imports it, and the synthesized entry exports every file in
// src/components, so the bundle carries it even though WebAnalytics has no card. The real module
// imports next/navigation.js, with its extension, which the next/navigation key does not match (a
// paths key without a * matches only the exact specifier), and that pulled Next's router internals
// back into the bundle (813 KB, against 560 KB with this stand-in). A design is not a Vercel
// deployment and must never send analytics beacons, so this renders nothing, as WebAnalytics itself
// does outside production and preview builds.
export function Analytics(_props: Record<string, unknown>): null {
  return null;
}
