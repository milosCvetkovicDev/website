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

  it('has unique node ids and unique connection pairs', () => {
    expect(new Set(NODES.map((node) => node.id)).size).toBe(NODES.length);
    const pairs = CONNECTIONS.map((c) => `${c.source}->${c.target}`);
    expect(new Set(pairs).size).toBe(CONNECTIONS.length);
  });

  it('returns every connection and marks none active when no node is active', () => {
    const result = getActiveConnections([]);
    expect(result).toHaveLength(CONNECTIONS.length);
    expect(result.every((connection) => !connection.active)).toBe(true);
  });

  it('activates a connection only when both of its ends are active', () => {
    const result = getActiveConnections(['client', 'gateway', 'backend', 'db']);
    expect(result).toHaveLength(CONNECTIONS.length);
    const pairs = result
      .filter((connection) => connection.active)
      .map((connection) => `${connection.source}->${connection.target}`);
    expect(pairs).toEqual(['client->gateway', 'gateway->backend', 'backend->db']);
  });

  it('ignores a lone active node', () => {
    const result = getActiveConnections(['ai']);
    expect(result).toHaveLength(CONNECTIONS.length);
    expect(result.some((connection) => connection.active)).toBe(false);
  });

  it('draws every connection as a path starting at its source node', () => {
    for (const connection of CONNECTIONS) {
      const source = NODES.find((node) => node.id === connection.source);
      expect(connection.path.startsWith(`M ${source?.pos.x} ${source?.pos.y} `)).toBe(true);
    }
  });
});
