/**
 * Theme constants shared by the server-rendered init script and the client provider.
 * Deliberately not a client module: `app/layout.tsx` renders on the server.
 */
export const THEME_STORAGE_KEY = 'theme';
export const DARK_COLOR_SCHEME_QUERY = '(prefers-color-scheme: dark)';

/**
 * Applies the stored (or system) theme to <html> before React hydrates, so the first paint is
 * already correct and there is no light-to-dark flash. Both reads are guarded: localStorage
 * throws when site data is blocked, and matchMedia is absent in a few embedded browsers.
 */
export const THEME_INIT_SCRIPT = `(function(){var k='${THEME_STORAGE_KEY}',q='${DARK_COLOR_SCHEME_QUERY}';function m(){try{return matchMedia(q).matches}catch(e){return false}}var d;try{var s=localStorage.getItem(k);d=s==='dark'||(s!=='light'&&m())}catch(e){d=m()}document.documentElement.classList.add(d?'dark':'light')})()`;

/** The two globals the theme is read from, injectable so a test can reach every branch. */
export interface ThemeEnvironment {
  localStorage?: Pick<Storage, 'getItem'>;
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * The theme THEME_INIT_SCRIPT picks, as a function, for code that runs after React has taken over
 * the document: `app/global-error.tsx` replaces the root layout on the client, where a rendered
 * `<script>` never runs and React reports one as an error. The branches are the script's, guard for
 * guard, and `lib/__tests__/theme.test.ts` holds the two to the same answer in every case.
 */
export function preferredTheme(env: ThemeEnvironment = globalThis): 'dark' | 'light' {
  const prefersDark = () => {
    try {
      return env.matchMedia!(DARK_COLOR_SCHEME_QUERY).matches;
    } catch {
      return false;
    }
  };
  try {
    const stored = env.localStorage!.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' || (stored !== 'light' && prefersDark()) ? 'dark' : 'light';
  } catch {
    return prefersDark() ? 'dark' : 'light';
  }
}
