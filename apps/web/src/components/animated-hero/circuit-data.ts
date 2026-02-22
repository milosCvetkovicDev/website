// ---------------------------------------------------------------------------
// Circuit Board SVG Data
// ---------------------------------------------------------------------------
// Pure data module — no React, no GSAP.
// Defines SVG paths, node positions and particle routes for a dense PCB
// background rendered inside a viewBox of 0 0 1920 1080.
// ---------------------------------------------------------------------------

// ---- Interfaces -----------------------------------------------------------

export interface CircuitPath {
  d: string; // SVG path "d" attribute
  tier: 'trunk' | 'branch' | 'trace';
  strokeWidth: number;
}

export interface CircuitNode {
  cx: number;
  cy: number;
  r: number;
  tier: 'ic' | 'via' | 'solder';
}

export interface ParticleRoute {
  pathIndex: number; // index into circuitPaths array
}

// ---- Trunk Paths (8) — main bus lines ------------------------------------

// Trunks are long, rectilinear runs that span most of the viewport.
// They establish the primary grid the rest of the network connects to.

const trunkPaths: CircuitPath[] = [
  // T0 — horizontal, upper region
  {
    d: 'M -20 180 H 480 V 260 H 1440 V 180 H 1940',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T1 — horizontal, mid-upper
  {
    d: 'M -20 400 H 640 V 340 H 1280 V 400 H 1940',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T2 — horizontal, centre
  {
    d: 'M -20 540 H 960 V 600 H 1940',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T3 — horizontal, mid-lower
  {
    d: 'M -20 720 H 400 V 780 H 1520 V 720 H 1940',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T4 — horizontal, lower region
  {
    d: 'M -20 900 H 720 V 840 H 1200 V 900 H 1940',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T5 — vertical, left side
  {
    d: 'M 320 -20 V 260 H 400 V 780 H 320 V 1100',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T6 — vertical, centre
  {
    d: 'M 960 -20 V 540 H 1040 V 1100',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
  // T7 — vertical, right side
  {
    d: 'M 1520 -20 V 400 H 1440 V 720 H 1520 V 1100',
    tier: 'trunk',
    strokeWidth: 2.5,
  },
];

// ---- Branch Paths (15) — medium connectors --------------------------------

// Branches run between trunks, always rectilinear (H/V only).

const branchPaths: CircuitPath[] = [
  // B0 — connects T5 to T6 at y=180
  {
    d: 'M 400 180 H 640 V 120 H 960',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B1 — drops from T0 area down to T1
  {
    d: 'M 480 260 V 340 H 640',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B2 — connects T6 to T7 at upper region
  {
    d: 'M 960 180 H 1200 V 260 H 1440',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B3 — vertical drop left of T6
  {
    d: 'M 720 400 V 540 H 960',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B4 — connects T1 to T2 mid-section
  {
    d: 'M 1280 400 V 540 H 1440',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B5 — horizontal run below T2
  {
    d: 'M 160 600 H 400 V 720',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B6 — short vertical between T2 and T3
  {
    d: 'M 960 600 V 720',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B7 — connects T3 to T4 right side
  {
    d: 'M 1520 720 H 1680 V 900',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B8 — left-side connector T3 down to T4
  {
    d: 'M 400 780 V 900 H 720',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B9 — mid connector between T6 and T3
  {
    d: 'M 1040 720 H 1200 V 840',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B10 — upper-left short
  {
    d: 'M 160 180 V 400',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B11 — horizontal across upper-right
  {
    d: 'M 1440 260 H 1680 V 400',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B12 — bottom connector across centre
  {
    d: 'M 720 840 H 960 V 900',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B13 — upper horizontal short
  {
    d: 'M 640 120 V 60 H 960',
    tier: 'branch',
    strokeWidth: 1.5,
  },
  // B14 — right-side lower connector
  {
    d: 'M 1200 900 H 1520 V 1000',
    tier: 'branch',
    strokeWidth: 1.5,
  },
];

// ---- Trace Paths (12) — fine detail stubs ---------------------------------

// Traces are short, may use diagonals, and add realism.

const tracePaths: CircuitPath[] = [
  // Tr0 — diagonal stub off T0
  { d: 'M 480 260 L 520 300', tier: 'trace', strokeWidth: 0.8 },
  // Tr1 — diagonal off T1 right
  { d: 'M 1280 340 L 1320 300', tier: 'trace', strokeWidth: 0.8 },
  // Tr2 — stub down-left off B0
  { d: 'M 640 120 L 600 80', tier: 'trace', strokeWidth: 0.8 },
  // Tr3 — diagonal off T5/T3 junction
  { d: 'M 400 780 L 440 820', tier: 'trace', strokeWidth: 0.8 },
  // Tr4 — stub off T6 centre
  { d: 'M 960 540 L 920 500', tier: 'trace', strokeWidth: 0.8 },
  // Tr5 — diagonal off T7/T1 junction
  { d: 'M 1440 400 L 1480 440', tier: 'trace', strokeWidth: 0.8 },
  // Tr6 — stub at B7 elbow
  { d: 'M 1680 900 L 1720 940', tier: 'trace', strokeWidth: 0.8 },
  // Tr7 — stub at B5 start
  { d: 'M 160 600 L 120 640', tier: 'trace', strokeWidth: 0.8 },
  // Tr8 — diagonal off B9 endpoint
  { d: 'M 1200 840 L 1240 880', tier: 'trace', strokeWidth: 0.8 },
  // Tr9 — stub off T4 left elbow
  { d: 'M 720 840 L 680 800', tier: 'trace', strokeWidth: 0.8 },
  // Tr10 — diagonal off B11
  { d: 'M 1680 400 L 1720 360', tier: 'trace', strokeWidth: 0.8 },
  // Tr11 — bottom-centre stub
  { d: 'M 960 900 L 1000 940', tier: 'trace', strokeWidth: 0.8 },
];

// ---- Combined paths array -------------------------------------------------

export const circuitPaths: CircuitPath[] = [
  ...trunkPaths, // indices  0 –  7
  ...branchPaths, // indices  8 – 22
  ...tracePaths, // indices 23 – 34
];

// ---- Circuit Nodes (46) ---------------------------------------------------

// Every node sits at an actual path intersection or endpoint.

// IC pads — 8 large circles at major trunk junctions
const icNodes: CircuitNode[] = [
  // T0/T5 junction (320,180 → trunk jog puts crossing at 480,260)
  { cx: 480, cy: 260, r: 10, tier: 'ic' },
  // T1/T5 junction (400,340 on T5 horizontal, T1 reaches 640,340)
  { cx: 640, cy: 340, r: 9, tier: 'ic' },
  // T0/T7 junction (1440,180)
  { cx: 1440, cy: 180, r: 10, tier: 'ic' },
  // T1/T7 junction (1440,400 on T7 horizontal → T1 reaches 1280,400)
  { cx: 1280, cy: 400, r: 9, tier: 'ic' },
  // T2/T6 junction (960,540)
  { cx: 960, cy: 540, r: 10, tier: 'ic' },
  // T3/T5 junction (400,780)
  { cx: 400, cy: 780, r: 10, tier: 'ic' },
  // T3/T7 junction (1520,720)
  { cx: 1520, cy: 720, r: 9, tier: 'ic' },
  // T4/T6 junction (1040,840 area → B9 endpoint is 1200,840)
  { cx: 1200, cy: 840, r: 8, tier: 'ic' },
];

// Via points — 18 medium circles at branch intersections
const viaNodes: CircuitNode[] = [
  { cx: 640, cy: 120, r: 5, tier: 'via' }, // B0/B13 junction
  { cx: 960, cy: 180, r: 5, tier: 'via' }, // B0 end / B2 start / T6 crossing
  { cx: 400, cy: 180, r: 5, tier: 'via' }, // T5 horizontal on T0
  { cx: 720, cy: 400, r: 5, tier: 'via' }, // B3 start on T1
  { cx: 720, cy: 540, r: 5, tier: 'via' }, // B3 elbow
  { cx: 1440, cy: 540, r: 5, tier: 'via' }, // B4 end
  { cx: 160, cy: 400, r: 5, tier: 'via' }, // B10 end on T1
  { cx: 160, cy: 180, r: 5, tier: 'via' }, // B10 start on T0
  { cx: 400, cy: 720, r: 5, tier: 'via' }, // B5 end on T3
  { cx: 160, cy: 600, r: 5, tier: 'via' }, // B5 start
  { cx: 960, cy: 600, r: 5, tier: 'via' }, // B6 start / T2 jog
  { cx: 960, cy: 720, r: 5, tier: 'via' }, // B6 end on T3
  { cx: 1680, cy: 400, r: 5, tier: 'via' }, // B11 end
  { cx: 1440, cy: 260, r: 5, tier: 'via' }, // B11 start / B2 end
  { cx: 720, cy: 840, r: 5, tier: 'via' }, // T4 jog / B12 start
  { cx: 960, cy: 900, r: 5, tier: 'via' }, // B12 end on T4
  { cx: 1680, cy: 900, r: 5, tier: 'via' }, // B7 end
  { cx: 1200, cy: 900, r: 5, tier: 'via' }, // B14 start / T4 jog
];

// Solder points — 20 small circles at endpoints and corners
const solderNodes: CircuitNode[] = [
  { cx: 320, cy: 260, r: 3, tier: 'solder' }, // T5 jog corner
  { cx: 1040, cy: 540, r: 3, tier: 'solder' }, // T6 jog corner
  { cx: 1040, cy: 720, r: 3, tier: 'solder' }, // B9 start
  { cx: 1200, cy: 720, r: 3, tier: 'solder' }, // B9 elbow
  { cx: 400, cy: 900, r: 3, tier: 'solder' }, // B8 elbow
  { cx: 720, cy: 900, r: 3, tier: 'solder' }, // B8 end / T4 start-jog
  { cx: 960, cy: 60, r: 3, tier: 'solder' }, // B13 end
  { cx: 1520, cy: 400, r: 3, tier: 'solder' }, // T7 jog corner
  { cx: 1520, cy: 1000, r: 3, tier: 'solder' }, // B14 end
  { cx: 520, cy: 300, r: 3, tier: 'solder' }, // Tr0 end
  { cx: 1320, cy: 300, r: 3, tier: 'solder' }, // Tr1 end
  { cx: 600, cy: 80, r: 3, tier: 'solder' }, // Tr2 end
  { cx: 440, cy: 820, r: 3, tier: 'solder' }, // Tr3 end
  { cx: 920, cy: 500, r: 3, tier: 'solder' }, // Tr4 end
  { cx: 1480, cy: 440, r: 3, tier: 'solder' }, // Tr5 end
  { cx: 1720, cy: 940, r: 3, tier: 'solder' }, // Tr6 end
  { cx: 120, cy: 640, r: 3, tier: 'solder' }, // Tr7 end
  { cx: 1240, cy: 880, r: 3, tier: 'solder' }, // Tr8 end
  { cx: 680, cy: 800, r: 3, tier: 'solder' }, // Tr9 end
  { cx: 1000, cy: 940, r: 3, tier: 'solder' }, // Tr11 end
];

export const circuitNodes: CircuitNode[] = [
  ...icNodes, // indices  0 –  7
  ...viaNodes, // indices  8 – 25
  ...solderNodes, // indices 26 – 45
];

// ---- Particle Routes (12) -------------------------------------------------

// Each route references a path the idle-animation particles travel along.
// Mix of trunk and branch paths for visual variety.

export const particleRoutes: ParticleRoute[] = [
  { pathIndex: 0 }, // T0 — upper horizontal
  { pathIndex: 2 }, // T2 — centre horizontal
  { pathIndex: 3 }, // T3 — mid-lower horizontal
  { pathIndex: 5 }, // T5 — left vertical
  { pathIndex: 6 }, // T6 — centre vertical
  { pathIndex: 7 }, // T7 — right vertical
  { pathIndex: 8 }, // B0 — upper connector
  { pathIndex: 11 }, // B3 — left vertical drop
  { pathIndex: 12 }, // B4 — right vertical drop
  { pathIndex: 14 }, // B6 — centre short vertical
  { pathIndex: 15 }, // B7 — right-side lower drop
  { pathIndex: 19 }, // B11 — upper-right horizontal
];
