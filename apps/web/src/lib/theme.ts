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
