import { cleanup, render, screen } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HudPanel, PipelineStage } from '../hud-elements';
import { cssTransitions } from './gsap-css-conflicts';
import { stageFill, stageTrack } from './pipeline-fill';

// GSAP's ScrollTrigger calls window.matchMedia while it registers, and gsap-css-conflicts imports
// gsap-runtime, which registers it at import time, so the stub must exist before the imports above
// are evaluated.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

/** Every status `PipelineStage` accepts, checked against its props so a new one cannot go untested. */
const PIPELINE_STATUSES = [
  'pending',
  'running',
  'passed',
  'failed',
] as const satisfies readonly ComponentProps<typeof PipelineStage>['status'][];
const everyStatusListed: [
  Exclude<ComponentProps<typeof PipelineStage>['status'], (typeof PIPELINE_STATUSES)[number]>,
] extends [never]
  ? true
  : never = true;

describe('PipelineStage', () => {
  afterEach(() => cleanup());

  // hero-12, ADR 0009 rule 2. The fill is drawn by scaling a full-width bar from its left edge, so a
  // frame of GauntletPhase's progress tween, which writes this transform through the fill ref,
  // costs no layout. React draws the same transform from `progress`, and never a width.
  it.each([
    { progress: 0, transform: 'scaleX(0)' },
    { progress: 40, transform: 'scaleX(0.4)' },
    { progress: 100, transform: 'scaleX(1)' },
  ])(
    'draws a $progress% fill as $transform from its left edge and hands the fill to fillRef',
    ({ progress, transform }) => {
      const fillRef = createRef<HTMLDivElement>();
      render(
        <PipelineStage name="UNIT TESTS" status="running" progress={progress} fillRef={fillRef} />,
      );
      const fill = stageFill('UNIT TESTS');
      expect(fill.style.transform).toBe(transform);
      expect(fill.style.width).toBe('');
      expect(fill).toHaveClass('origin-left');
      expect(fillRef.current).toBe(fill);
    },
  );

  // A negative progress would mirror the fill out of its track and show it empty, one past 100
  // would overrun it, and NaN would make an invalid transform the browser drops, showing it full.
  it.each([
    { progress: -10, transform: 'scaleX(0)' },
    { progress: 150, transform: 'scaleX(1)' },
    { progress: Number.NaN, transform: 'scaleX(0)' },
    { progress: Number.POSITIVE_INFINITY, transform: 'scaleX(0)' },
  ])('clamps a progress of $progress to $transform', ({ progress, transform }) => {
    render(<PipelineStage name="UNIT TESTS" status="running" progress={progress} />);
    expect(stageFill('UNIT TESTS').style.transform).toBe(transform);
  });

  // A scale squashes a border radius with it, so a rounded fill would end in a sliver of a curve
  // at low progress. The fill has no radius of its own; the track's rounded clip shapes its ends.
  it('leaves the fill square and lets the rounded track clip it', () => {
    render(<PipelineStage name="UNIT TESTS" status="running" progress={5} />);
    expect(stageFill('UNIT TESTS').className).not.toMatch(/\brounded(-|\b)/);
    expect(stageTrack('UNIT TESTS')).toHaveClass('overflow-hidden', 'rounded-full');
  });

  // A transformed element is the containing block of its absolutely positioned descendants, so
  // inside the fill the shimmer would shrink with the scale. It sweeps the track as the fill's
  // sibling, and only while the stage runs.
  it.each(PIPELINE_STATUSES)('keeps the shimmer out of the fill while %s', (status) => {
    const fillRef = createRef<HTMLDivElement>();
    render(<PipelineStage name="UNIT TESTS" status={status} progress={40} fillRef={fillRef} />);
    const shimmer = stageTrack('UNIT TESTS').querySelector('.animate-shimmer');
    if (status !== 'running') {
      expect(shimmer).toBeNull();
      return;
    }
    expect(shimmer?.parentElement).toBe(stageTrack('UNIT TESTS'));
    expect(fillRef.current?.contains(shimmer ?? null)).toBe(false);
  });

  // GauntletPhase rewrites the fill's transform every frame from a GSAP tween on a plain object, so
  // a transition on it restarts on every frame and the bar trails its own progress: measured in
  // Chromium on the width the fill was drawn with before, `transition-all duration-500` left it at
  // 3-7% when the stage reached 100%, and full 467-483 ms later. The status colour still eases,
  // which is the change CSS should animate.
  it.each(PIPELINE_STATUSES)(
    'transitions nothing on the fill but its colours, its transform least of all, while %s',
    async (status) => {
      expect(everyStatusListed).toBe(true);
      render(<PipelineStage name="UNIT TESTS" status={status} progress={40} />);
      const fill = stageFill('UNIT TESTS');
      // The element React writes the progress to.
      expect(fill.style.transform).toBe('scaleX(0.4)');

      // What the fill may transition is what `transition-colors` covers in the installed Tailwind,
      // read the same way, so `transition-[inline-size]` or a bare duration fails as well as
      // `transition-all`.
      const colours = document.createElement('div');
      colours.className = 'transition-colors duration-500';
      const allowed = await cssTransitions(colours);
      const transitioned = await cssTransitions(fill);
      expect(
        [...transitioned].filter((property) => !allowed.has(property)),
        `the fill transitions ${[...transitioned].join(', ')}`,
      ).toEqual([]);
      expect(transitioned).toContain('background-color');
    },
  );
});

describe('HudPanel', () => {
  afterEach(cleanup);

  // Eight titled panels in the story each drew an "ACTIVE" beside their title, and each one was
  // announced: decoration a screen-reader user heard eight times over (#47, hero-10).
  it('keeps the ACTIVE indicator beside its title away from assistive technology', () => {
    render(<HudPanel title="QUEST LOG">content</HudPanel>);

    const active = screen.getByText('ACTIVE');
    const hidden = active.closest('[aria-hidden="true"]');
    expect(hidden, 'the ACTIVE label is inside an aria-hidden element').not.toBeNull();
    // The title row holds the title and the indicator, nothing else: whatever is drawn beside the
    // title (the dot as much as the word) is inside the hidden part, found by structure rather than
    // by a class that names its look.
    const title = screen.getByText('QUEST LOG');
    const row = title.parentElement;
    expect(row?.children ? [...row.children] : [], 'the title row').toEqual([title, hidden]);
    expect(hidden?.contains(active)).toBe(true);
    expect(hidden?.children.length, 'the dot and the word').toBe(2);
    // The title is the panel's content and stays exposed.
    expect(title.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('draws no indicator on an untitled panel', () => {
    const { container } = render(<HudPanel>content</HudPanel>);

    expect(screen.queryByText('ACTIVE')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
