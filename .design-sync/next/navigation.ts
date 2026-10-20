// Stand-in for next/navigation in the Claude Design bundle: tsconfig.paths.json maps the import
// here. navigation.tsx is the only component that imports it, for usePathname. Next types the App
// Router's hook as returning a string, and the site relies on that: isCurrentLink in
// current-link.ts calls pathname.startsWith, so a null here throws and Navigation renders nothing
// (it did, from #178 until this was a string). Outside the App Router there is no current route,
// so this returns an empty path, which no header link matches: no link is marked as the current
// page.
export function usePathname(): string {
  return '';
}
