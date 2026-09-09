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
    if (node.kind !== "Library") {
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

// Internal connections have their own right-hand gutter. Every endpoint gets a
// separate vertical slot, including parallel edges, reverse edges and self loops.
export function layoutCard(card, edges) {
  const internal = edges.filter((edge) => edge.source === card.node.id && edge.target === card.node.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const rows = new Map();
  let top = 18;
  for (const node of [card.node, ...card.children]) {
    const ports = [];
    for (const edge of internal) {
      if (edge.fromNodeId === node.id) ports.push({ edgeId: edge.id, type: "source" });
      if (edge.toNodeId === node.id) ports.push({ edgeId: edge.id, type: "target" });
    }
    const height = Math.max(72, 60 + ports.length * 24);
    rows.set(node.id, { top, height, ports: ports.map((port, index) => ({ ...port, y: top + 60 + index * 24 })) });
    top += height + 26;
  }
  const routes = internal.map((edge, index) => {
    const sourceY = rows.get(edge.fromNodeId).ports.find((port) => port.edgeId === edge.id && port.type === "source").y;
    const targetY = rows.get(edge.toNodeId).ports.find((port) => port.edgeId === edge.id && port.type === "target").y;
    const railX = 516 + index * 18;
    const direction = Math.sign(targetY - sourceY);
    const label = [edge.type, edge.metadata?.protocol].filter(Boolean).join(" · ");
    return { ...edge, sourceY, targetY, railX, label,
      path: `M 304 ${sourceY} H ${railX - 8} Q ${railX} ${sourceY} ${railX} ${sourceY + direction * 8} V ${targetY - direction * 8} Q ${railX} ${targetY} ${railX - 8} ${targetY} H 308`,
    };
  });
  return { rows, routes, width: internal.length ? 540 + (internal.length - 1) * 18 : 320, height: top - 26 + 18 };
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

export async function autoLayout(model) {
  const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
  const ids = new Set(model.cards.map((card) => card.node.id));
  const result = await new ELK().layout({
    id: "layout",
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": "80", "elk.layered.spacing.nodeNodeBetweenLayers": "130" },
    children: model.cards.map((card) => ({ id: card.node.id, width: card.width, height: card.height })),
    edges: model.edges.filter((edge) => edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] })),
  });
  return new Map(result.children.map((node) => [node.id, { x: node.x + 40, y: node.y + 110 }]));
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
