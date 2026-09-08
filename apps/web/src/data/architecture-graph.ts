export type ArchitectureNode =
  'client' | 'gateway' | 'auth' | 'backend' | 'worker' | 'db' | 'cache' | 'ai' | 'storage';

export type NodeKind = 'user' | 'compute' | 'data' | 'ai';

export interface Position {
  x: number;
  y: number;
}

export interface NodeDefinition {
  id: ArchitectureNode;
  label: string;
  pos: Position;
  kind: NodeKind;
}

export interface Connection {
  source: ArchitectureNode;
  target: ArchitectureNode;
  /** SVG path `d` attribute in VIEW_BOX coordinates. */
  path: string;
}

export const VIEW_BOX = { width: 1100, height: 600 } as const;

export const NODES: readonly NodeDefinition[] = [
  { id: 'client', label: 'Client / CLI', pos: { x: 100, y: 300 }, kind: 'user' },
  { id: 'gateway', label: 'API Gateway', pos: { x: 300, y: 300 }, kind: 'compute' },
  { id: 'auth', label: 'Auth Service', pos: { x: 500, y: 150 }, kind: 'compute' },
  { id: 'backend', label: 'Core Backend', pos: { x: 500, y: 300 }, kind: 'compute' },
  { id: 'worker', label: 'Job Worker', pos: { x: 500, y: 450 }, kind: 'compute' },
  { id: 'cache', label: 'Redis Cache', pos: { x: 750, y: 150 }, kind: 'data' },
  { id: 'db', label: 'PostgreSQL', pos: { x: 750, y: 300 }, kind: 'data' },
  { id: 'storage', label: 'Blob Storage', pos: { x: 750, y: 450 }, kind: 'data' },
  { id: 'ai', label: 'Claude AI', pos: { x: 950, y: 300 }, kind: 'ai' },
];

function position(id: ArchitectureNode): Position {
  const node = NODES.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown architecture node: ${id}`);
  return node.pos;
}

/** Cubic curve between two points, bending horizontally or vertically. */
function curve(from: Position, to: Position, orientation: 'horizontal' | 'vertical'): string {
  if (orientation === 'horizontal') {
    const cpX = from.x + (to.x - from.x) * 0.5;
    return `M ${from.x} ${from.y} C ${cpX} ${from.y}, ${cpX} ${to.y}, ${to.x} ${to.y}`;
  }
  const cpY = from.y + (to.y - from.y) * 0.5;
  return `M ${from.x} ${from.y} C ${from.x} ${cpY}, ${to.x} ${cpY}, ${to.x} ${to.y}`;
}

function connect(
  source: ArchitectureNode,
  target: ArchitectureNode,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
  targetOverride?: Position,
): Connection {
  return {
    source,
    target,
    path: curve(position(source), targetOverride ?? position(target), orientation),
  };
}

export const CONNECTIONS: readonly Connection[] = [
  connect('client', 'gateway'),
  connect('gateway', 'auth'),
  connect('gateway', 'backend'),
  connect('gateway', 'worker'),
  connect('backend', 'cache'),
  connect('backend', 'db'),
  connect('worker', 'db'),
  connect('worker', 'storage'),
  // Slightly offset so it does not overlap backend -> db at the database node.
  connect('auth', 'db', 'horizontal', { x: 750, y: 280 }),
  connect('backend', 'worker', 'vertical'),
  connect('worker', 'ai'),
  connect('backend', 'ai'),
];

export interface ConnectionState extends Connection {
  active: boolean;
}

/** A connection lights up only when both of its ends belong to the active project. */
export function getActiveConnections(active: readonly ArchitectureNode[]): ConnectionState[] {
  const activeSet = new Set(active);
  return CONNECTIONS.map((connection) => ({
    ...connection,
    active: activeSet.has(connection.source) && activeSet.has(connection.target),
  }));
}
