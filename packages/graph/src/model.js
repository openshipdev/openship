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
