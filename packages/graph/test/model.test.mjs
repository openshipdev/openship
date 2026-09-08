import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoLayout, buildGraph, DEFAULT_FILTERS, gridPositions } from '../src/model.js';

const node = (id, kind, parentId, ownership = 'first_party', boundary) => ({ id, name: id, kind, parentId, metadata: { ownership, ...(boundary ? { boundary } : {}) } });
const system = {
  rootNodeId: 'root',
  nodes: [node('root', 'Root'), node('host', 'Host', 'root', 'third_party', 'external'), node('container', 'Container', 'host'), node('app', 'Process', 'container', 'first_party', 'internal'), node('lib', 'Library'), node('remote', 'Host', 'root', 'third_party', 'external')],
  edges: [
    { id: 'network', fromNodeId: 'app', toNodeId: 'remote', type: 'Runtime' },
    { id: 'library', fromNodeId: 'app', toNodeId: 'lib', type: 'Dependency' },
    { id: 'local', fromNodeId: 'container', toNodeId: 'app', type: 'Dataflow' },
  ],
};

test('nested descendants keep endpoint identities and parentless libraries remain visible', () => {
  const graph = buildGraph(system);
  assert.deepEqual(graph.cards.map(c => c.node.id), ['host', 'lib', 'remote']);
  assert.deepEqual(graph.cards[0].children.map(c => c.id), ['app', 'container']);
  assert.equal(graph.edges[0].source, 'host');
  assert.equal(graph.edges[0].sourceHandle, 'out:app');
  assert.equal(graph.edges[0].target, 'remote');
  assert.equal(graph.edges[2].source, 'host');
  assert.equal(graph.edges[2].target, 'host');
  assert.equal(graph.edges[2].targetHandle, 'in:app');
});

test('filters retain ancestors, remove hidden endpoints, and tolerate unspecified boundary', () => {
  const graph = buildGraph(system, { ...DEFAULT_FILTERS, third_party: false, external: false, Dependency: false });
  assert(graph.included.has('host'));
  assert(graph.included.has('app'));
  assert(graph.included.has('lib'));
  assert(!graph.included.has('remote'));
  assert.deepEqual(graph.edges.map(e => e.id), ['local']);
});

test('all ownership filters off leaves only the system boundary', () => {
  const graph = buildGraph(system, { ...DEFAULT_FILTERS, first_party: false, third_party: false });
  assert.equal(graph.cards.length, 0);
  assert.equal(graph.edges.length, 0);
  assert.deepEqual([...graph.included], ['root']);
});

test('grid and ELK produce non-overlapping cards without changing provider data', async () => {
  const before = structuredClone(system);
  const graph = buildGraph(system);
  const layouts = [gridPositions(graph.cards), await autoLayout(graph)];
  for (const layout of layouts) {
    for (const a of graph.cards) {
      const p = layout.get(a.node.id);
      assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      for (const b of graph.cards) {
        if (a === b) continue;
        const q = layout.get(b.node.id);
        assert(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y);
      }
    }
  }
  assert.deepEqual(system, before);
});
