# Self-hosted Geist fonts

`../layout.tsx` loads these two files through `next/font/local`, so `next build` fetches nothing
from Google Fonts. They are cut from the variable fonts in the `geist` npm package, version 1.7.2
(Geist 1.800, Geist Mono 1.700), to the character ranges Google Fonts served the site before, and
their weight axis is cut to 400 to 900, because the site sets no weight below 400. Both fonts are
under the SIL Open Font License, reproduced in [OFL.txt](OFL.txt).

| File                             | Font                           | Characters                    | Size    |
| -------------------------------- | ------------------------------ | ----------------------------- | ------- |
| `geist-latin.woff2`              | Geist, weights 400 to 900      | Google Fonts' latin range     | 21.4 KB |
| `geist-mono-latin-symbols.woff2` | Geist Mono, weights 400 to 900 | latin, plus the symbols range | 20.1 KB |
| `geist-mono-600-mark.ttf`        | Geist Mono, weight 600 only    | `m`, `c` and `_`              | 2.3 KB  |

`geist-mono-600-mark.ttf` is not loaded by the layout. `../../lib/brand-mark.tsx` passes it to
ImageResponse, which draws `/icon`, `/apple-icon` and `/favicon.ico` and cannot read woff2 or
variable fonts, so it is a static TrueType instance of the mono file above, cut to the three
characters the mark uses. The mark must stay within them: for any other character ImageResponse
would fetch a font from the network at build time.

Google Fonts preloaded only its latin files and fetched the other ranges when a page used them. The
symbols range is in Geist Mono's file because the hero's tmux background draws box-drawing
characters in Geist Mono on every visit to `/`. Characters outside both files, such as the arrows
and the check marks, fall back to `Geist Fallback` and `Geist Mono Fallback`. `../globals.css`
declares both with the override values Google Fonts used, so those characters keep the size they
had.

## How the files compare with what Google Fonts served

Rendered side by side in Chromium at weights 400, 600 and 700, each file matches the Google Fonts
latin file it replaces with no differing pixel. The box-drawing characters differ from Google Fonts'
separate symbols file in anti-aliasing only: their outlines, advance widths, variations and glyph
names are identical, and they render exactly as in the package's `GeistMono-Variable.woff2`. The
files carry the layout features the Google Fonts latin files kept, except `mkmk`, which `pyftsubset`
leaves out because its mark-on-mark lookups only apply to characters outside these ranges.

## The weight axis

Both files carried Geist's whole weight axis, 100 to 900, until 2026-09-25. The site sets no weight
below 400: no `font-thin`, `font-extralight` or `font-light` utility, no `fontWeight` or
`font-weight` below 400, and the icons draw the mark at 600. Their axis is now cut to 400 to 900
with `fonttools varLib.instancer`, which keeps the format, the glyph set, the glyph names and every
other table, and drops only the variation data below 400 and the Thin, ExtraLight and Light named
instances. That saves 6,972 bytes on `geist-latin.woff2` and 6,312 on
`geist-mono-latin-symbols.woff2`. Instanced at 400, 500, 600, 700, 800 and 900, every glyph has the
same outline, advance width and kerning as before except U+00A4 `¤`, which no page uses: it moves
by up to 0.5 units of 1,000, at 900. The default, 400, is unchanged. Rendered in Chromium at the
same six weights, at 14 to 48 px, both files match the files they replace with no differing
pixel, `¤` aside. Keep `--no-recalc-bounds` in the commands below: without it the instancer
recomputes the `maxp` maxima, which `pyftsubset` leaves at the full font's larger values, and
Chromium on macOS then draws weight-400 text with a few pixels one to three levels apart, although
no outline changes. A weight below 400 set in the future would render at 400.

Keep `--glyph-names` in the commands below. Without it `pyftsubset` drops the glyph names from the
`post` table, and Chromium on macOS then draws glyph edges differently, as a pixel comparison
showed, although no outline, metric or variation changes.

## Regenerating

With fontTools 4.65.0 and brotli 1.2.0 (`pip install fonttools==4.65.0 brotli==1.2.0`), run from the
package's `dist/fonts` directory. The commands are deterministic: running them again reproduces all
three files byte for byte. The first two cut the full-axis files the site served before 2026-09-25;
the instancer then cuts their weight axis, keeping the package's timestamp in the `head` table.

```bash
LATIN='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
LATIN+='U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
SYMBOLS='U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F'
pyftsubset geist-sans/Geist-Variable.woff2 --unicodes="$LATIN" \
  --layout-features=ccmp,dnom,frac,liga,locl,numr,pnum,tnum,kern,mark,mkmk \
  --no-hinting --glyph-names --name-IDs='*' --name-languages='*' --notdef-outline --flavor=woff2 \
  --output-file=geist-latin-full.woff2
pyftsubset geist-mono/GeistMono-Variable.woff2 --unicodes="$LATIN,$SYMBOLS" \
  --layout-features=ccmp,dnom,frac,locl,numr,mark,mkmk \
  --no-hinting --glyph-names --name-IDs='*' --name-languages='*' --notdef-outline --flavor=woff2 \
  --output-file=geist-mono-latin-symbols-full.woff2
for f in geist-latin geist-mono-latin-symbols; do
  fonttools varLib.instancer "$f-full.woff2" wght=400:900 --no-recalc-timestamp --no-recalc-bounds \
    --output="$f.woff2"
  rm "$f-full.woff2"
done
```

Copy the two results, `geist-latin.woff2` and `geist-mono-latin-symbols.woff2`, into this directory.

The mark font is cut from `geist-mono-latin-symbols.woff2` itself, from this directory, with the
same fontTools. `SOURCE_DATE_EPOCH` pins the timestamp fontTools writes into the `head` table;
without it every run gives different bytes. It is the time of the commit that first added the mono
file (#75), written out because the file's latest commit changes whenever the file does. Cut from
the 400 to 900 file, the mark comes out byte for byte the file cut from the full-axis one.

```bash
export SOURCE_DATE_EPOCH=1789296860
fonttools varLib.instancer geist-mono-latin-symbols.woff2 wght=600 --static --output=mono600.woff2
pyftsubset mono600.woff2 --unicodes='U+005F,U+0063,U+006D' \
  --no-hinting --glyph-names --name-IDs='*' --name-languages='*' --notdef-outline \
  --output-file=geist-mono-600-mark.ttf
rm mono600.woff2
```
