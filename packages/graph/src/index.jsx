"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ReactFlow, Background, BaseEdge, Controls, Handle, MarkerType, Position } from "@xyflow/react";
import { autoLayout, buildGraph, connectionLabel, DEFAULT_FILTERS, gridPositions, invalidateRoutes, updateMeasurements } from "./model.js";

function ComponentRow({ node, selected, onSelect, onContext, nested = false, row }) {
  return <div className={`osg-component ${nested ? "osg-nested" : ""} ${selected === node.id ? "osg-selected" : ""}`} style={row ? { position: "absolute", top: row.top, left: row.left, width: 288, height: row.height } : undefined}>
    <span className={`osg-badge osg-badge-${node.kind.toLowerCase()}`}>{node.kind === "Root" ? "System" : node.kind}</span>
    <Handle type="target" position={Position.Left} id={`in:${node.id}`} isConnectable={false} />
    <Handle type="source" position={Position.Right} id={`out:${node.id}`} isConnectable={false} />
    <button className="osg-name nodrag" aria-pressed={selected === node.id} onClick={() => onSelect?.(node.id)} title={node.name}>{node.name}</button>
    <div className="osg-meta">{node.instanceBinding ? `Instance: ${node.instanceBinding.resourceId ?? "unresolved"} · ` : ""}{node.metadata?.ownership?.replaceAll("_", " ")}{node.metadata?.boundary ? ` · ${String(node.metadata.boundary)}` : ""}</div>
    {onContext && <button className="osg-context nodrag" onClick={() => onContext(node.id)}>Documents & sources ↗</button>}
  </div>;
}

function Card({ data }) {
  const markerId = `osg-arrow-${useId().replaceAll(":", "")}`;
  return <div className="osg-card">
    <ComponentRow {...data} row={data.rows.get(data.node.id)} />
    {data.children.map((node) => <ComponentRow key={node.id} {...data} node={node} row={data.rows.get(node.id)} nested />)}
    {data.routes.length > 0 && <svg className="osg-internal-connections" width={data.width} height={data.height} aria-label="Connections within this host">
      <defs><marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 Z" fill="var(--osg-muted)" /></marker></defs>
      {data.routes.map((route) => <g key={route.id}>
        <title>{`${route.fromNodeId} → ${route.toNodeId}: ${route.label}`}</title>
        <path className="osg-internal-path" d={route.path} markerEnd={`url(#${markerId})`} strokeDasharray={route.type === "Dependency" ? "5 4" : undefined} />
      </g>)}
      {data.routes.map((route) => <foreignObject key={route.id} x={route.labelX} y={route.labelY - 10} width={route.labelWidth} height="20"><div className="osg-internal-labels"><div className="osg-internal-label" title={route.label}>{route.label}</div></div></foreignObject>)}
    </svg>}
  </div>;
}
function Root({ data }) {
  return <div className="osg-root"><ComponentRow {...data} /></div>;
}
const nodeTypes = { component: Card, system: Root };
function RoutedEdge({ id, data, markerEnd, style, label, labelStyle, labelBgStyle }) {
  const { route } = data;
  return <BaseEdge id={id} path={route.path} markerEnd={markerEnd} style={style}
    label={label} labelX={route.label ? route.label.x + route.label.width / 2 : undefined}
    labelY={route.label ? route.label.y + route.label.height / 2 : undefined}
    labelStyle={labelStyle} labelBgStyle={labelBgStyle} labelBgPadding={[6, 5]} />;
}
const edgeTypes = { routed: RoutedEdge };
const emptyLayout = () => ({ positions: null, routes: new Map(), model: null });
const groups = [
  ["Edges", [["Runtime", "Runtime"], ["Dataflow", "Dataflow"], ["Dependency", "Dependency"]]],
  ["Ownership", [["first_party", "First-party"], ["third_party", "Third-party"]]],
  ["Boundary", [["internal", "Internal"], ["external", "External"]]],
];

/** Controlled selection; only viewport, filters and temporary layout live here. */
export function SystemGraph({ system, selectedNodeId, onSelectNode, onOpenContext, toolbarControls, className = "" }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [layout, setLayout] = useState(emptyLayout);
  const [undo, setUndo] = useState(null);
  const { positions } = layout;
  const [measurements, setMeasurements] = useState(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const flow = useRef(null);
  const shell = useRef(null);
  const generation = useRef(0);
  const model = useMemo(() => buildGraph(system, filters), [system, filters]);
  const defaults = useMemo(() => gridPositions(buildGraph(system).cards), [system]);
  const fit = () => flow.current?.fitView({ padding: 0.12, duration: 200 });

  useEffect(() => { setLayout(emptyLayout()); setUndo(null); setMeasurements(new Map()); }, [system]);
  useEffect(() => {
    generation.current += 1;
    setBusy(false); setError("");
    const timer = setTimeout(() => flow.current?.fitView({ padding: 0.12 }), 100);
    return () => { generation.current += 1; clearTimeout(timer); };
  }, [model]);
  useEffect(() => {
    const update = () => {
      setFullscreen(document.fullscreenElement === shell.current);
      requestAnimationFrame(() => flow.current?.fitView({ padding: 0.12, duration: 200 }));
    };
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const nodes = useMemo(() => {
    const common = { selected: selectedNodeId, onSelect: onSelectNode, onContext: onOpenContext };
    const cards = model.cards.map((card) => ({
      id: card.node.id, type: "component", position: positions?.get(card.node.id) ?? defaults.get(card.node.id),
      // Explicit dimensions define the fixed card size in React Flow 12.
      // Keep them stable across selection and local layout updates.
      width: card.width, height: card.height, measured: measurements.get(card.node.id),
      data: { ...card, ...common }, style: { width: card.width, height: card.height },
      draggable: true, selectable: false, extent: [[40, 110], [Infinity, Infinity]],
    }));
    // Feedback edges and their labels can extend beyond the outermost card.
    let width = Math.max(500, ...cards.map((card) => card.position.x + card.style.width + 40));
    let height = Math.max(260, ...cards.map((card) => card.position.y + card.style.height + 40));
    if (layout.model === model) for (const route of layout.routes.values()) {
      for (const point of route.points) { width = Math.max(width, point.x + 40); height = Math.max(height, point.y + 40); }
      if (route.label) {
        width = Math.max(width, route.label.x + route.label.width + 40);
        height = Math.max(height, route.label.y + route.label.height + 40);
      }
    }
    return [{ id: system.rootNodeId, type: "system", position: { x: 0, y: 0 }, data: { node: model.root, ...common }, width, height, measured: measurements.get(system.rootNodeId), style: { width, height }, draggable: false, selectable: false, zIndex: -1 }, ...cards];
  }, [model, defaults, layout, positions, measurements, selectedNodeId, onSelectNode, onOpenContext, system.rootNodeId]);
  const edges = useMemo(() => model.edges.filter((edge) => edge.source !== edge.target || edge.source === system.rootNodeId).map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
    zIndex: 5, type: layout.model === model && layout.routes.has(edge.id) ? "routed" : "smoothstep",
    data: { route: layout.model === model ? layout.routes.get(edge.id) : undefined }, label: connectionLabel(edge),
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8592a3" },
    style: { stroke: "#8592a3", strokeWidth: 1.5, strokeDasharray: edge.type === "Dependency" ? "5 4" : undefined },
    labelStyle: { fill: "var(--osg-fg)", fontSize: 10, fontFamily: "system-ui, sans-serif" }, labelBgStyle: { fill: "var(--osg-bg)" },
  })), [model, system.rootNodeId, layout]);

  function moveNodes(changes) {
    // Retain v12 measurements so controlled updates preserve handle bounds.
    setMeasurements((previous) => updateMeasurements(previous, changes));
    // Accept only coordinates. Selection, deletion, and structural changes are
    // deliberately excluded from this viewer's local layout state.
    const moves = changes.filter((change) => change.type === "position" && change.position && defaults.has(change.id));
    if (!moves.length) return;
    generation.current += 1;
    setBusy(false);
    setLayout((previous) => {
      const next = new Map(previous.positions);
      const movedCards = [];
      for (const { id, position } of moves) {
        const point = { x: Math.max(40, position.x), y: Math.max(110, position.y) };
        next.set(id, point);
        const card = model.cards.find((card) => card.node.id === id);
        if (card) movedCards.push({ id, ...point, width: card.width, height: card.height });
      }
      return { positions: next, model, routes: invalidateRoutes(previous.model === model ? previous.routes : new Map(), model.edges, movedCards) };
    });
  }

  async function arrange() {
    const run = ++generation.current;
    setBusy(true); setError("");
    try {
      const context = document.createElement("canvas").getContext("2d");
      if (context) context.font = "10px system-ui, sans-serif";
      const next = await autoLayout(model, context ? (text) => context.measureText(text).width : undefined);
      if (run !== generation.current) return;
      setUndo(layout);
      setLayout({ positions: new Map([...(positions ?? []), ...next.positions]), routes: next.routes, model });
      setTimeout(() => { if (run === generation.current) fit(); }, 100);
    } catch { if (run === generation.current) setError("Automatic layout failed. The default layout is still available."); }
    finally { if (run === generation.current) setBusy(false); }
  }
  function undoLayout() {
    if (!undo) return;
    const run = ++generation.current;
    setBusy(false); setError("");
    setLayout(undo); setUndo(null);
    setTimeout(() => { if (run === generation.current) fit(); }, 100);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
      else await shell.current.requestFullscreen();
    } catch { setError("Fullscreen is unavailable in this browser."); }
  }

  return <section ref={shell} className={`osg ${className}`} aria-label={`${system.name} architecture graph`}>
    <div className="osg-toolbar">{groups.map(([label, options]) => <fieldset key={label}><legend>{label}</legend>{options.map(([key, name]) => <label className="osg-chip" key={key}><input type="checkbox" checked={filters[key]} onChange={() => setFilters((value) => ({ ...value, [key]: !value[key] }))} />{name}</label>)}</fieldset>)}
      <div className="osg-actions"><button onClick={arrange} disabled={busy}>{busy ? "Arranging…" : "Auto layout"}</button><button onClick={undoLayout} disabled={!undo || busy}>Undo layout</button><button onClick={toggleFullscreen}>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</button></div>
      {toolbarControls && <div className="osg-toolbar-controls">{toolbarControls}</div>}
    </div>
    <div className="osg-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onInit={(instance) => { flow.current = instance; }} fitView minZoom={0.05} maxZoom={2.5} nodesDraggable onNodesChange={moveNodes} onNodeDragStart={() => { generation.current += 1; setBusy(false); }} nodesConnectable={false} edgesReconnectable={false} edgesFocusable={false} nodesFocusable={false} elementsSelectable={false} deleteKeyCode={null}>
      <Background gap={14} size={1} color="#9aa5b533" /><Controls showInteractive={false} />
    </ReactFlow></div>
    <div className="osg-status" role="status">{error || `${model.included.size} components · ${model.edges.length} connections · Drag cards to arrange · Scroll to zoom, drag the canvas to pan. Layout changes stay in this viewer.`}{model.cards.length === 0 && " No components match these filters."}</div>
  </section>;
}
