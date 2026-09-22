// Stand-in for next/navigation in the Claude Design bundle: tsconfig.paths.json maps the import
// here. navigation.tsx is the only component that imports it, for usePathname. Outside the App
// Router there is no current route, and Next's own hook returns null when no router is mounted, so
// this does the same: no navigation link is marked as the current page.
export function usePathname(): string | null {
  return null;
}
