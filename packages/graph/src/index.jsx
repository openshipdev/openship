"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position } from "reactflow";
import { autoLayout, buildGraph, DEFAULT_FILTERS, gridPositions } from "./model.js";

function ComponentRow({ node, selected, onSelect, onContext, nested = false }) {
  return <div className={`osg-component ${nested ? "osg-nested" : ""} ${selected === node.id ? "osg-selected" : ""}`}>
    <span className={`osg-badge osg-badge-${node.kind.toLowerCase()}`}>{node.kind === "Root" ? "System" : node.kind}</span>
    <Handle type="target" position={Position.Left} id={`in:${node.id}`} isConnectable={false} />
    <Handle type="source" position={Position.Right} id={`out:${node.id}`} isConnectable={false} />
    <button className="osg-name nodrag" aria-pressed={selected === node.id} onClick={() => onSelect?.(node.id)} title={node.name}>{node.name}</button>
    <div className="osg-meta">{node.metadata?.ownership?.replaceAll("_", " ")}{node.metadata?.boundary ? ` · ${String(node.metadata.boundary)}` : ""}</div>
    {onContext && <button className="osg-context nodrag" onClick={() => onContext(node.id)}>Documents & sources ↗</button>}
  </div>;
}

function Card({ data }) {
  return <div className="osg-card"><ComponentRow {...data} />{data.children.map((node) => <ComponentRow key={node.id} {...data} node={node} nested />)}</div>;
}
function Root({ data }) {
  return <div className="osg-root"><ComponentRow {...data} /></div>;
}
const nodeTypes = { component: Card, system: Root };
const groups = [
  ["Edges", [["Runtime", "Runtime"], ["Dataflow", "Dataflow"], ["Dependency", "Dependency"]]],
  ["Ownership", [["first_party", "First-party"], ["third_party", "Third-party"]]],
  ["Boundary", [["internal", "Internal"], ["external", "External"]]],
];

/** Controlled selection; only viewport, filters and temporary layout live here. */
export function SystemGraph({ system, selectedNodeId, onSelectNode, onOpenContext, className = "" }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [positions, setPositions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const flow = useRef(null);
  const shell = useRef(null);
  const generation = useRef(0);
  const model = useMemo(() => buildGraph(system, filters), [system, filters]);
  const defaults = useMemo(() => gridPositions(buildGraph(system).cards), [system]);
  const fit = () => flow.current?.fitView({ padding: 0.12, duration: 200 });

  useEffect(() => { setPositions(null); }, [system]);
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
      // React Flow 11 replaces controlled node internals on every update.
      // Retain our fixed dimensions so selection does not hide nodes while
      // ResizeObserver measures them again. CSS dimensions alone are not enough.
      width: card.width, height: card.height,
      data: { ...card, ...common }, style: { width: card.width, height: card.height },
      draggable: true, selectable: false, extent: [[40, 110], [Infinity, Infinity]],
    }));
    const width = Math.max(500, ...cards.map((card) => card.position.x + card.style.width + 40));
    const height = Math.max(260, ...cards.map((card) => card.position.y + card.style.height + 40));
    return [{ id: system.rootNodeId, type: "system", position: { x: 0, y: 0 }, data: { node: model.root, ...common }, width, height, style: { width, height }, draggable: false, selectable: false, zIndex: -1 }, ...cards];
  }, [model, defaults, positions, selectedNodeId, onSelectNode, onOpenContext, system.rootNodeId]);
  const edges = useMemo(() => model.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
    zIndex: 5, type: "smoothstep", label: [edge.type, edge.metadata?.protocol].filter(Boolean).join(" · "),
    markerEnd: { type: MarkerType.ArrowClosed, color: "#8592a3" },
    style: { stroke: "#8592a3", strokeWidth: 1.5, strokeDasharray: edge.type === "Dependency" ? "5 4" : undefined },
    labelStyle: { fill: "var(--osg-fg)", fontSize: 10 }, labelBgStyle: { fill: "var(--osg-bg)" },
  })), [model]);

  function moveNodes(changes) {
    // Accept only coordinates. Selection, deletion, and structural changes are
    // deliberately excluded from this viewer's local layout state.
    const moves = changes.filter((change) => change.type === "position" && change.position && defaults.has(change.id));
    if (!moves.length) return;
    setPositions((previous) => {
      const next = new Map(previous);
      for (const { id, position } of moves) next.set(id, { x: Math.max(40, position.x), y: Math.max(110, position.y) });
      return next;
    });
  }

  async function arrange() {
    const run = ++generation.current;
    setBusy(true); setError("");
    try {
      const next = await autoLayout(model);
      if (run !== generation.current) return;
      setPositions((previous) => new Map([...(previous ?? []), ...next]));
      setTimeout(() => { if (run === generation.current) fit(); }, 100);
    } catch { if (run === generation.current) setError("Automatic layout failed. The default layout is still available."); }
    finally { if (run === generation.current) setBusy(false); }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
      else await shell.current.requestFullscreen();
    } catch { setError("Fullscreen is unavailable in this browser."); }
  }

  return <section ref={shell} className={`osg ${className}`} aria-label={`${system.name} architecture graph`}>
    <div className="osg-toolbar">{groups.map(([label, options]) => <fieldset key={label}><legend>{label}</legend>{options.map(([key, name]) => <label className="osg-chip" key={key}><input type="checkbox" checked={filters[key]} onChange={() => setFilters((value) => ({ ...value, [key]: !value[key] }))} />{name}</label>)}</fieldset>)}
      <div className="osg-actions"><button onClick={arrange} disabled={busy}>{busy ? "Arranging…" : "Auto layout"}</button><button onClick={toggleFullscreen}>{fullscreen ? "Exit fullscreen" : "Fullscreen"}</button></div>
    </div>
    <div className="osg-canvas"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onInit={(instance) => { flow.current = instance; }} fitView minZoom={0.05} maxZoom={2.5} nodesDraggable onNodesChange={moveNodes} onNodeDragStart={() => { generation.current += 1; setBusy(false); }} nodesConnectable={false} edgesUpdatable={false} edgesFocusable={false} nodesFocusable={false} elementsSelectable={false} deleteKeyCode={null}>
      <Background gap={14} size={1} color="#9aa5b533" /><Controls showInteractive={false} />
    </ReactFlow></div>
    <div className="osg-status" role="status">{error || `${model.included.size} components · ${edges.length} connections · Drag cards to arrange · Scroll to zoom, drag the canvas to pan. Layout changes stay in this viewer.`}{model.cards.length === 0 && " No components match these filters."}</div>
  </section>;
}
