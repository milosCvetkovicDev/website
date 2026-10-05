// Checks conventions.md, the header stitched into the design agent's README, against the last build
// in ds-bundle/: every utility class it names must be compiled into _ds_bundle.css, every `--token`
// defined there, and every component it names must have a card (a .d.ts the design agent codes
// against) or be the configured provider. Tailwind emits only the classes it finds, so a recipe
// class whose last user is deleted silently stops existing, and a design that follows the recipe
// gets nothing: `py-20` went that way when #149 deleted CTA, its last user, and stayed in the
// section recipe until the 2026-10-05 re-sync.
//
//   node .design-sync/check-conventions.mjs
//
// Run it from the repository root after the driver. It exits 1 and names each missing class, token
// or component.
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const md = readFileSync('.design-sync/conventions.md', 'utf8');
const css = readFileSync('ds-bundle/_ds_bundle.css', 'utf8');
// A component with a card has components/<group>/<Name>/<Name>.d.ts; one excluded with
// `componentSrcMap: null` is still in the bundle but has no card, so the bundle is no evidence. The
// one exception is the provider: ThemeProvider has no card, and the header tells every design to
// wrap itself in it.
const config = JSON.parse(readFileSync('.design-sync/config.json', 'utf8'));
const usable = new Set(
  readdirSync('ds-bundle/components').flatMap((group) =>
    readdirSync(`ds-bundle/components/${group}`).filter((name) =>
      existsSync(`ds-bundle/components/${group}/${name}/${name}.d.ts`),
    ),
  ),
);
if (config.provider?.component) usable.add(config.provider.component);

// Backticked words that are not classes: the picker groups, the brand marks, and prose.
const NOT_CLASSES = new Set([
  'hud',
  'content',
  'sections',
  'featured-work',
  'animated-hero',
  'brand',
  'md',
  'mc_',
  'M/C',
  'color',
  'translate',
  'light',
  'dark',
]);
// Utilities that are a single word, so the hyphen test below would not take them for classes.
const BARE_UTILITIES = new Set([
  'flex',
  'grid',
  'block',
  'hidden',
  'italic',
  'uppercase',
  'relative',
  'absolute',
  'border',
  'rounded',
  'shadow',
  'underline',
  'truncate',
  'fixed',
  'sticky',
  'transition',
  'container',
]);
// Classes the header names only as what not to use. Their absence from the build is fine, and their
// presence is an accident: text-green-400 is compiled only because e2e/accessibility.spec.ts names
// it, in a comment and in an assertion message.
const ANTI_EXAMPLES = new Set(['text-green-400']);
// `!` may lead or end a class: Tailwind v4's important form is `flex!`, and v3's `!flex` still
// works.
const UTILITY = /^[a-z!-][\w:\-[\]()/.%#,!]*$/;

const spans = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const jsx = [...md.matchAll(/```jsx\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
const classLists = [
  ...spans.flatMap((span) => [...span.matchAll(/className="([^"]+)"/g)].map((m) => m[1])),
  ...[...jsx.matchAll(/className="([^"]+)"/g)].map((m) => m[1]),
  // A span that is markup, a file name, a selector or a call is not a class list.
  ...spans.filter((span) => !/[<>{}=;'`]|^[.:_]|\.(md|ts|css)$|\(\)$/.test(span)),
];

const classes = new Set();
for (const list of classLists) {
  for (const token of list.split(/\s+/)) {
    if (
      !token ||
      NOT_CLASSES.has(token) ||
      ANTI_EXAMPLES.has(token) ||
      token.startsWith('--') ||
      !UTILITY.test(token)
    )
      continue;
    if (/[-:[]/.test(token) || BARE_UTILITIES.has(token.replace(/^!|!$/g, ''))) classes.add(token);
  }
}
// Tailwind escapes every character outside [A-Za-z0-9_-] in a selector with a backslash. The
// selector must end where the class does, or `max-w-5` would pass on `.max-w-5xl` and `border` on
// `.border-t`.
const selector = (cls) => `.${cls.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)}`;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compiled = (cls) => new RegExp(`${escapeRegExp(selector(cls))}(?=[\\s,{:.>[)~+])`).test(css);
const missingClasses = [...classes].filter((cls) => !compiled(cls));

const tokens = new Set([...md.matchAll(/--[a-z][a-z0-9-]*/g)].map((m) => m[0]));
const missingTokens = [...tokens].filter((token) => !new RegExp(`${token}\\s*:`).test(css));

const components = new Set([...md.matchAll(/(?:`<?|<)([A-Z][a-z][A-Za-z]+)/g)].map((m) => m[1]));
const missingComponents = [...components].filter((name) => !usable.has(name));

const counts = [
  `${classes.size} classes`,
  `${tokens.size} tokens`,
  `${components.size} components`,
];
console.log(`conventions.md: ${counts.join(', ')} checked`);
for (const cls of missingClasses) console.error(`missing class: ${cls} (not in _ds_bundle.css)`);
for (const token of missingTokens)
  console.error(`missing token: ${token} (not defined in _ds_bundle.css)`);
for (const name of missingComponents)
  console.error(`missing component: ${name} (no card in ds-bundle/components, not the provider)`);
process.exit(missingClasses.length || missingTokens.length || missingComponents.length ? 1 : 0);
