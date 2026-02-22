// ---------------------------------------------------------------------------
// Circuit Board SVG Data — Technology Ecosystem
// ---------------------------------------------------------------------------
// Pure data module — no React, no GSAP.
// Defines SVG paths, labeled technology nodes and particle routes for a
// meaningful PCB-style background rendered inside a viewBox of 0 0 1920 1080.
//
// Layout narrative (top → bottom):
//   Upper band  — Discovery & Architecture (DDD, Event Storming, Clean Arch…)
//   Center      — Claude AI (the bridge between understanding and building)
//   Lower band  — Implementation Technologies (React, Node.js, Docker…)
//
// The boot animation traces paths top-to-bottom, telling the story of
// receiving a development request and going from domain understanding
// through architecture to technology implementation.
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
  label?: string;
  labelAnchor?: 'left' | 'right';
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

// ---- Circuit Nodes (46) — labeled technology ecosystem --------------------

// Every node sits at an actual path intersection or endpoint.
// Labels tell the software-development story from discovery to deployment.

// IC pads — 8 large circles at major trunk junctions
// These are the headline technologies / methodologies.
const icNodes: CircuitNode[] = [
  // --- Upper band: Discovery & Architecture ---
  // T0/T5 junction
  { cx: 480, cy: 260, r: 10, tier: 'ic', label: 'DDD' },
  // T1/T5 junction
  { cx: 640, cy: 340, r: 9, tier: 'ic', label: 'Event Storming' },
  // T0/T7 junction
  { cx: 1440, cy: 180, r: 10, tier: 'ic', label: 'Clean Architecture', labelAnchor: 'left' },
  // T1/T7 junction
  { cx: 1280, cy: 400, r: 9, tier: 'ic', label: 'Microservices', labelAnchor: 'left' },
  // --- Center: the bridge ---
  // T2/T6 junction (center of the network)
  { cx: 960, cy: 540, r: 10, tier: 'ic', label: 'Claude AI', labelAnchor: 'left' },
  // --- Lower band: Implementation ---
  // T3/T5 junction
  { cx: 400, cy: 780, r: 10, tier: 'ic', label: 'React' },
  // T3/T7 junction
  { cx: 1520, cy: 720, r: 9, tier: 'ic', label: 'Node.js', labelAnchor: 'left' },
  // T4/T6 junction area
  { cx: 1200, cy: 840, r: 8, tier: 'ic', label: 'Docker' },
];

// Via points — 18 medium circles at branch intersections
// Supporting technologies, practices and frameworks.
const viaNodes: CircuitNode[] = [
  // B0/B13 junction — core language
  { cx: 640, cy: 120, r: 5, tier: 'via', label: 'TypeScript' },
  // B0 end / T6 crossing — DDD practice
  { cx: 960, cy: 180, r: 5, tier: 'via', label: 'Domain Modeling' },
  // T5 horizontal on T0 — DDD concept
  { cx: 400, cy: 180, r: 5, tier: 'via', label: 'Bounded Contexts' },
  // B3 start on T1 — architecture pattern
  { cx: 720, cy: 400, r: 5, tier: 'via', label: 'CQRS' },
  // B3 elbow — frontend framework
  { cx: 720, cy: 540, r: 5, tier: 'via', label: 'Next.js' },
  // B4 end — cloud platform
  { cx: 1440, cy: 540, r: 5, tier: 'via', label: 'Azure', labelAnchor: 'left' },
  // B10 end on T1 — practice
  { cx: 160, cy: 400, r: 5, tier: 'via', label: 'TDD' },
  // B10 start on T0 — discovery process
  { cx: 160, cy: 180, r: 5, tier: 'via', label: 'User Stories' },
  // B5 end on T3 — frontend styling
  { cx: 400, cy: 720, r: 5, tier: 'via', label: 'Tailwind CSS' },
  // B5 start — practice
  { cx: 160, cy: 600, r: 5, tier: 'via', label: 'Code Review' },
  // B6 start / T2 jog — backend framework
  { cx: 960, cy: 600, r: 5, tier: 'via', label: 'NestJS' },
  // B6 end on T3 — container orchestration
  { cx: 960, cy: 720, r: 5, tier: 'via', label: 'Kubernetes' },
  // B11 end — DevOps practice
  { cx: 1680, cy: 400, r: 5, tier: 'via', label: 'CI/CD', labelAnchor: 'left' },
  // B11 start / B2 end — architecture concern
  { cx: 1440, cy: 260, r: 5, tier: 'via', label: 'API Design', labelAnchor: 'left' },
  // T4 jog / B12 start — DevOps tool
  { cx: 720, cy: 840, r: 5, tier: 'via', label: 'GitHub Actions' },
  // B12 end on T4 — build system
  { cx: 960, cy: 900, r: 5, tier: 'via', label: 'Nx' },
  // B7 end — testing framework
  { cx: 1680, cy: 900, r: 5, tier: 'via', label: 'Playwright', labelAnchor: 'left' },
  // B14 start / T4 jog — database
  { cx: 1200, cy: 900, r: 5, tier: 'via', label: 'PostgreSQL' },
];

// Solder points — 20 small circles at endpoints and corners
// Some labeled (tools & patterns), some unlabeled (visual density).
const solderNodes: CircuitNode[] = [
  // --- Labeled solder nodes ---
  // T5 jog corner — DDD building block
  { cx: 320, cy: 260, r: 3, tier: 'solder', label: 'Aggregates' },
  // T6 jog corner — backend runtime
  { cx: 1040, cy: 540, r: 3, tier: 'solder', label: 'Express' },
  // B9 start — validation library
  { cx: 1040, cy: 720, r: 3, tier: 'solder', label: 'Zod' },
  // B9 elbow — job queue
  { cx: 1200, cy: 720, r: 3, tier: 'solder', label: 'pg-boss' },
  // B8 elbow — animation library
  { cx: 400, cy: 900, r: 3, tier: 'solder', label: 'GSAP' },
  // B8 end / T4 start-jog — JS runtime
  { cx: 720, cy: 900, r: 3, tier: 'solder', label: 'Bun' },
  // B13 end — edge runtime
  { cx: 960, cy: 60, r: 3, tier: 'solder', label: 'Elysia' },
  // T7 jog corner — observability
  { cx: 1520, cy: 400, r: 3, tier: 'solder', label: 'Monitoring', labelAnchor: 'left' },
  // B14 end — IaC tool
  { cx: 1520, cy: 1000, r: 3, tier: 'solder', label: 'Terraform', labelAnchor: 'left' },
  // --- Unlabeled dots (visual density) ---
  { cx: 520, cy: 300, r: 3, tier: 'solder' },
  { cx: 1320, cy: 300, r: 3, tier: 'solder' },
  { cx: 600, cy: 80, r: 3, tier: 'solder' },
  { cx: 440, cy: 820, r: 3, tier: 'solder' },
  { cx: 920, cy: 500, r: 3, tier: 'solder' },
  { cx: 1480, cy: 440, r: 3, tier: 'solder' },
  { cx: 1720, cy: 940, r: 3, tier: 'solder' },
  { cx: 120, cy: 640, r: 3, tier: 'solder' },
  { cx: 1240, cy: 880, r: 3, tier: 'solder' },
  { cx: 680, cy: 800, r: 3, tier: 'solder' },
  { cx: 1000, cy: 940, r: 3, tier: 'solder' },
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
