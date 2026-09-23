/**
 * Guard for the colour rule ADR 0008 set and ADR 0011 carried over, which CLAUDE.md restates under
 * Conventions: text is not dimmed with an opacity modifier, "decorative or `aria-hidden` text
 * included, since axe measures it either way". The axe gate (`e2e/accessibility.spec.ts`) enforces
 * it only on what a route renders, at the moment it samples: `CodeLine`'s line numbers,
 * `text-[var(--muted)]/50` at 2.74:1 on the Terminal, went unnoticed until #110 because no route
 * renders `CodeLine`. This reads the source instead, so it sees every component a page uses or not.
 *
 * It reads every module under `src/components` outside tests and flags dimming declared in the
 * markup that reaches text:
 *
 * - an alpha on a text colour, as a modifier (`text-[var(--muted)]/50`, `text-white/60`,
 *   `text-muted/50`) or inside the colour (`text-[rgba(99,102,241,0.7)]`, `text-[#e6edf399]`, a
 *   `var()` whose value in globals.css carries one), and the same on the `fill` that paints SVG text;
 * - an opacity strictly between 0 and 1: `opacity-60`, `[opacity:.5]`, SVG `opacity`;
 * - an animation whose keyframes leave text part-transparent, judged from Tailwind's and globals.css's
 *   own definitions, which is why `animate-pulse` counts and `animate-spin` and the reveals do not;
 * - a `style` colour, opacity or animation whose value the scan can resolve within the module;
 * - a colour or an opacity handed to a component in a prop named for one, which the scan does not
 *   follow into the component, so it reports it where it is handed over.
 *
 * `opacity-0` and an alpha of 0 hide rather than dim, so the reveal idiom stays legal. "Reaches
 * text" is structural: text or an expression anywhere under the element, SVG `<text>` included, or
 * content the scan cannot see, such as an imported component's output. An opacity reaches the whole
 * subtree, because it composites everything under the element, which is how `DataStream`'s
 * `opacity-10` wrapper dimmed digits one element down until #111. A colour stops where a descendant
 * always sets its own, and SVG text takes `fill` rather than `color`, so a decorative SVG can keep
 * a dimmed `currentColor`, as the section progress corners do. A class a variant aims elsewhere
 * reaches what it aims at: the children or descendants `*:`, `**:` and `[&_p]:` select, or the
 * content `before:` generates.
 *
 * Not charged to anything: a class under `disabled:`, which WCAG 1.4.3 exempts and axe does not
 * measure, and text that is never painted (`sr-only` whatever happens, `hidden`, an SVG `<title>`).
 * Counted, because the scan cannot tell: an imported component's output, a class string it cannot
 * trace to an element, and the siblings a variant selects. Out of reach, and so out of scope: colours
 * set from script, GSAP tweens (ADR 0008's separate rule that a reveal starts from 0), `style` values
 * held in props or state, gradient text, `stroke` on text, classes in `dangerouslySetInnerHTML`,
 * class names assembled at run time (which Tailwind tells you never to write), classes imported from
 * outside `src/components`, and `src/app`, whose pages the axe gate audits.
 *
 * The violations present when the guard landed are expected failures in KNOWN_DEFECTS, and the
 * change that fixes one deletes its entry. globals.css keeps this directory out of Tailwind's source
 * detection, because the fixtures below spell out dozens of the utilities the rule forbids. Nothing
 * here needs a DOM, and building a jsdom window costs about two seconds per file.
 *
 * @vitest-environment node
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  animationDims,
  animationUtilitiesIn,
  appDir,
  keyframesIn,
  scanSource,
  vocabulary,
  type Scan,
  type Site,
  type Verdict,
} from './dimmed-text';

const COMPONENTS_DIR = 'src/components';

// --- The fixtures --------------------------------------------------------------------------------

function scan(source: string, file = 'src/components/fixture.tsx'): Scan {
  return scanSource(source, file);
}

/** The dimmings the scan reports, with why: over text, or not traced to an element. */
const flagged = (result: Scan) =>
  result.sites
    .filter((site) => site.verdict !== 'no-text')
    .map((site) => [site.token, site.verdict]);

/** A fixture's expected report: a bare token is a dimming over text. */
const report = (expected: (string | [string, Verdict])[]) =>
  expected.map((entry) => (typeof entry === 'string' ? [entry, 'text'] : entry));

describe('what the scan flags', () => {
  // A translucent custom property of the fixtures' own, so that no fixture leans on what globals.css
  // holds: the fix for StaticPane's log lines may well make the --log-* colours opaque.
  beforeAll(() => {
    vocabulary.properties.set('--fixture-translucent', ['rgba(0, 0, 0, 0.5)']);
  });
  afterAll(() => {
    vocabulary.properties.delete('--fixture-translucent');
  });

  it.each<[string, string, (string | [string, Verdict])[]]>([
    [
      "CodeLine's gutter as it was before #110",
      `export function CodeLine({ lineNumber }: { lineNumber?: number }) {
        return (
          <div className="group flex">
            {lineNumber !== undefined && (
              <span className="w-8 text-right text-[var(--muted)]/50 group-hover:text-[var(--muted)]">
                {lineNumber}
              </span>
            )}
          </div>
        );
      }`,
      ['text-[var(--muted)]/50'],
    ],
    [
      'an alpha on white, on a palette shade and on a theme colour',
      `export const Labels = () => (
        <p>
          <span className="text-white/60">one</span>
          <span className="text-green-800/70">two</span>
          <span className="text-muted/50 text-accent-text/60">three</span>
        </p>
      );`,
      ['text-white/60', 'text-green-800/70', 'text-muted/50', 'text-accent-text/60'],
    ],
    [
      "arbitrary colours, arbitrary alphas and Tailwind v4's variable shorthand",
      `export const Labels = () => (
        <p>
          <span className="text-[#8b949e]/50 text-[color:var(--x)]/50 text-[rgb(1_2_3)]/50">a</span>
          <span className="text-(--muted)/50 text-[var(--muted)]/[0.6] text-white/(--alpha)">b</span>
        </p>
      );`,
      [
        'text-[#8b949e]/50',
        'text-[color:var(--x)]/50',
        'text-[rgb(1_2_3)]/50',
        'text-(--muted)/50',
        'text-[var(--muted)]/[0.6]',
        'text-white/(--alpha)',
      ],
    ],
    [
      'an alpha inside the colour, as the hero skill tags have',
      `export function SkillTags({ tags }: { tags: string[] }) {
        return (
          <ul>
            {tags.map((tag) => (
              <li
                key={tag}
                className="text-[rgba(99,102,241,0.7)] hover:text-[#a78bfa] dark:text-[rgba(167,139,250,0.6)]"
              >
                {tag}
              </li>
            ))}
          </ul>
        );
      }`,
      ['text-[rgba(99,102,241,0.7)]', 'dark:text-[rgba(167,139,250,0.6)]'],
    ],
    [
      'an alpha in every colour notation, and in the token a colour names',
      `export const Labels = () => (
        <p>
          <span className="text-[#e6edf399] text-[#abc8] text-[rgb(230_237_243/0.6)]">a</span>
          <span className="text-[hsl(0_0%_90%/60%)] text-[color-mix(in_oklab,var(--muted)_60%,transparent)]">b</span>
          <span className="text-[var(--fixture-translucent)] text-(--fixture-translucent) [color:rgba(0,0,0,.5)]">c</span>
          <span className="text-[rgba(var(--accent-rgb),0.6)] text-[light-dark(#57606a,rgb(139_148_158/.6))]">d</span>
          <input className="placeholder-white/50" placeholder="Search" />
        </p>
      );`,
      [
        'text-[#e6edf399]',
        'text-[#abc8]',
        'text-[rgb(230_237_243/0.6)]',
        'text-[hsl(0_0%_90%/60%)]',
        'text-[color-mix(in_oklab,var(--muted)_60%,transparent)]',
        'text-[var(--fixture-translucent)]',
        'text-(--fixture-translucent)',
        '[color:rgba(0,0,0,.5)]',
        'text-[rgba(var(--accent-rgb),0.6)]',
        'text-[light-dark(#57606a,rgb(139_148_158/.6))]',
        'placeholder-white/50',
      ],
    ],
    [
      'variants and the important marker',
      `export const Label = () => (
        <span className="dark:text-white/50 hover:text-[var(--muted)]/60 md:opacity-60 group-hover:opacity-50 !opacity-40 opacity-30!">
          x
        </span>
      );`,
      [
        'dark:text-white/50',
        'hover:text-[var(--muted)]/60',
        'md:opacity-60',
        'group-hover:opacity-50',
        '!opacity-40',
        'opacity-30!',
      ],
    ],
    [
      'an opacity below 100 in every spelling Tailwind v4 reads',
      `export const Label = () => (
        <span className="opacity-60 opacity-2.5 opacity-[.5] opacity-[50%] opacity-(--dim) [opacity:.5]">x</span>
      );`,
      [
        'opacity-60',
        'opacity-2.5',
        'opacity-[.5]',
        'opacity-[50%]',
        'opacity-(--dim)',
        '[opacity:.5]',
      ],
    ],
    [
      'a reveal that stops short of full opacity',
      `export const Label = () => (
        <span className="opacity-0 transition-opacity group-hover:opacity-50">x</span>
      );`,
      ['group-hover:opacity-50'],
    ],
    [
      "an opacity on an ancestor of the text, as DataStream's wrapper had until #111",
      `export function DataStream({ className = '' }: { className?: string }) {
        const lines = '0101';
        return (
          <div className={\`pointer-events-none absolute inset-0 opacity-10 \${className}\`}>
            <div className="animate-scroll-up font-mono">{lines}</div>
          </div>
        );
      }`,
      ['opacity-10'],
    ],
    [
      'an opacity over SVG text drawn from a list, as the featured work diagram has',
      `const NODES = [{ id: 'api', label: 'API' }];
      export function Diagram() {
        return (
          <div aria-hidden="true" className="absolute inset-0 opacity-40 dark:opacity-60">
            <svg viewBox="0 0 10 10">
              <g>
                {NODES.map((node) => (
                  <text key={node.id} y={8}>
                    {node.label}
                  </text>
                ))}
              </g>
            </svg>
          </div>
        );
      }`,
      ['opacity-40', 'dark:opacity-60'],
    ],
    [
      'SVG text painted with a translucent fill, or under an SVG opacity',
      `const LABEL_FILL = { ic: 'rgba(139, 92, 246, 0.35)' } as const;
      const QUIET = 0.6;
      export function Labels({ tier, dimmed }: { tier: 'ic'; dimmed: boolean }) {
        const fill = LABEL_FILL[tier];
        return (
          <svg viewBox="0 0 10 10">
            <text className="fill-[var(--muted)]/50">Queue</text>
            <g className="fill-white/40">
              <text>API</text>
            </g>
            <text fill={fill}>DB</text>
            <g opacity={dimmed ? 0.3 : 1}>
              <text>Cache</text>
            </g>
            <text fillOpacity={0.5}>Log</text>
            <text opacity={QUIET}>Queue</text>
          </svg>
        );
      }`,
      [
        'fill-[var(--muted)]/50',
        'fill-white/40',
        'fill={…}',
        'opacity={…}',
        'fillOpacity={…}',
        'opacity={…}',
      ],
    ],
    [
      'a style colour or opacity the scan can resolve',
      `const LOG_COLORS = { err: 'var(--log-err)', ok: 'var(--log-ok)' } as const;
      const DIM = { opacity: 0.5 };
      const base = { opacity: 0.6 };
      export function Log({ lines, dimmed, faint }: { lines: { level: 'err' | 'ok'; text: string }[]; dimmed: boolean; faint: boolean }) {
        return (
          <div>
            <span style={{ fontSize: '9px', color: 'rgba(139, 92, 246, 0.7)' }}>Scroll</span>
            {lines.map((line) => (
              <div key={line.text} style={{ color: LOG_COLORS[line.level] }}>
                {line.text}
              </div>
            ))}
            <p style={{ opacity: 0.6 }}>Muted</p>
            <p style={dimmed ? DIM : undefined}>Chosen</p>
            <p style={{ ...base, fontSize: 12 }}>Spread</p>
            <p style={{ opacity: faint && 0.4 }}>Maybe</p>
            <p style={{ animation: 'pulse 2s infinite' }}>Live</p>
            <span style={{ color: 'rgba(var(--violet-rgb), 0.7)' }}>Channels</span>
          </div>
        );
      }`,
      [
        'style.color',
        'style.color',
        'style.opacity',
        'style.opacity',
        'style.opacity',
        'style.opacity',
        'style.animation',
        'style.color',
      ],
    ],
    [
      'a pulse on text, as StatDisplay had when highlighted until #111',
      `export function Stat({ value, highlight }: { value: string; highlight?: boolean }) {
        return (
          <span
            className={\`font-mono \${
              highlight ? 'animate-pulse font-bold text-[var(--accent-text)]' : 'text-[var(--accent-text)]'
            }\`}
          >
            {value}
          </span>
        );
      }`,
      ['animate-pulse'],
    ],
    [
      "a ping, and animations written as a value, whatever the shorthand's order",
      `export const Badges = () => (
        <p>
          <span className="animate-ping">New</span>
          <span className="animate-[pulse_3s_ease-in-out_infinite]">a</span>
          <span className="animate-[3s_infinite_pulse]">b</span>
          <span className="[animation:pulse_2s_infinite]">c</span>
          <span className="animate-(--undeclared)">d</span>
        </p>
      );`,
      [
        'animate-ping',
        'animate-[pulse_3s_ease-in-out_infinite]',
        'animate-[3s_infinite_pulse]',
        '[animation:pulse_2s_infinite]',
        'animate-(--undeclared)',
      ],
    ],
    [
      'a class that reaches the element through a map, a helper, clsx or a destructured name',
      `import { cn } from '@/lib/utils';
      const tones = { dim: 'text-white/50', loud: 'text-white' };
      const PARTS = { label: 'opacity-40' };
      const { label: labelClass } = PARTS;
      function mutedIf(muted: boolean) {
        return muted ? 'opacity-60' : '';
      }
      export function Label({ tone, muted, label }: { tone: 'dim' | 'loud'; muted: boolean; label: string }) {
        return (
          <p>
            <span className={tones[tone]}>{label}</span>
            <span className={mutedIf(muted)}>{label}</span>
            <span className={cn('font-mono', { 'opacity-70': muted, ['opacity-20']: !muted })}>{label}</span>
            <span className={labelClass}>{label}</span>
            <span className={tw\`opacity-80 font-mono\`}>{label}</span>
          </p>
        );
      }`,
      ['text-white/50', 'opacity-60', 'opacity-70', 'opacity-20', 'opacity-40', 'opacity-80'],
    ],
    [
      'an element whose content the scan cannot see, and a text input',
      `export function Row({ children }: { children: React.ReactNode }) {
        return (
          <div>
            <div className="opacity-50">{children}</div>
            <div className="opacity-60">
              <Label />
            </div>
            <Badge className="opacity-70" />
            <input className="placeholder:text-white/40" placeholder="Search" />
            <my-badge className="opacity-30" />
          </div>
        );
      }`,
      ['opacity-50', 'opacity-60', 'opacity-70', 'placeholder:text-white/40', 'opacity-30'],
    ],
    [
      'children that arrive through a spread or a children prop',
      `import { cn } from '@/lib/utils';
      export function Caption({ className, ...props }: React.ComponentProps<'p'>) {
        return <p className={cn('text-sm text-[var(--muted)]/70', className)} {...props} />;
      }
      export const Note = ({ label }: { label: string }) => <span className="opacity-60" children={label} />;`,
      ['text-[var(--muted)]/70', 'opacity-60'],
    ],
    [
      'class props under other names, classes spread from an object, and a class in any prop',
      `const itemProps = { className: 'opacity-40' };
      export function Legend({ items }: { items: string[] }) {
        return (
          <div>
            <Panel title="Uptime" titleClass="text-[var(--muted)]/60" />
            <Tabs classNames={{ label: 'opacity-60' }} />
            <Tag tone="opacity-30" label="beta" />
            <ul>
              {items.map((item) => (
                <li key={item} {...itemProps}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      }`,
      ['text-[var(--muted)]/60', 'opacity-60', 'opacity-40', ['opacity-30', 'unattributed']],
    ],
    [
      'text without a JSX child: generated content and an option group',
      `export const Prompt = () => (
        <p>
          <span aria-hidden="true" className="text-[var(--muted)]/50 before:content-['$']" />
          <select>
            <optgroup label="Recent" className="opacity-60" />
          </select>
        </p>
      );`,
      ['text-[var(--muted)]/50', 'opacity-60'],
    ],
    [
      'a local component that renders text, and a count that renders 0',
      `function Label({ text }: { text: string }) {
        return <span>{text}</span>;
      }
      export const Row = ({ items }: { items: string[] }) => (
        <p>
          <span className="opacity-50">
            <Label text="Uptime" />
          </span>
          <span className="opacity-40">
            {items.length && (
              <svg>
                <path d="M0 0" />
              </svg>
            )}
          </span>
        </p>
      );`,
      ['opacity-50', 'opacity-40'],
    ],
    [
      'a conditional override, a conditional or undone screen-reader class, an inherited colour',
      `import { cn } from '@/lib/utils';
      type Link = { href: string; label: string; active: boolean };
      export function Nav({ links, collapsed, label }: { links: Link[]; collapsed: boolean; label: string }) {
        return (
          <div>
            <nav className="text-[var(--muted)]/70">
              {links.map((l) => (
                <a key={l.href} href={l.href} className={cn(l.active && 'text-[var(--foreground)]')}>
                  {l.label}
                </a>
              ))}
            </nav>
            <span className={cn('text-[var(--muted)]/60', collapsed && 'sr-only')}>{label}</span>
            <span className="sr-only text-[var(--muted)]/50 sm:not-sr-only">Menu</span>
            <p className="text-[var(--muted)]/40">
              <a href="/blog" className="text-current">
                Blog
              </a>
            </p>
            <p className="text-[var(--muted)]/30">
              <a href="/docs" className="hover:text-white">
                Docs
              </a>
            </p>
          </div>
        );
      }`,
      [
        'text-[var(--muted)]/70',
        'text-[var(--muted)]/60',
        'text-[var(--muted)]/50',
        'text-[var(--muted)]/40',
        'text-[var(--muted)]/30',
      ],
    ],
    [
      'variants aimed at children and descendants, which dim what they select',
      `export const Lists = () => (
        <div>
          <ul className="*:opacity-60">
            <li>Next.js</li>
          </ul>
          <p className="[&_code]:text-[var(--muted)]/60">
            Run <code>pnpm test</code> first
          </p>
          <ul className="**:text-white/50">
            <li>
              <span>x</span>
            </li>
          </ul>
          <ul className="[&>li]:opacity-40">
            <li>One</li>
          </ul>
          <h2 className="[&+p]:opacity-50">Title</h2>
        </div>
      );`,
      [
        '*:opacity-60',
        '[&_code]:text-[var(--muted)]/60',
        '**:text-white/50',
        '[&>li]:opacity-40',
        '[&+p]:opacity-50',
      ],
    ],
    [
      'a dimming aimed at generated content',
      `export const Prompt = () => (
        <span aria-hidden="true" className="before:content-['$'] before:text-[var(--muted)]/50" />
      );`,
      ['before:text-[var(--muted)]/50'],
    ],
    [
      'a colour or an opacity handed to a component',
      `function Tag({ color, children }: { color: string; children: React.ReactNode }) {
        return <span style={{ color }}>{children}</span>;
      }
      export const Tags = () => (
        <p>
          <Tag color="rgba(99,102,241,0.7)">Next.js</Tag>
          <Diagram labelOpacity={0.4} />
        </p>
      );`,
      [
        ['color={…}', 'unattributed'],
        ['labelOpacity={…}', 'unattributed'],
      ],
    ],
    [
      'classes spread through a condition or from a helper, and one handed to a helper that renders it',
      `const rowProps = () => ({ className: 'opacity-40' });
      const stat = (label: string, cls: string) => <span className={cls}>{label}</span>;
      export function Rows({ muted, label, items }: { muted: boolean; label: string; items: string[] }) {
        return (
          <div>
            <span {...(muted ? { className: 'opacity-50' } : {})}>{label}</span>
            <ul>
              {items.map((item) => (
                <li key={item} {...rowProps()}>
                  {item}
                </li>
              ))}
            </ul>
            <p>{stat('Uptime', 'text-[var(--muted)]/60')}</p>
          </div>
        );
      }`,
      ['opacity-50', 'opacity-40', ['text-[var(--muted)]/60', 'unattributed']],
    ],
    [
      'one entry of a nested map',
      `const TONE = { label: { dim: 'opacity-60', full: 'font-mono' } };
      export const Row = ({ text }: { text: string }) => (
        <p>
          <span className={TONE.label.dim}>{text}</span>
          <span className={TONE.label.full}>{text}</span>
        </p>
      );`,
      ['opacity-60'],
    ],
    [
      'a name whose default or first value is empty, which holds text later',
      `export function Caption({ text = '' }: { text?: string }) {
        return <p className="opacity-60">{text}</p>;
      }
      export function Loading({ loading }: { loading: boolean }) {
        let label = '';
        if (loading) label = 'Loading…';
        return <span className="opacity-50">{label}</span>;
      }`,
      ['opacity-60', 'opacity-50'],
    ],
    [
      'a fill that reaches SVG text through an HTML element or a local component',
      `const LABEL = 'CPU';
      function Diagram({ className }: { className?: string }) {
        return (
          <svg className={className}>
            <text y="15">API</text>
          </svg>
        );
      }
      export const Legends = () => (
        <p>
          <svg>
            <g className="fill-white/30">
              <a href="#cpu">{LABEL}</a>
              <text>{LABEL}</text>
            </g>
          </svg>
          <span className="fill-white/40">
            <svg>
              <text>Queue</text>
            </svg>
          </span>
          <Diagram className="fill-[var(--muted)]/50" />
        </p>
      );`,
      ['fill-white/30', 'fill-white/40', 'fill-[var(--muted)]/50'],
    ],
    [
      'a file input, and a class list written with an escape',
      `export const Upload = () => (
        <p>
          <input type="file" className="opacity-50" />
          <span className={'font-mono\\nopacity-40'}>x</span>
        </p>
      );`,
      ['opacity-50', 'opacity-40'],
    ],
    [
      'a data-disabled state, which assistive technology and axe do not treat as inactive',
      `export const Item = () => (
        <span role="menuitem" data-disabled="" className="data-[disabled]:opacity-50 data-disabled:opacity-40">
          Delete
        </span>
      );`,
      ['data-[disabled]:opacity-50', 'data-disabled:opacity-40'],
    ],
    [
      "a let's later value, a parameter's default and a spread's condition do not exempt",
      `function Item({ label, tone = 'text-[var(--foreground)]' }: { label: string; tone?: string }) {
        return <li className={tone}>{label}</li>;
      }
      export function Menu({ open, collapsed, dim }: { open: boolean; collapsed: boolean; dim: boolean }) {
        let labelClass = 'sr-only';
        if (open) labelClass = '';
        let o = 1;
        if (dim) o = 0.5;
        return (
          <div>
            <span className={\`opacity-60 \${labelClass}\`}>Menu</span>
            <ul className="text-[var(--muted)]/60">
              <Item label="A" tone="" />
            </ul>
            <svg>
              <g opacity={o}>
                <text>x</text>
              </g>
            </svg>
            <span className="opacity-40" {...(collapsed && { className: 'opacity-40 sr-only' })}>
              Label
            </span>
          </div>
        );
      }`,
      ['opacity-60', 'text-[var(--muted)]/60', 'opacity={…}', 'opacity-40', 'opacity-40'],
    ],
    [
      'colours that inherit, however they are spelt, and SVG text a currentColor fill paints',
      `export const Inherit = ({ active }: { active: boolean }) => (
        <div>
          <p className="text-white/40">
            <span style={active ? { color: 'white' } : undefined}>Tab</span>
          </p>
          <p className="text-white/60">
            <span className="text-[inherit]">x</span>
            <span className="text-[currentColor]">y</span>
          </p>
          <svg className="text-white/50" fill="currentColor">
            <text>42%</text>
          </svg>
          <svg>
            <a href="#x" opacity={0.5}>
              <text>Link</text>
            </a>
          </svg>
        </div>
      );`,
      ['text-white/40', 'text-white/60', 'text-white/50', 'opacity={…}'],
    ],
  ])('%s', (_name, source, expected) => {
    expect(flagged(scan(source))).toEqual(report(expected));
  });

  it('a dimming class in a string it cannot trace to an element, and not in a type or prose', () => {
    const source = `type Dim = 'opacity-40' | 'opacity-100';
      export const dimmedLabel = 'font-mono text-white/50';
      export const NOTE = 'Fades from opacity-0 to opacity-100.';`;
    expect(flagged(scan(source, 'src/components/styles.ts'))).toEqual([
      ['text-white/50', 'unattributed'],
    ]);
  });
});

describe('what the scan leaves alone', () => {
  it.each<[string, string, string[]]>([
    [
      'a decorative SVG frame that keeps a dimmed currentColor, as the section progress corners do',
      `export const Corner = () => (
        <svg width="40" height="40" viewBox="0 0 40 40" className="text-[var(--accent)]/30">
          <path d="M0 20 L0 0 L20 0" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      );`,
      ['text-[var(--accent)]/30'],
    ],
    [
      "an aria-hidden bracket whose opacity a condition picks, as FeaturedWork's corners do",
      `export function CornerBrackets({ active }: { active: boolean }) {
        return (
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className={\`absolute h-3 w-3 \${
              active ? 'text-[var(--accent)] opacity-100' : 'text-[var(--tmux-border)] opacity-50'
            }\`}
          >
            <path d="M0 6 L0 0 L6 0" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        );
      }`,
      ['opacity-100', 'opacity-50'],
    ],
    [
      "shapes inside an SVG beside text that is not dimmed, as HexBadge's polygons are",
      `export function HexBadge({ children }: { children: React.ReactNode }) {
        return (
          <div className="relative inline-flex">
            <svg viewBox="0 0 100 100" className="h-16 w-16 text-[var(--accent)]">
              <polygon points="50 3, 93 25" fill="none" stroke="currentColor" className="opacity-50" />
              <polygon points="50 10, 85 28" fill="currentColor" className="opacity-10" />
            </svg>
            <span className="absolute text-lg">{children}</span>
          </div>
        );
      }`,
      ['opacity-50', 'opacity-10', 'absolute', 'text-lg'],
    ],
    [
      'shapes drawn by a list, a local component, a named callback, Array.from, a Fragment or a constant',
      `import { Fragment } from 'react';
      const PATHS = ['M0 0 L1 1', 'M1 1 L2 2'];
      const icon = (
        <svg>
          <path d="M0 0" />
        </svg>
      );
      function Edge({ d }: { d: string }) {
        return <path d={d} stroke="currentColor" />;
      }
      const renderDot = (i: number) => <circle key={i} r={2} />;
      export const Graph = ({ edge }: { edge: React.SVGProps<SVGPathElement> }) => (
        <p>
          <svg className="text-[var(--accent)]/40 opacity-60" viewBox="0 0 2 2">
            <path {...edge} />
            {PATHS.map((d) => (
              <path key={d} d={d} stroke="currentColor" />
            ))}
            {PATHS.map((d) => (
              <Edge key={d} d={d} />
            ))}
            {[1, 2].map(renderDot)}
            {Array.from({ length: 3 }, (_, i) => (
              <line key={i} />
            ))}
            {PATHS.map((d) => (
              <Fragment key={d}>
                <path d={d} />
              </Fragment>
            ))}
          </svg>
          <span className="opacity-30">{icon}</span>
        </p>
      );`,
      ['text-[var(--accent)]/40', 'opacity-60', 'opacity-30'],
    ],
    [
      'hidden and full opacity, which do not dim',
      `export const Reveal = ({ shown }: { shown: boolean }) => (
        <span
          className={\`transition-opacity \${shown ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 opacity-[1] opacity-[1e0] [opacity:0] text-white/100 text-white/0\`}
        >
          x
        </span>
      );`,
      [
        'opacity-100',
        'opacity-0',
        'group-hover:opacity-100',
        'opacity-[1]',
        'opacity-[1e0]',
        '[opacity:0]',
        'text-white/100',
        'text-white/0',
      ],
    ],
    [
      'tints, borders, decoration and shadows with an alpha, none of which is the text colour',
      `export const Pill = () => (
        <span className="border border-[var(--status-ok)]/50 border-[rgba(99,102,241,0.2)] bg-[var(--accent)]/10 decoration-[var(--status-ok)]/50 hover:bg-[var(--accent)]/5 shadow-black/20 shadow-[0_0_30px_rgba(139,92,246,0.1)] text-shadow-lg/50">
          ok
        </span>
      );`,
      [
        'border-[var(--status-ok)]/50',
        'border-[rgba(99,102,241,0.2)]',
        'bg-[var(--accent)]/10',
        'decoration-[var(--status-ok)]/50',
        'hover:bg-[var(--accent)]/5',
        'shadow-black/20',
        'shadow-[0_0_30px_rgba(139,92,246,0.1)]',
        'text-shadow-lg/50',
      ],
    ],
    [
      'solid colours in any notation',
      `export const Tag = () => (
        <span className="text-[#6b7280] hover:text-[#a78bfa] text-[rgb(99_102_241)] text-[rgba(99,102,241,1)] text-[#abcf] text-[var(--accent-text)] text-[var(--status-ok)]">
          tag
        </span>
      );`,
      [
        'text-[#6b7280]',
        'text-[rgb(99_102_241)]',
        'text-[rgba(99,102,241,1)]',
        'text-[#abcf]',
        'text-[var(--accent-text)]',
      ],
    ],
    [
      'a font size with a line height, which is also written after a slash',
      `export const Title = () => (
        <h2 className="text-sm/6 text-2xl/[1.1] text-[10px]/4 text-[length:var(--size)]/7 text-(length:--size)/7 text-[clamp(1rem,2vw,2rem)]/8">
          Title
        </h2>
      );`,
      [
        'text-sm/6',
        'text-2xl/[1.1]',
        'text-[10px]/4',
        'text-[length:var(--size)]/7',
        'text-(length:--size)/7',
        'text-[clamp(1rem,2vw,2rem)]/8',
      ],
    ],
    [
      'a colour or a fill that stops where a descendant paints its own',
      `export const Gauge = () => (
        <p className="text-white/60">
          <span className="text-[var(--foreground)]">Bold</span>
          <svg className="text-[var(--accent)]/30" viewBox="0 0 10 10">
            <path d="M0 0" stroke="currentColor" />
            <text fill="var(--foreground)">42%</text>
          </svg>
          <svg className="fill-white/40">
            <text className="fill-[var(--foreground)]">Solid</text>
          </svg>
        </p>
      );`,
      ['text-white/60', 'text-[var(--accent)]/30', 'fill-white/40'],
    ],
    [
      'a fill on shapes, and on an HTML element whose text does not take it',
      `export const Icons = () => (
        <p>
          <svg>
            <rect className="fill-[var(--accent)]/10" />
          </svg>
          <button className="fill-white/50">
            Send
            <svg>
              <path d="M0 0" />
            </svg>
          </button>
        </p>
      );`,
      ['fill-[var(--accent)]/10', 'fill-white/50'],
    ],
    [
      'classes aimed at a pseudo-element or a descendant, and a disabled control',
      `export const Link = ({ pending }: { pending: boolean }) => (
        <p>
          <a className="inline-flex [&_svg]:opacity-60 after:opacity-50 *:opacity-40" href="/work">
            Case study
            <svg>
              <path d="M0 0" />
            </svg>
          </a>
          <button disabled={pending} className="disabled:opacity-50 aria-disabled:text-white/50">
            Send
          </button>
          <span className="[&_svg]:opacity-70">
            <span>Label</span>
            <svg>
              <path d="M0 0" />
            </svg>
          </span>
        </p>
      );`,
      [
        '[&_svg]:opacity-60',
        'after:opacity-50',
        '*:opacity-40',
        'disabled:opacity-50',
        'aria-disabled:text-white/50',
        '[&_svg]:opacity-70',
      ],
    ],
    [
      'text that is never painted: an SVG title, screen-reader text, a hidden element, a checkbox',
      `export const Quiet = () => (
        <p>
          <svg className="text-[var(--accent)]/30" role="img">
            <title>Section 2 of 5</title>
            <path d="M0 0" />
          </svg>
          <span className="opacity-50">
            <span className="sr-only">Loading</span>
            <span hidden>later</span>
          </span>
          <input type="checkbox" className="opacity-60" />
        </p>
      );`,
      ['text-[var(--accent)]/30', 'opacity-50', 'opacity-60'],
    ],
    [
      'one entry of a map of classes, and a destructured one',
      `const PARTS = { icon: 'opacity-60', label: 'font-mono text-sm' };
      const { icon, label: labelClass } = PARTS;
      export const Row = ({ label }: { label: string }) => (
        <span className="flex gap-2">
          <svg className={PARTS.icon} viewBox="0 0 4 4">
            <circle cx="2" cy="2" r="2" />
          </svg>
          <span className={PARTS.label}>{label}</span>
          <svg className={icon} viewBox="0 0 4 4">
            <circle cx="2" cy="2" r="2" />
          </svg>
          <span className={labelClass}>{label}</span>
        </span>
      );`,
      ['opacity-60', 'font-mono', 'text-sm'],
    ],
    [
      'animations that do not hold text part-transparent, and a pulse on a dot',
      `export const Status = () => (
        <p className="animate-bounce">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          <span className="animate-spin animate-[spin_1s_linear_infinite]">↻</span>
          <span className="animate-blink ml-0.5 inline-block h-5 w-2 bg-[var(--accent)]" />
          <span className="animate-fade-in">Live</span>
        </p>
      );`,
      [
        'animate-bounce',
        'animate-pulse',
        'animate-spin',
        'animate-[spin_1s_linear_infinite]',
        'animate-blink',
        'animate-fade-in',
      ],
    ],
    [
      'whitespace, comments, null, a non-breaking space and a condition that renders a shape',
      `export const Spacer = ({ show }: { show: boolean }) => (
        <span className="opacity-50">
          {' '}
          &nbsp;
          {/* a comment */}
          {show && (
            <svg>
              <path d="M0 0" />
            </svg>
          )}
          {null}
        </span>
      );`,
      ['opacity-50'],
    ],
    [
      'style values it cannot resolve, and binary ones',
      `export const Pane = ({ progress, shown }: { progress: number; shown: boolean }) => (
        <p className="font-mono" style={{ opacity: progress }}>
          <span style={{ opacity: shown ? 1 : 0, color: 'var(--accent-text)' }}>ok</span>
        </p>
      );`,
      ['font-mono'],
    ],
    [
      'class-like words in attributes and in rendered text, which are not classes',
      `export const Go = () => (
        <a className="font-mono" href="/opacity-50" aria-label="text-white/50 as prose" data-state="opacity-40">
          Go <code>{'text-white/50'}</code>
        </a>
      );`,
      ['font-mono'],
    ],
    [
      'a spread onto an element with children of its own, and a symbol reference',
      `export function Corner(props: React.SVGProps<SVGSVGElement>) {
        return (
          <svg viewBox="0 0 40 40" className="text-[var(--accent)]/30" {...props}>
            <path d="M0 20 L0 0 L20 0" fill="none" stroke="currentColor" />
          </svg>
        );
      }
      export const Items = () => (
        <p>
          <svg className="opacity-50">
            <use href="/icons.svg#corner" />
          </svg>
        </p>
      );`,
      ['text-[var(--accent)]/30', 'opacity-50'],
    ],
    [
      'an SVG attribute on an HTML element, a placeholder colour off an input, a full-weight mix',
      `export const Odd = () => (
        <p>
          <span opacity="0.5">Text</span>
          <span className="placeholder-white/50 font-mono">Text</span>
          <span className="text-[color-mix(in_oklab,var(--muted)_100%,transparent)]">Text</span>
        </p>
      );`,
      ['placeholder-white/50', 'text-[color-mix(in_oklab,var(--muted)_100%,transparent)]'],
    ],
    [
      'SVG text that takes no colour, a descendant chain, paints that are not for text, a template',
      `export const Quiet = ({ count }: { count: number }) => (
        <div className="font-mono">
          <svg className="text-[var(--accent)]/30">
            <path stroke="currentColor" d="M0 0" />
            <text>42%</text>
          </svg>
          <div className="[&_p_span]:opacity-50">
            <p>
              Body
              <span>
                <svg>
                  <path d="M0 0" />
                </svg>
              </span>
            </p>
          </div>
          <Panel borderColor="rgba(99,102,241,0.2)" glowOpacity={0.3} title="Uptime" />
          <p>{\`\${count} at opacity-50\`}</p>
        </div>
      );`,
      ['font-mono', 'text-[var(--accent)]/30', '[&_p_span]:opacity-50'],
    ],
  ])('%s', (_name, source, seen) => {
    const result = scan(source);
    expect(result.tokens).toEqual(expect.arrayContaining(seen));
    expect(flagged(result)).toEqual([]);
  });
});

describe('how an animation is judged', () => {
  const judge = (css: string, utility: string) =>
    (animationUtilitiesIn(css).get(utility) ?? []).some((shorthand) =>
      animationDims(shorthand, keyframesIn(css)),
    );

  it.each<[string, string, string, boolean]>([
    [
      'a loop through a partial opacity',
      '@keyframes breathe { 0%, 100% { opacity: 1 } 50% { opacity: .4 } } .animate-breathe { animation: breathe 2s ease-in-out infinite; }',
      'breathe',
      true,
    ],
    [
      'a loop between 1 and 0 that interpolates, declared with @utility and the name last',
      '@keyframes fade { from { opacity: 1 } to { opacity: 0 } } @utility animate-fade { animation: 1s ease infinite fade; }',
      'fade',
      true,
    ],
    [
      'a loop between 1 and 0 that steps',
      '@keyframes blink { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } } .animate-blink { animation: blink 1s steps(1) infinite; }',
      'blink',
      false,
    ],
    [
      'a reveal from 0 held at 1, for either of two grouped classes',
      '@keyframes rise { from { opacity: 0 } to { opacity: 1 } } .animate-rise, .animate-lift { animation: rise .3s ease-out forwards; }',
      'lift',
      false,
    ],
    [
      'a reveal that stops at .8',
      '@keyframes rise { from { opacity: 0 } to { opacity: .8 } } .animate-rise { animation: rise .3s forwards; }',
      'rise',
      true,
    ],
    [
      'the second of two animations',
      '@keyframes rise { from { opacity: 0 } } @keyframes pulse { 50% { opacity: .5 } } .animate-both { animation: rise .3s, pulse 2s infinite; }',
      'both',
      true,
    ],
    [
      'longhands instead of the shorthand',
      '@keyframes fade { to { opacity: 0 } } .animate-fade { animation-name: fade; animation-iteration-count: infinite; }',
      'fade',
      true,
    ],
    [
      'a fade in four steps, which holds partial values between them',
      '@keyframes fade { from { opacity: 1 } to { opacity: 0 } } .animate-fade { animation: fade 1s steps(4) infinite; }',
      'fade',
      true,
    ],
    [
      'a keyframe colour with an alpha',
      '@keyframes tint { 50% { color: rgb(0 0 0 / 40%) } } .animate-tint { animation: tint 2s infinite; }',
      'tint',
      true,
    ],
    [
      'a keyframe filter opacity',
      '@keyframes haze { 50% { filter: opacity(0.4) } } .animate-haze { animation: haze 2s infinite; }',
      'haze',
      true,
    ],
    [
      'a dimming animation that a later reduced-motion rule switches off',
      '@keyframes soft { 0%, 100% { opacity: 1 } 50% { opacity: .4 } } .animate-soft { animation: soft 2s infinite; } @media (prefers-reduced-motion: reduce) { .animate-soft { animation: none; } }',
      'soft',
      true,
    ],
    [
      'an animation declared after a nested block',
      '@keyframes soft { 50% { opacity: .4 } } .animate-soft { @media (hover: hover) { color: red; } animation: soft 2s infinite; }',
      'soft',
      true,
    ],
    [
      'an animation that never touches opacity',
      '@keyframes spin { to { transform: rotate(360deg) } } .animate-spin { animation: spin 1s linear infinite; }',
      'spin',
      false,
    ],
  ])('%s', (_name, css, utility, dims) => {
    expect(judge(css, utility)).toBe(dims);
  });

  // A new dimming animation fails this: check where it is used, then add it here.
  it("finds that only pulse and ping dim, among Tailwind's animations and globals.css's", () => {
    const names = [...vocabulary.animations.keys()];
    expect(names).toEqual(
      expect.arrayContaining(['spin', 'bounce', 'fade-in', 'blink', 'scale-in']),
    );
    const dimming = names.filter((name) =>
      (vocabulary.animations.get(name) ?? []).some((shorthand) =>
        animationDims(shorthand, vocabulary.keyframes),
      ),
    );
    expect(dimming.toSorted()).toEqual(['ping', 'pulse']);
  });
});

describe('what the scan cannot pass by not seeing', () => {
  it('refuses a module it cannot parse', () => {
    expect(() => scan('export const A = () => <div className="opacity-50">x</span>;')).toThrow(
      /did not parse/,
    );
  });

  it("reads the colours of Tailwind's theme and of globals.css", () => {
    expect([...vocabulary.colours]).toEqual(
      expect.arrayContaining(['white', 'green-800', 'muted', 'accent-text', 'status-ok']),
    );
  });

  it('reads the values globals.css gives its custom properties, in every theme', () => {
    expect(vocabulary.properties.get('--muted')?.length).toBeGreaterThanOrEqual(2);
    expect(vocabulary.properties.get('--accent-text')?.length).toBeGreaterThanOrEqual(2);
  });
});

// --- The components ------------------------------------------------------------------------------

const RULE =
  'Text is not dimmed with an opacity modifier, decorative and aria-hidden text included (ADR 0008, ' +
  'carried over by ADR 0011). Paint secondary text with --muted at full opacity, or move the ' +
  'dimming onto an element with no text under it, such as the decorative SVG itself.';

interface KnownDefect {
  id: string;
  file: string;
  component: string;
  tokens: string[];
  /** How many dimmings of those tokens the component has: a new one, or one fewer, needs a look. */
  sites: number;
  /** The change that removes it, or `unassigned`. */
  fixedBy: string;
  why: string;
}

/**
 * The violations present when this guard landed. Each is an expected failure until the change that
 * fixes it deletes the entry, which it has to: an expected failure that passes fails the run. Adding
 * an entry ships a known defect on purpose, so it names what fixes it. #47 is the hero task of the
 * audit remediation epic (.claude/epics/audit-remediation-2026-09/47.md): R12, R13 and R17 are its
 * expected-failure rows in e2e/hero-contrast.spec.ts, and hero-2 and critic-8 its findings.
 */
const KNOWN_DEFECTS: KnownDefect[] = [
  {
    id: 'DIM1',
    file: 'src/components/animated-hero/animated-text.tsx',
    component: 'GlitchText',
    tokens: ['opacity-70'],
    sites: 2,
    fixedBy: 'R17, #47',
    why: 'the two aria-hidden copies of its text drawn while it glitches on hover (critic-8)',
  },
  {
    id: 'DIM2',
    file: 'src/components/featured-work/architecture-background.tsx',
    component: 'ArchitectureBackground',
    tokens: ['opacity-40', 'dark:opacity-60', 'opacity={…}'],
    sites: 3,
    fixedBy: 'unassigned',
    why: 'the SVG <text> node labels of the diagram behind the featured work sit at 40% (60% dark), and at 0.3 of that under a hovered card',
  },
  {
    id: 'DIM3',
    file: 'src/components/animated-hero/hero-content.tsx',
    component: 'SkillTags',
    tokens: ['text-[rgba(99,102,241,0.7)]', 'dark:text-[rgba(167,139,250,0.6)]'],
    sites: 2,
    fixedBy: 'R12, R13, #47',
    why: 'the hero skill tags paint an accent at 0.7 alpha, 0.6 in the dark theme (hero-2)',
  },
  {
    id: 'DIM4',
    file: 'src/components/animated-hero/hero-section.tsx',
    component: 'HeroSection',
    tokens: ['style.color'],
    sites: 1,
    fixedBy: 'R13, #47',
    why: 'the Scroll label under the hero, painted inline at 0.7 alpha (hero-2)',
  },
  {
    id: 'DIM5',
    file: 'src/components/animated-hero/tmux-background.tsx',
    component: 'StaticPane',
    tokens: ['style.color'],
    sites: 1,
    fixedBy: 'unassigned',
    why: 'the log lines of the tmux background take the --log-* colours, 0.35 to 0.55 alpha; the animated panes set the same colours from script, which the scan cannot see',
  },
  {
    id: 'DIM6',
    file: 'src/components/animated-hero/circuit-background.tsx',
    component: 'CircuitBackground',
    tokens: ['fill={…}'],
    sites: 1,
    fixedBy: '#47',
    why: 'SVG <text> labels filled at 0.7, 0.5 and 0.35 alpha; #47 deletes the component',
  },
];

/**
 * Dimmed classes the text rule allows because nothing under them renders text: the three sites this
 * guard was written to leave alone. Pinned with their counts to show the scan reaching and judging
 * them rather than missing them. A <text> added under one turns it into a finding, and the change
 * that deletes one of these components (#47 deletes HexBadge) deletes its row.
 */
const DECORATIVE = [
  {
    file: 'src/components/animated-hero/section-progress.tsx',
    component: 'SectionProgress',
    element: 'svg',
    token: 'text-[var(--accent)]/30',
    count: 4,
  },
  {
    file: 'src/components/featured-work.tsx',
    component: 'CornerBrackets',
    element: 'svg',
    token: 'opacity-50',
    count: 1,
  },
  {
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'HexBadge',
    element: 'polygon',
    token: 'opacity-50',
    count: 1,
  },
  {
    file: 'src/components/animated-hero/hud-elements.tsx',
    component: 'HexBadge',
    element: 'polygon',
    token: 'opacity-10',
    count: 1,
  },
];

/**
 * Floors on what the scan reads, well under today's counts so that deleting a component does not
 * trip them, and far over what a walk that lost a directory or a visitor that stopped firing would
 * read. The pinned sites above catch a narrower loss.
 */
const MODULE_FLOOR = 20;
const TOKEN_FLOOR = 1500;

/**
 * Every module under src/components, outside test folders and co-located tests, relative to
 * apps/web. A symlinked directory is followed once; a dangling link is skipped.
 */
function componentModules(): string[] {
  const found: string[] = [];
  const visited = new Set<string>();
  const descend = (relative: string): void => {
    const real = realpathSync(path.join(appDir, relative));
    if (visited.has(real)) return;
    visited.add(real);
    for (const entry of readdirSync(path.join(appDir, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      let directory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          directory = statSync(path.join(appDir, child)).isDirectory();
        } catch {
          continue;
        }
      }
      if (directory) {
        if (entry.name !== '__tests__') descend(child);
      } else if (
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(test|spec|stories)\.[cm]?[jt]sx?$|\.d\.[cm]?ts$/.test(entry.name)
      ) {
        found.push(child);
      }
    }
  };
  descend(COMPONENTS_DIR);
  return found.sort();
}

let components: { modules: string[]; tokens: number; sites: Site[] } | undefined;

function scanComponents() {
  if (!components) {
    const modules = componentModules();
    const scans = modules.map((module) =>
      scanSource(readFileSync(path.join(appDir, module), 'utf8'), module),
    );
    components = {
      modules,
      tokens: scans.reduce((sum, result) => sum + result.tokens.length, 0),
      sites: scans.flatMap((result) => result.sites),
    };
  }
  return components;
}

const findings = () => scanComponents().sites.filter((site) => site.verdict !== 'no-text');

const covers = (known: KnownDefect, site: Site) =>
  site.file === known.file &&
  site.component === known.component &&
  known.tokens.includes(site.token);

function describeSite(site: Site): string {
  const where = `apps/web/${site.file}:${site.line} ${site.component}`;
  if (site.verdict !== 'unattributed') {
    return `${where} <${site.element}> ${site.token}, over ${site.evidence}`;
  }
  return `${where} ${site.token}, ${site.evidence || 'in a class string the scan cannot trace to an element'}`;
}

describe('the components', () => {
  // Parsing every module twice over, once to prove it parses and once to walk it, is the one costly
  // step: 0.7 s cold and 0.3 s warm on its own, at a load average near 12, and several times that
  // inside a full `pnpm test` on a loaded machine. So it runs once, here, under a timeout that says
  // what it is for, and no case pays for it against the 5 s default; eslint-config.test.ts does the
  // same for loading ESLint.
  beforeAll(() => {
    scanComponents();
  }, 60_000);

  it('reads every component module and the classes in them', () => {
    const { modules, tokens } = scanComponents();
    expect(modules.length).toBeGreaterThanOrEqual(MODULE_FLOOR);
    expect(tokens).toBeGreaterThanOrEqual(TOKEN_FLOOR);
  });

  it('dims no text, apart from the known defects', () => {
    const sites = findings();
    const unknown = sites
      .filter((site) => !KNOWN_DEFECTS.some((known) => covers(known, site)))
      .map(describeSite);
    const recounted = KNOWN_DEFECTS.flatMap((known) => {
      const count = sites.filter((site) => covers(known, site)).length;
      return count === 0 || count === known.sites
        ? []
        : [
            `${known.id} ${known.component}: ${count} dimmings where the entry records ${known.sites}`,
          ];
    });
    expect([...unknown, ...recounted], RULE).toEqual([]);
  });

  it.each(DECORATIVE)('finds no text under $component <$element> $token', (decorative) => {
    const verdicts = scanComponents()
      .sites.filter(
        (site) =>
          site.file === decorative.file &&
          site.component === decorative.component &&
          site.element === decorative.element &&
          site.token === decorative.token,
      )
      .map((site) => site.verdict);
    expect(verdicts).toEqual(Array.from({ length: decorative.count }, () => 'no-text'));
  });

  // A known defect's test fails with "Expect test to fail" once none of its tokens dims text in its
  // component. Check that the text is legible before deleting the entry: the scan cannot see colours
  // set from script or GSAP, so a dimming moved there reads as a fix.
  for (const known of KNOWN_DEFECTS) {
    it.fails(`${known.id} (${known.fixedBy}): ${known.component} stops dimming text`, () => {
      expect(
        findings()
          .filter((site) => covers(known, site))
          .map(describeSite),
      ).toEqual([]);
    });
  }
});
