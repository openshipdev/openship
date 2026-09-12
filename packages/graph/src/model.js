// Domain memberships are explicit across layers, independent of containment and refinement.
export function filterLayerByDomains(layer, domains = [], hiddenDomainIds = []) {
  if (!domains.length || !hiddenDomainIds.length) return layer;
  const hidden = new Set(hiddenDomainIds), assigned = new Set(), enabled = new Set();
  for (const domain of domains) for (const nodeId of domain.nodeIds) {
    assigned.add(nodeId);
    if (!hidden.has(domain.id)) enabled.add(nodeId);
  }
  const matches = new Set(layer.nodes.filter((node) => node.id === layer.rootNodeId || !assigned.has(node.id) || enabled.has(node.id)).map((node) => node.id));
  const included = new Set(matches), byId = new Map(layer.nodes.map((node) => [node.id, node]));
  for (const id of matches) {
    let parent = byId.get(id)?.parentId;
    while (parent && !included.has(parent)) {
      included.add(parent);
      parent = byId.get(parent)?.parentId;
    }
  }
  return { ...layer, nodes: layer.nodes.filter((node) => included.has(node.id)), edges: layer.edges.filter((edge) => matches.has(edge.fromNodeId) && matches.has(edge.toNodeId)) };
}

// Adapted from anticlodex's topology model: retain ancestors when filtering,
// nest processes/containers within their host, and route edges to child handles.
export const DEFAULT_FILTERS = {
  first_party: true, third_party: true, internal: true, external: true,
  Runtime: true, Dataflow: true, Dependency: true,
};

export function buildGraph(system, filters = DEFAULT_FILTERS) {
  const byId = new Map(system.nodes.map((node) => [node.id, node]));
  const included = new Set();
  for (const node of system.nodes) {
    const boundary = node.metadata?.boundary;
    // Boundary is optional in OpenShip. Unspecified nodes remain visible.
    if (filters[node.metadata?.ownership] === false || filters[boundary] === false) continue;
    let current = node;
    while (current && !included.has(current.id)) {
      included.add(current.id);
      current = byId.get(current.parentId);
    }
  }
  included.add(system.rootNodeId);
  const owner = new Map();
  const cards = [];
  const sorted = [...system.nodes].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  for (const node of sorted) {
    if (!included.has(node.id) || node.id === system.rootNodeId) continue;
    let host = node;
    const visited = new Set([node.id]);
    {
      let parent = byId.get(node.parentId);
      while (parent && parent.id !== system.rootNodeId && !visited.has(parent.id)) {
        visited.add(parent.id);
        host = parent;
        parent = byId.get(parent.parentId);
      }
    }
    owner.set(node.id, host.id);
  }
  for (const node of sorted) {
    if (owner.get(node.id) !== node.id) continue;
    const children = sorted.filter((child) => child.id !== node.id && owner.get(child.id) === node.id);
    cards.push({ node, children, width: 320, height: 110 + children.length * 98 });
  }
  const edges = system.edges.filter((edge) => filters[edge.type] !== false && included.has(edge.fromNodeId) && included.has(edge.toNodeId)).map((edge) => ({
    ...edge,
    source: owner.get(edge.fromNodeId) ?? system.rootNodeId,
    target: owner.get(edge.toNodeId) ?? system.rootNodeId,
    sourceHandle: `out:${edge.fromNodeId}`,
    targetHandle: `in:${edge.toNodeId}`,
  }));
  for (const card of cards) Object.assign(card, layoutCard(card, edges));
  return { root: byId.get(system.rootNodeId), cards, edges, included };
}

// Exit right, cross a reserved inter-row gap, and enter the target from the
// left. Side rails stay inside the host; labels never share space with badges.
export function layoutCard(card, edges) {
  const nodes = [card.node, ...card.children];
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const internal = edges.filter((edge) => edge.source === card.node.id && edge.target === card.node.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const occupied = [];
  const connections = internal.map((edge) => {
    const from = order.get(edge.fromNodeId), to = order.get(edge.toNodeId);
    const upper = Math.min(from, to), lower = Math.max(from, to);
    let lane = occupied.findIndex((intervals) => intervals.every(([start, end]) => lower < start || upper > end));
    if (lane === -1) { lane = occupied.length; occupied.push([]); }
    occupied[lane].push([upper, lower]);
    return { ...edge, upper, lower, lane };
  });
  const extra = Math.max(0, occupied.length - 1) * 8;
  const width = internal.length ? 344 + extra * 2 : 320;
  const left = internal.length ? 27 + extra : 15;
  const rows = new Map();
  let top = 18;
  for (const [index, node] of nodes.entries()) {
    rows.set(node.id, { top, left, height: 72 });
    const crossing = connections.filter((edge) => edge.upper === index);
    crossing.forEach((edge, slot) => { edge.labelY = top + 72 + 14 + slot * 22; });
    top += 72 + (crossing.length ? 52 + (crossing.length - 1) * 22 : 26);
  }
  const routes = connections.map((edge) => {
    const sourceY = rows.get(edge.fromNodeId).top + 36;
    const targetY = rows.get(edge.toNodeId).top + 36;
    const sourceX = left + 289, targetX = left - 1;
    const rightRail = width - 12 - edge.lane * 8;
    const leftRail = 12 + edge.lane * 8;
    const y = edge.labelY;
    const first = Math.sign(y - sourceY), second = Math.sign(targetY - y);
    const points = [[sourceX, sourceY], [rightRail, sourceY], [rightRail, y], [leftRail, y], [leftRail, targetY], [targetX, targetY]];
    const path = `M ${sourceX} ${sourceY} H ${rightRail - 5} Q ${rightRail} ${sourceY} ${rightRail} ${sourceY + first * 5} V ${y - first * 5} Q ${rightRail} ${y} ${rightRail - 5} ${y} H ${leftRail + 5} Q ${leftRail} ${y} ${leftRail} ${y + second * 5} V ${targetY - second * 5} Q ${leftRail} ${targetY} ${leftRail + 5} ${targetY} H ${targetX}`;
    return { ...edge, sourceY, targetY, points, path,
      label: [edge.type, edge.metadata?.protocol].filter(Boolean).join(" · "),
      labelX: left + 34, labelWidth: 220,
    };
  });
  const last = rows.get(nodes.at(-1).id);
  const lastHasLoop = connections.some((edge) => edge.upper === nodes.length - 1);
  return { rows, routes, width, height: lastHasLoop ? top : last.top + 72 + 18 };
}

export function gridPositions(cards) {
  const positions = new Map();
  let y = 110;
  for (let i = 0; i < cards.length; i += 3) {
    const row = cards.slice(i, i + 3);
    let x = 40;
    row.forEach((card) => { positions.set(card.node.id, { x, y }); x += card.width + 100; });
    y += Math.max(...row.map((card) => card.height)) + 90;
  }
  return positions;
}

export const connectionLabel = (edge) => [edge.type, edge.metadata?.protocol].filter(Boolean).join(" · ");

// Both the card border and nested row border affect DOM handle centers.
export function cardHandle(card, nodeId, source) {
  const row = card.rows.get(nodeId);
  const inset = nodeId === card.node.id ? 0 : 1;
  return { x: row.left + 1 + (source ? 288 - inset : inset), y: row.top + 37 + inset };
}

// Round only as far as adjacent segments allow, including short port stubs.
export function roundedRoute(points, radius = 6) {
  const clean = points.filter((point, i) => !i || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  if (!clean.length) return "";
  let path = `M ${clean[0].x} ${clean[0].y}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const a = clean[i - 1], b = clean[i], c = clean[i + 1];
    const before = Math.hypot(b.x - a.x, b.y - a.y), after = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, before / 2, after / 2);
    path += ` L ${b.x + (a.x - b.x) * r / before} ${b.y + (a.y - b.y) * r / before} Q ${b.x} ${b.y} ${b.x + (c.x - b.x) * r / after} ${b.y + (c.y - b.y) * r / after}`;
  }
  const last = clean.at(-1);
  return `${path} L ${last.x} ${last.y}`;
}

export async function autoLayout(model, measureLabel = (text) => text.length * 7) {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const cards = [...model.cards].sort((a, b) => a.node.id.localeCompare(b.node.id));
  const byId = new Map(cards.map((card) => [card.node.id, card]));
  const connections = model.edges.filter((edge) => edge.source !== edge.target && byId.has(edge.source) && byId.has(edge.target))
    .sort((a, b) => a.id.localeCompare(b.id));
  // Generated IDs avoid collisions with provider node/edge identifiers.
  const portId = (id, source) => JSON.stringify(["port", id, source]);
  const result = await new ELK().layout({
    id: "layout",
    layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "ORTHOGONAL",
      "elk.randomSeed": "1", "elk.spacing.nodeNode": "80",
      "elk.spacing.edgeNode": "24", "elk.spacing.edgeEdge": "16",
      "elk.layered.spacing.nodeNodeBetweenLayers": "130",
      "elk.layered.spacing.edgeNodeBetweenLayers": "24",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "16",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeLabels.placement": "CENTER",
    },
    children: cards.map((card) => ({
      id: card.node.id, width: card.width, height: card.height,
      layoutOptions: { "elk.portConstraints": "FIXED_POS" },
      ports: [card.node, ...card.children].flatMap((node) => [false, true].map((source) => ({
        id: portId(node.id, source), width: 0, height: 0,
        // Route outside the card; connect the boundary to the inset row with a stub.
        x: source ? card.width : 0, y: cardHandle(card, node.id, source).y,
        layoutOptions: { "elk.port.side": source ? "EAST" : "WEST" },
      }))),
    })),
    edges: connections.map((edge) => ({
      id: edge.id, sources: [portId(edge.fromNodeId, true)], targets: [portId(edge.toNodeId, false)],
      labels: [{ text: connectionLabel(edge), width: Math.ceil(measureLabel(connectionLabel(edge))) + 12, height: 24 }],
    })),
  });
  const translate = ({ x, y }) => ({ x: x + 40, y: y + 110 });
  const positions = new Map(result.children.map((node) => [node.id, translate(node)]));
  const routes = new Map();
  const edgesById = new Map(connections.map((edge) => [edge.id, edge]));
  for (const laidOut of result.edges ?? []) {
    const edge = edgesById.get(laidOut.id), section = laidOut.sections?.[0];
    if (!section) continue;
    const endpoint = (id, nodeId, source) => {
      const position = positions.get(id), handle = cardHandle(byId.get(id), nodeId, source);
      return { x: position.x + handle.x, y: position.y + handle.y };
    };
    const points = [endpoint(edge.source, edge.fromNodeId, true),
      ...[section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(translate),
      endpoint(edge.target, edge.toNodeId, false)];
    const label = laidOut.labels?.[0];
    routes.set(edge.id, {
      points, path: roundedRoute(points),
      label: label && { ...translate(label), width: label.width, height: label.height },
    });
  }
  return { positions, routes };
}

// A manual move can invalidate even an unrelated edge by moving a card into its
// corridor. Recompute these edges with React Flow's live endpoint router.
export function invalidateRoutes(routes, edges, movedCards) {
  if (!routes.size || !movedCards.length) return routes;
  const moved = new Set(movedCards.map((card) => card.id));
  const intersects = (a, b, box) => Math.max(a.x, b.x) >= box.x && Math.min(a.x, b.x) <= box.x + box.width
    && Math.max(a.y, b.y) >= box.y && Math.min(a.y, b.y) <= box.y + box.height;
  const next = new Map(routes);
  for (const edge of edges) {
    const route = routes.get(edge.id);
    if (!route) continue;
    if (moved.has(edge.source) || moved.has(edge.target) || movedCards.some((card) => {
      const box = { x: card.x - 12, y: card.y - 24, width: card.width + 24, height: card.height + 36 };
      return route.points.some((point, i) => i > 0 && intersects(route.points[i - 1], point, box))
        || (route.label && intersects({ x: route.label.x, y: route.label.y },
          { x: route.label.x + route.label.width, y: route.label.y + route.label.height }, box));
    })) next.delete(edge.id);
  }
  return next.size === routes.size ? routes : next;
}

// React Flow 12 stores DOM dimensions separately from explicit node sizing.
// Keep this renderer state across selection updates without accepting edits.
export function updateMeasurements(previous, changes) {
  let next = previous;
  for (const change of changes) {
    if (change.type !== "dimensions" || !change.dimensions) continue;
    const { width, height } = change.dimensions;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) continue;
    const current = next.get(change.id);
    if (current?.width === width && current?.height === height) continue;
    if (next === previous) next = new Map(previous);
    next.set(change.id, { width, height });
  }
  return next;
}

// Cards represent their nested endpoints as well as their own component.
// Keep selection to one hop; do not traverse neighbors' other connections.
export function graphSelection(model, selected) {
  const neighbors = new Set(), connectedEdges = new Set();
  const selectedCard = model.cards.find((card) => card.node.id === selected);
  const selectedIds = new Set(selectedCard
    ? [selected, ...selectedCard.children.map((node) => node.id)]
    : [selected]);
  for (const edge of model.edges) {
    if (!selectedIds.has(edge.fromNodeId) && !selectedIds.has(edge.toNodeId)) continue;
    connectedEdges.add(edge.id);
    for (const [endpoint, owner] of [[edge.fromNodeId, edge.source], [edge.toNodeId, edge.target]]) {
      if (!selectedIds.has(endpoint)) {
        neighbors.add(endpoint);
        if (owner !== selected) neighbors.add(owner);
      }
    }
  }
  neighbors.delete(selected);
  return { neighbors, connectedEdges };
}
