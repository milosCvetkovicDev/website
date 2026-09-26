/**
 * The self-hosted Geist files carry their weight axis from 400 to 900 only (`src/app/fonts/README.md`),
 * so a lighter weight asked for anywhere would render at 400 without an error, a warning or a failed
 * test. These read the source, so they need no DOM.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('../..', import.meta.url));

/** Every TypeScript and CSS source under `src`, tests aside. */
function sources(dir = srcDir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(file);
    return /\.(ts|tsx|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

/** A weight below 400: a Tailwind utility, an arbitrary value, a CSS declaration or a style prop. */
const BELOW_400 =
  /\bfont-(?:thin|extralight|light)\b|\bfont-\[[1-3]00\]|font-weight:\s*(?:[1-3]00|lighter)\b|fontWeight:\s*['"]?(?:[1-3]00|lighter)\b/;

describe('font weights', () => {
  it('declares both Geist faces from 400 to 900', () => {
    const layout = readFileSync(path.join(srcDir, 'app/layout.tsx'), 'utf8');
    expect(layout.match(/weight: '[^']*'/g)).toEqual(["weight: '400 900'", "weight: '400 900'"]);
  });

  it('asks for no weight below 400', () => {
    const below = sources().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((text, index) =>
          BELOW_400.test(text) ? [`${path.relative(srcDir, file)}:${index + 1}`] : [],
        ),
    );
    expect(below).toEqual([]);
  });
});
