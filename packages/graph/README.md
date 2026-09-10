# @openship/graph

A standalone React graph viewer for validated OpenShip Systems. Its topology UX
is adapted from anticlodex: a dotted pan/zoom canvas, system boundary, host cards
with nested components, kind badges, directed connections, filters, automatic
layout, and fullscreen. It has no Next.js, authentication, network, or application
state dependency. anticlodex is not a runtime dependency.

```jsx
import { SystemGraph } from '@openship/graph';
import '@openship/graph/styles.css';

<SystemGraph
  system={validatedDocument.system.layers[0]}
  selectedNodeId={selectedNodeId}
  onSelectNode={setSelectedNodeId}
  onOpenContext={(nodeId) => openInspector(nodeId)}
/>
```

`system` takes one validated Systems 2.0 layer and must be validated before rendering.
`selectedNodeId`, `onSelectNode`, `onOpenContext`, `toolbarControls`, and `className` are optional.
`toolbarControls` accepts controls rendered in a full-width row below the built-in filters, including in fullscreen.
The caller owns selection and navigation; the package owns temporary filters and
layout. Drag host and library cards to reposition them; nested components move
with their host. Positions survive filter changes while the graph is mounted and
reset when the viewer is reloaded. Only coordinates can change: connections,
containment, documents, and source content remain read-only. Layout never changes
the supplied document. React and React DOM 19 are
peer dependencies. Consumers must support JSX and CSS imports (including the
React Flow stylesheet imported by this package).

Filters retain ancestors of matching nodes. Boundary metadata is optional in
OpenShip; nodes without it remain visible regardless of boundary filters.
All non-root nodes have a parent in their layer. Blocks and stores can be direct root children; libraries use the same containment rules. Edges connect
to the original nested component's handle. Dependency edges are dashed. The connections table in openship provides alternative navigation to the canvas.

Theme with `--osg-bg`, `--osg-fg`, `--osg-muted`, `--osg-border`, and
`--osg-surface` on your own `className`. A dark palette follows an ancestor's
`data-theme="dark"`. The canvas is 640px high by default and expands in fullscreen.

Run `pnpm --filter @openship/graph test` from the workspace root.
This package is private while the API settles. Before publishing, finalize its
license, public API/types, and compiled distribution; remove `private` only when
ready for release.

The caller owns layer and instance selection. It may annotate each node with an optional `instanceBinding` (resource ID/configuration/state) for display; this is renderer input, not a protocol mutation. Shared context and refinement navigation belong to the caller.

Use `filterLayerByDomains(layer, domains, hiddenDomainIds)` from `@openship/graph/model` to project a layer before rendering it. An empty hidden list shows all domains. Shared nodes remain visible if any of their domains is enabled; unassigned nodes remain visible. Required ancestors remain as boundaries, while connections to filtered-out endpoints are removed. The helper preserves the original document. The OpenShip viewer uses the same projection for its graph and connection list, and stores hidden domain IDs in repeated `hideDomain` URL parameters.
