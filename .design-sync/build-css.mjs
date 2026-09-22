// Compiles .design-sync/styles.css into the stylesheet the Claude Design sync ships (cssEntry in
// config.json), with the @tailwindcss/postcss plugin the site itself builds with
// (apps/web/postcss.config.mjs). This is the sync's build step (buildCmd): run it from the
// repository root before the converter, and again whenever a component, a preview or globals.css
// changes, because Tailwind only emits the utilities it finds in those files.
//
//   node .design-sync/build-css.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'apps', 'web');
const from = join(root, '.design-sync', 'styles.css');
// Under the package: the converter only reads a cssEntry from inside it. `dist` is gitignored and
// prettier-ignored, and .vercelignore lists apps/web/dist.
const to = join(app, 'dist', 'design-sync', 'styles.css');

// The plugin resolves from apps/web and PostCSS from the plugin, so both are the lockfile's copies.
const pluginPath = createRequire(join(app, 'package.json')).resolve('@tailwindcss/postcss');
const requireFromPlugin = createRequire(pluginPath);
const pluginModule = requireFromPlugin(pluginPath);
const tailwind = pluginModule.default ?? pluginModule;
const postcss = requireFromPlugin('postcss');

// base: automatic source detection scans apps/web, as it does when Next builds the site there.
// optimize without minify: Lightning CSS applies the same syntax lowering as the site's production
// build, and the output stays readable for the design agent, which reads it as reference.
let result;
try {
  result = await postcss([tailwind({ base: app, optimize: { minify: false } })]).process(
    readFileSync(from, 'utf8'),
    { from, to },
  );
} catch (error) {
  console.error(`${relative(root, from)}: ${error.message}`);
  process.exit(1);
}

// Tailwind reports an unresolvable @source glob or a malformed `@source inline(...)` as a warning,
// not a throw, and the missing utilities would only show up as an unstyled card much later.
const warnings = result.warnings();
for (const warning of warnings) console.error(`warning: ${warning.toString()}`);
if (warnings.length) {
  console.error(`${relative(root, from)}: ${warnings.length} warning(s) — fix them and re-run`);
  process.exit(1);
}

mkdirSync(dirname(to), { recursive: true });
writeFileSync(to, result.css);
console.log(`${relative(root, to)}: ${(Buffer.byteLength(result.css) / 1024).toFixed(0)} KB`);
