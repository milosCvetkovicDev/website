import { describe, expect, it } from 'vitest';
import { CONNECTIONS, NODES, getActiveConnections } from '../architecture-graph';

describe('architecture graph', () => {
  it('only connects nodes that exist', () => {
    const ids = new Set(NODES.map((node) => node.id));
    for (const connection of CONNECTIONS) {
      expect(ids.has(connection.source)).toBe(true);
      expect(ids.has(connection.target)).toBe(true);
    }
  });

  it('marks nothing active when no node is active', () => {
    expect(getActiveConnections([]).every((connection) => !connection.active)).toBe(true);
  });

  it('activates a connection only when both of its ends are active', () => {
    const active = getActiveConnections(['client', 'gateway', 'backend', 'db']).filter(
      (connection) => connection.active,
    );
    const pairs = active.map((connection) => `${connection.source}->${connection.target}`);
    expect(pairs).toEqual(['client->gateway', 'gateway->backend', 'backend->db']);
  });

  it('ignores a lone active node', () => {
    expect(getActiveConnections(['ai']).some((connection) => connection.active)).toBe(false);
  });
});
