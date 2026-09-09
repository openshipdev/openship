import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoLayout, buildGraph, DEFAULT_FILTERS, gridPositions, updateMeasurements } from '../src/model.js';

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

test('renderer measurements survive non-dimension updates and only change on resize', () => {
  const initial = new Map([['host', { width: 320, height: 208 }]]);
  assert.equal(updateMeasurements(initial, [
    { type: 'select', id: 'host', selected: true },
    { type: 'remove', id: 'host' },
    { type: 'position', id: 'host', position: { x: 200, y: 300 } },
    { type: 'dimensions', id: 'host', dimensions: { width: 320, height: 208 } },
  ]), initial);
  const resized = updateMeasurements(initial, [{ type: 'dimensions', id: 'host', dimensions: { width: 320, height: 306 } }]);
  assert.notEqual(resized, initial);
  assert.equal(resized.get('host').height, 306);
  assert.equal(initial.get('host').height, 208);
  assert.equal(updateMeasurements(resized, [{ type: 'dimensions', id: 'host', dimensions: { width: NaN, height: 0 } }]), resized);
});

test('internal links exit right, cross the gap, and enter from the left', () => {
  const fixture = structuredClone(system);
  fixture.edges = [{ id: 'down', fromNodeId: 'app', toNodeId: 'container', type: 'Runtime' }];
  const host = buildGraph(fixture).cards.find(card => card.node.id === 'host');
  const route = host.routes[0];
  const [a, b, c, d, e, f] = route.points;
  assert(b[0] > a[0] && b[1] === a[1]);
  assert(c[0] === b[0] && c[1] > b[1]);
  assert(d[0] < c[0] && d[1] === c[1]);
  assert(e[0] === d[0] && e[1] > d[1]);
  assert(f[0] > e[0] && f[1] === e[1]);
  assert.equal(host.width, 344);
  assert(host.height <= 340);
});

test('parallel, reverse, self and skipped-row connections have clear labels and side rails', () => {
  const fixture = structuredClone(system);
  fixture.edges.push(
    { id: 'parallel', fromNodeId: 'container', toNodeId: 'app', type: 'Runtime' },
    { id: 'reverse', fromNodeId: 'app', toNodeId: 'container', type: 'Runtime' },
    { id: 'self', fromNodeId: 'app', toNodeId: 'app', type: 'Dependency' },
    { id: 'skip', fromNodeId: 'host', toNodeId: 'container', type: 'Runtime' },
  );
  const host = buildGraph(fixture).cards.find(card => card.node.id === 'host');
  assert.equal(host.routes.length, 5);
  assert([...host.rows.values()].every(row => row.height === 72));
  assert.equal(new Set(host.routes.map(route => route.labelY)).size, 5);
  for (const route of host.routes) {
    const rows = [...host.rows.values()];
    assert(route.labelY - 10 >= rows[route.upper].top + 72);
    const next = rows[route.upper + 1];
    assert(route.labelY + 10 < (next ? next.top - 20 : host.height));
    const left = rows[0].left;
    assert(route.points[1][0] > left + 288 && route.points[1][0] < host.width);
    assert(route.points[3][0] > 0 && route.points[3][0] < left);
  }
  assert.deepEqual(host.routes, buildGraph({ ...fixture, edges: [...fixture.edges].reverse() }).cards.find(card => card.node.id === 'host').routes);
  const filtered = buildGraph(fixture, { ...DEFAULT_FILTERS, Runtime: false, Dataflow: false, Dependency: false });
  assert.equal(filtered.cards.find(card => card.node.id === 'host').width, 320);
});

test('logical blocks and stores render without hosts and keep nested library containment', () => {
  const layer = { rootNodeId: 'root', nodes: [node('root', 'Root'), node('capability', 'Block', 'root'), node('data', 'Store', 'root'), node('library', 'Library', 'capability')], edges: [{ id: 'uses', type: 'Runtime', fromNodeId: 'capability', toNodeId: 'data' }] };
  const graph = buildGraph(layer);
  assert.deepEqual(graph.cards.map(card => card.node.id), ['capability', 'data']);
  assert.deepEqual(graph.cards[0].children.map(child => child.id), ['library']);
  assert.equal(graph.edges[0].source, 'capability');
  assert.equal(graph.edges[0].target, 'data');
});
