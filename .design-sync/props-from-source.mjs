// Prints each component's props, read from its TypeScript source, as the `dtsPropsFor` bodies in
// config.json. The converter reads props only from a built package's .d.ts files, and apps/web
// ships none, so config.json carries them by hand; this script is how they were written and how a
// re-sync checks them for drift.
//
//   node .design-sync/props-from-source.mjs          prints {"Name": "body", ...} as JSON
//   node .design-sync/props-from-source.mjs --check  exits 1 and names each component whose
//                                                    config.json body differs from its source
//
// Run from the repository root after the converter's dependencies are staged, because it imports
// ts-morph from .ds-sync/node_modules (non-storybook/SKILL.md step 7).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Project, Node, ts } = createRequire(join(root, '.ds-sync', 'package.json'))('ts-morph');

const config = JSON.parse(readFileSync(join(root, '.design-sync', 'config.json'), 'utf8'));
const excluded = new Set(
  Object.entries(config.componentSrcMap ?? {})
    .filter(([, path]) => path === null)
    .map(([name]) => name),
);

const project = new Project({
  tsConfigFilePath: join(root, 'apps', 'web', 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});
project.addSourceFilesAtPaths([
  join(root, 'apps/web/src/components/**/*.tsx'),
  `!${join(root, 'apps/web/src/components/**/__tests__/**')}`,
]);

// React's own props (key, ref) are not part of a component's API.
const REACT_PROPS = new Set(['key', 'ref']);
const NO_PROPS = '  // Takes no props.';
const flags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType |
  ts.TypeFormatFlags.WriteArrayAsGenericType;

// The emitted <Name>.d.ts imports only React (as `React`), so a prop's type is written out in full:
// React's own types keep a React. prefix, and a type declared in this repository (a union alias, an
// object type from src/data) is expanded in place, since its name would not resolve there.
const isRepoDeclared = (type) =>
  (type.getAliasSymbol() ?? type.getSymbol())
    ?.getDeclarations()
    .some((d) => d.getSourceFile().getFilePath().includes('/apps/web/src/')) ?? false;

const printForeign = (type, at) =>
  type
    .getText(at, flags)
    .replace(/\bimport\("[^"]*"\)\.(?:React\.)?/g, 'React.')
    .replace(/(?<![.\w])(ReactNode|ReactElement|CSSProperties|RefObject)\b/g, 'React.$1');

function printType(type, at, depth = 0) {
  // A named type from outside the repository (React.ReactNode above all) stays named.
  if (type.getAliasSymbol() && !isRepoDeclared(type)) return printForeign(type, at);
  if (type.isUnion() && !type.isBoolean()) {
    const members = type.getUnionTypes().filter((t) => !t.isUndefined());
    // true | false inside a wider union prints as boolean.
    const booleans = members.filter((t) => t.isBooleanLiteral());
    const rest = members.filter((t) => !t.isBooleanLiteral()).map((t) => printType(t, at, depth));
    if (booleans.length === 2) rest.push('boolean');
    else rest.push(...booleans.map((t) => t.getText()));
    return [...new Set(rest)].join(' | ');
  }
  const readonlyArray = type.isReadonlyArray();
  if (readonlyArray || type.isArray()) {
    const element = type.getArrayElementType() ?? type.getTypeArguments()[0];
    if (element) {
      const inner = printType(element, at, depth);
      return `${readonlyArray ? 'ReadonlyArray' : 'Array'}<${inner}>`;
    }
  }
  if (type.isObject() && isRepoDeclared(type) && !type.getCallSignatures().length && depth < 3) {
    const members = type.getApparentProperties().map((property) => {
      const optional = property.isOptional() ? '?' : '';
      const propertyType = property.getTypeAtLocation(at);
      return `${property.getName()}${optional}: ${printType(propertyType, at, depth + 1)}`;
    });
    return `{ ${members.join('; ')} }`;
  }
  return printForeign(type, at);
}

const bodies = {};
for (const sourceFile of project.getSourceFiles()) {
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name) || excluded.has(name)) continue;
    const declaration = declarations.find(
      (d) => Node.isFunctionDeclaration(d) || Node.isVariableDeclaration(d),
    );
    if (!declaration) continue;
    const signature = declaration.getType().getCallSignatures()[0];
    if (!signature) continue;
    const parameter = signature.getParameters()[0];
    if (!parameter) {
      // The converter treats an empty body as missing and emits an index signature instead, which
      // would tell the design agent that any prop goes.
      bodies[name] = NO_PROPS;
      continue;
    }
    const propsType = parameter.getTypeAtLocation(declaration);
    const lines = [];
    for (const property of propsType.getApparentProperties()) {
      if (REACT_PROPS.has(property.getName())) continue;
      const type = property.getTypeAtLocation(declaration);
      const optional = property.isOptional() ? '?' : '';
      lines.push(`  ${property.getName()}${optional}: ${printType(type, declaration)};`);
    }
    bodies[name] = lines.join('\n');
  }
}

const sorted = Object.fromEntries(Object.entries(bodies).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--check')) {
  const recorded = config.dtsPropsFor ?? {};
  const drift = Object.keys(sorted).filter((name) => recorded[name] !== sorted[name]);
  const stale = Object.keys(recorded).filter((name) => !(name in sorted));
  for (const name of drift) console.error(`drift: ${name}`);
  for (const name of stale) console.error(`no longer a component: ${name}`);
  process.exit(drift.length || stale.length ? 1 : 0);
}
console.log(JSON.stringify(sorted, null, 2));
