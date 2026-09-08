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
  return { root: byId.get(system.rootNodeId), cards, edges, included };
}

export function gridPositions(cards) {
  const positions = new Map();
  let y = 110;
  for (let i = 0; i < cards.length; i += 3) {
    const row = cards.slice(i, i + 3);
    row.forEach((card, column) => positions.set(card.node.id, { x: 40 + column * 420, y }));
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
