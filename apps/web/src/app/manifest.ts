import type { MetadataRoute } from 'next';

// A shortcut or bookmark on a phone takes its name, colours and icon from here. `display: 'browser'`:
// the site is a set of pages, not an app to install. The colours are `--background` in the dark
// theme, which the server renders first.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Milos Cvetkovic, Senior Full-Stack Engineer',
    short_name: 'Milos C.',
    description: 'Portfolio and case studies of Milos Cvetkovic.',
    start_url: '/',
    display: 'browser',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
