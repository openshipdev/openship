import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autoLayout, buildGraph, DEFAULT_FILTERS, gridPositions, graphSelection, updateMeasurements } from '../src/model.js';

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
  const layouts = [gridPositions(graph.cards), (await autoLayout(graph)).positions];
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

test('domain filters use union membership, retain unassigned nodes and parent boundaries, and remove hidden connections', async () => {
  const { filterLayerByDomains } = await import('../src/model.js');
  const layer = { id: 'technical', rootNodeId: 'root', nodes: [node('root', 'Root'), node('host', 'Host', 'root'), node('a', 'Block', 'host'), node('shared', 'Store', 'host'), node('unassigned', 'Block', 'root')], edges: [{ id: 'call', type: 'Runtime', fromNodeId: 'a', toNodeId: 'shared' }, { id: 'host-call', type: 'Runtime', fromNodeId: 'host', toNodeId: 'shared' }] };
  const domains = [{ id: 'web', nodeIds: ['host', 'a', 'shared'] }, { id: 'state', nodeIds: ['shared'] }];
  const before = structuredClone(layer);
  assert.equal(filterLayerByDomains(layer, domains), layer);
  assert.equal(filterLayerByDomains(layer, [], ['web']), layer);
  const filtered = filterLayerByDomains(layer, domains, ['web']);
  assert.deepEqual(filtered.nodes.map(n => n.id), ['root', 'host', 'shared', 'unassigned']);
  assert.deepEqual(filtered.edges, []);
  assert.deepEqual(buildGraph(filtered).cards.map(c => c.node.id), ['host', 'unassigned']);
  assert.deepEqual(filterLayerByDomains(layer, domains, ['web', 'state']).nodes.map(n => n.id), ['root', 'unassigned']);
  assert.deepEqual(layer, before);
});

const routingSystem = {
  rootNodeId: 'root', name: 'Layout verification',
  nodes: [node('root', 'Root'), node('gateway', 'Host', 'root'), node('web', 'Process', 'gateway'),
    node('worker', 'Process', 'gateway'), node('api', 'Host', 'root'), node('service', 'Process', 'api'),
    node('db', 'Store', 'root'), node('queue', 'Store', 'root'), node('library', 'Library', 'root'), node('isolated', 'Host', 'root')],
  edges: [
    { id: 'request', fromNodeId: 'web', toNodeId: 'service', type: 'Runtime', metadata: { protocol: 'HTTPS / request-response' } },
    { id: 'parallel', fromNodeId: 'web', toNodeId: 'service', type: 'Runtime', metadata: { protocol: 'WebSocket' } },
    { id: 'read', fromNodeId: 'service', toNodeId: 'db', type: 'Dataflow', metadata: { protocol: 'PostgreSQL' } },
    { id: 'publish', fromNodeId: 'service', toNodeId: 'queue', type: 'Runtime' },
    { id: 'consume', fromNodeId: 'queue', toNodeId: 'worker', type: 'Dataflow' },
    { id: 'dependency', fromNodeId: 'worker', toNodeId: 'library', type: 'Dependency' },
    { id: 'internal', fromNodeId: 'web', toNodeId: 'worker', type: 'Runtime' },
  ],
};

const segmentHits = (a, b, box) => Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width
  && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height;

test('port routes attach to nested rows, reserve labels and avoid unrelated cards in a cyclic graph', async () => {
  const { cardHandle, connectionLabel } = await import('../src/model.js');
  const before = structuredClone(routingSystem), model = buildGraph(routingSystem);
  const { positions, routes } = await autoLayout(model, text => text.length * 8);
  assert.equal(routes.size, 6);
  const labels = [];
  for (const edge of model.edges.filter(e => e.source !== e.target)) {
    const route = routes.get(edge.id);
    for (const [cardId, nodeId, source, actual] of [
      [edge.source, edge.fromNodeId, true, route.points[0]], [edge.target, edge.toNodeId, false, route.points.at(-1)],
    ]) {
      const card = model.cards.find(c => c.node.id === cardId), p = positions.get(cardId), handle = cardHandle(card, nodeId, source);
      assert.deepEqual(actual, { x: p.x + handle.x, y: p.y + handle.y });
    }
    assert(route.label.width >= connectionLabel(edge).length * 8 + 12);
    labels.push(route.label);
    for (const [i, p] of route.points.entries()) {
      assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      if (i) assert(p.x === route.points[i - 1].x || p.y === route.points[i - 1].y, 'orthogonal segment');
    }
    for (const card of model.cards) {
      const box = { ...positions.get(card.node.id), width: card.width, height: card.height };
      const label = route.label;
      assert(!segmentHits(label, { x: label.x + label.width, y: label.y + label.height }, box), 'label clears cards');
      if (card.node.id === edge.source || card.node.id === edge.target) continue;
      for (let i = 1; i < route.points.length; i++) assert(!segmentHits(route.points[i - 1], route.points[i], box), 'route clears unrelated cards');
    }
  }
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = labels[i];
    assert(!segmentHits(a, { x: a.x + a.width, y: a.y + a.height }, labels[j]), 'labels do not overlap');
  }
  assert.notDeepEqual(routes.get('request').points, routes.get('parallel').points);
  assert.deepEqual(routingSystem, before);
  const reordered = buildGraph({ ...routingSystem, nodes: [...routingSystem.nodes].reverse(), edges: [...routingSystem.edges].reverse() });
  assert.deepEqual(await autoLayout(reordered, text => text.length * 8), { positions, routes });
});

test('empty and disconnected graphs lay out without missing positions or spurious routes', async () => {
  const empty = await autoLayout(buildGraph({ rootNodeId: 'root', nodes: [node('root', 'Root')], edges: [] }));
  assert.equal(empty.positions.size, 0);
  assert.equal(empty.routes.size, 0);
  const model = buildGraph({ ...routingSystem, edges: [] });
  const layout = await autoLayout(model);
  assert.equal(layout.positions.size, model.cards.length);
  assert.equal(layout.routes.size, 0);
});

test('moving cards invalidates connected routes, crossed corridors and labels, preserving the undo snapshot', async () => {
  const { invalidateRoutes } = await import('../src/model.js');
  const model = buildGraph(routingSystem), { routes } = await autoLayout(model);
  const snapshot = structuredClone(routes);
  const moved = invalidateRoutes(routes, model.edges, [{ id: 'gateway', x: 9000, y: 9000, width: 344, height: 320 }]);
  assert(!moved.has('request'));
  assert(!moved.has('parallel'));
  assert(!moved.has('consume'));
  assert(moved.has('read'));
  const label = routes.get('read').label;
  const obstructed = invalidateRoutes(routes, model.edges, [{ id: 'isolated', ...label }]);
  assert(!obstructed.has('read'));
  const p = routes.get('publish').points[2];
  assert(!invalidateRoutes(routes, model.edges, [{ id: 'isolated', x: p.x - 2, y: p.y - 2, width: 4, height: 4 }]).has('publish'));
  assert.equal(invalidateRoutes(routes, model.edges, []), routes);
  assert.deepEqual(routes, snapshot);
});

test('port geometry includes host and nested row borders', async () => {
  const { cardHandle, roundedRoute } = await import('../src/model.js');
  const card = buildGraph(routingSystem).cards.find(c => c.node.id === 'api');
  assert.deepEqual(cardHandle(card, 'api', false), { x: 16, y: 55 });
  assert.deepEqual(cardHandle(card, 'service', false), { x: 17, y: 154 });
  assert.deepEqual(cardHandle(card, 'service', true), { x: 303, y: 154 });
  const path = roundedRoute([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 4 }]);
  assert.equal(path, 'M 0 0 L 1 0 Q 2 0 2 1 L 2 4');
});


test('card selection highlights nested incoming and outgoing edges, but only one-hop neighbors', () => {
  const graph = buildGraph({ ...system, edges: [...system.edges,
    { id: 'incoming', fromNodeId: 'remote', toNodeId: 'container', type: 'Runtime' },
    { id: 'second-hop', fromNodeId: 'remote', toNodeId: 'lib', type: 'Runtime' },
  ] });
  const selected = graphSelection(graph, 'host');
  assert.deepEqual([...selected.connectedEdges].sort(), ['incoming', 'library', 'local', 'network']);
  assert.deepEqual([...selected.neighbors].sort(), ['lib', 'remote']);
  const nested = graphSelection(graph, 'container');
  assert.deepEqual([...nested.connectedEdges].sort(), ['incoming', 'local']);
  assert(nested.neighbors.has('app'));
  assert(nested.neighbors.has('remote'));
  assert(!nested.neighbors.has('lib'));
  const filtered = graphSelection(buildGraph(system, { ...DEFAULT_FILTERS, Runtime: false }), 'host');
  assert(!filtered.connectedEdges.has('network'));
  assert(!filtered.neighbors.has('remote'));
  assert.equal(graphSelection(graph, null).connectedEdges.size, 0);
});
