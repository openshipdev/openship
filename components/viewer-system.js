"use client";

import { useMemo, useState } from "react";
import { layoutSystem, nodeSourceFiles } from "../lib/viewer";

const label = (value) => typeof value === "string" ? value : JSON.stringify(value);

function Metadata({ value }) {
  if (!value || !Object.keys(value).length) return null;
  return <dl className="viewer-metadata">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{label(item)}</dd></div>)}</dl>;
}

function Architecture({ system, selected, onSelect }) {
  const layout = useMemo(() => layoutSystem(system), [system]);
  const [zoom, setZoom] = useState(1);
  return <section aria-label="Architecture diagram">
    <div className="viewer-toolbar"><p>Containment by host and container. Select a component to inspect it.</p><button onClick={() => setZoom((z) => Math.max(0.5, (z || 1) - 0.25))} aria-label="Zoom out">−</button><output aria-label="Zoom">{zoom ? `${Math.round(zoom * 100)}%` : "Fit"}</output><button onClick={() => setZoom((z) => Math.min(3, (z || 1) + 0.25))} aria-label="Zoom in">+</button><button onClick={() => setZoom(0)}>Fit to view</button></div>
    <div className="viewer-diagram" tabIndex={0} aria-label="Scrollable system diagram">
      <svg role="group" aria-labelledby="architecture-title architecture-description" viewBox={`0 0 ${layout.width} ${layout.height}`} style={{ width: `${(zoom || 1) * 100}%`, minWidth: zoom ? `${740 * zoom}px` : 0 }}>
        <title id="architecture-title">{system.name} architecture</title><desc id="architecture-description">Hosts contain processes and containers. Libraries are listed at the root for display only. Each component is a keyboard-accessible button; a component selector and connection table follow.</desc>
        {layout.boxes.map(({ node, x, y, width, height, depth }) => <g key={node.id} role="button" tabIndex={0} aria-label={`${node.name}, ${node.kind}, ${node.metadata.ownership.replaceAll("_", " ")}`} aria-pressed={selected === node.id} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(node.id); } }} className={`viewer-node ${selected === node.id ? "selected" : ""}`}>
          <title>{node.name} · {node.kind} · {label(node.metadata.availability ?? node.metadata.legacy ?? "")}</title>
          <rect x={x} y={y} width={width} height={height} rx={6} className={depth % 2 ? "alternate" : ""} />
          <text x={x + 12} y={y + 23}>{node.name.length > (depth ? 31 : 100) ? `${node.name.slice(0, depth ? 28 : 97)}…` : node.name}</text>
          <text className="viewer-node-kind" x={x + 12} y={y + 44}>{node.kind} · {node.metadata.ownership === "first_party" ? "first party" : "third party"}</text>
          {(node.metadata.availability || node.metadata.legacy) && <text className="viewer-node-kind" x={x + 12} y={y + 60}>{node.metadata.availability ? "Conditional / optional" : "Includes legacy paths"}</text>}
        </g>)}
      </svg>
    </div>
  </section>;
}

function Connections({ system, onSelect }) {
  const [type, setType] = useState("");
  const [component, setComponent] = useState("");
  const nodes = new Map(system.nodes.map((node) => [node.id, node]));
  const edges = system.edges.filter((edge) => (!type || edge.type === type) && (!component || edge.fromNodeId === component || edge.toNodeId === component));
  return <section aria-label="System connections">
    <div className="viewer-toolbar"><label>Connection type <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{["Runtime", "Dataflow", "Dependency"].map((item) => <option key={item}>{item}</option>)}</select></label><label>Component <select value={component} onChange={(e) => setComponent(e.target.value)}><option value="">All components</option>{system.nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label></div>
    <div className="viewer-table-scroll"><table><caption>{edges.length} connections. Arrows run from caller or producer to target.</caption><thead><tr><th>From</th><th>Type</th><th>To</th><th>Details</th></tr></thead><tbody>{edges.map((edge) => <tr key={edge.id}><td><button className="viewer-text-button" onClick={() => onSelect(edge.fromNodeId)}>{nodes.get(edge.fromNodeId)?.name}</button></td><td>{edge.type}</td><td><button className="viewer-text-button" onClick={() => onSelect(edge.toNodeId)}>{nodes.get(edge.toNodeId)?.name}</button></td><td><Metadata value={edge.metadata} /></td></tr>)}</tbody></table></div>
    {!edges.length && <p>No connections match these filters.</p>}
  </section>;
}

function Context({ system, selected, onSource }) {
  const [concern, setConcern] = useState("");
  const context = system.context;
  if (!context) return <p>This provider includes no optional design context.</p>;
  const documents = new Map((context.documents ?? []).map((doc) => [doc.hash, doc]));
  const assignments = (context.matrix ?? []).filter((item) => item.nodeId === selected && (!concern || item.concern === concern));
  const artifacts = (context.artifacts ?? []).filter((item) => item.nodeId === selected && (!concern || item.concern === concern));
  const prompts = selected === system.rootNodeId ? context.systemPromptRefs ?? [] : [];
  const documentView = (hash) => {
    const doc = documents.get(hash);
    return doc && <article className="viewer-context-card" key={hash}><h4>{doc.title}</h4><p className="viewer-muted">{doc.kind} · {doc.language}</p><pre className="viewer-prose">{doc.text}</pre><details><summary>Document metadata</summary><Metadata value={Object.fromEntries(Object.entries(doc).filter(([key]) => !["text", "title"].includes(key)))} /></details></article>;
  };
  return <section aria-label="Design context">
    <label>Concern <select value={concern} onChange={(e) => setConcern(e.target.value)}><option value="">All concerns</option>{(context.concerns ?? []).map((name) => <option key={name}>{name}</option>)}</select></label>
    {assignments.map((item, index) => <section key={`${item.concern}-${index}`}><h3>{item.concern}</h3>{[...(item.documentRefs ?? []), ...(item.skillRefs ?? [])].map(documentView)}</section>)}
    {prompts.length > 0 && <section><h3>Root system prompts</h3><p>Published documents for inspection; this viewer does not execute prompts.</p>{prompts.map(documentView)}</section>}
    {artifacts.map((artifact) => <article className="viewer-context-card" key={artifact.id}><h3>{artifact.concern} · {artifact.type}</h3>{artifact.type === "Code" ? <ul>{artifact.sourcePaths.map((path) => <li key={path}><button className="viewer-text-button" onClick={() => onSource(path)}>{path}</button></li>)}</ul> : <pre className="viewer-prose">{artifact.text}</pre>}</article>)}
    {!assignments.length && !artifacts.length && !prompts.length && <p>No context is assigned to this component and concern.</p>}
    <details><summary>All shared context documents ({documents.size})</summary>{[...documents.keys()].map(documentView)}</details>
    <details><summary>Additional context metadata</summary><Metadata value={Object.fromEntries(Object.entries(context).filter(([key]) => !["concerns", "documents", "matrix", "artifacts", "systemPromptRefs"].includes(key)))} /></details>
  </section>;
}

export default function SystemView({ snapshot, selection, onChange }) {
  const { system, verified } = snapshot;
  const selected = system.nodes.find((node) => node.id === selection.node);
  const sourceFiles = nodeSourceFiles(selected, verified.files);
  const selectNode = (node) => onChange({ node });
  const openSource = (file) => onChange({ view: "sources", file });
  return <div>
    <div className="viewer-tabs" aria-label="System views">{["architecture", "connections", "context"].map((panel) => <button key={panel} aria-pressed={selection.panel === panel} onClick={() => onChange({ panel })}>{panel[0].toUpperCase() + panel.slice(1)}</button>)}</div>
    <p className="viewer-muted">{system.name} · {system.nodes.length} components · {system.edges.length} connections. This describes the provider’s design, not live service health.</p>
    <label className="viewer-component-picker">Component <select value={selection.node} onChange={(e) => selectNode(e.target.value)}>{system.nodes.map((node) => <option key={node.id} value={node.id}>{node.name} ({node.kind})</option>)}</select></label>
    {selection.panel === "architecture" && <Architecture system={system} selected={selection.node} onSelect={selectNode} />}
    {selection.panel === "connections" && <Connections system={system} onSelect={selectNode} />}
    {selection.panel === "context" && <Context key={system.id} system={system} selected={selection.node} onSource={openSource} />}
    <aside className="viewer-node-details" aria-label="Selected component" aria-live="polite"><h3>{selected.name}</h3><p>{selected.kind} · {selected.id}{selected.parentId ? ` · Parent: ${selected.parentId}` : ""}</p><Metadata value={selected.metadata} /><details><summary>Additional node properties</summary><Metadata value={Object.fromEntries(Object.entries(selected).filter(([key]) => !["id", "name", "kind", "parentId", "metadata", "sourceSelectors"].includes(key)))} /></details>
      {selected.sourceSelectors?.length > 0 && <><h4>Source selectors</h4><ul>{selected.sourceSelectors.map((path) => <li key={path}><code>{path}</code></li>)}</ul><details><summary>Matching source files ({sourceFiles.length})</summary><ul className="viewer-source-links">{sourceFiles.map(({ metadata }) => <li key={metadata.path}><button className="viewer-text-button" onClick={() => openSource(metadata.path)}>{metadata.path}</button></li>)}</ul></details></>}
    </aside><details><summary>System metadata</summary><Metadata value={system.metadata} /></details>
  </div>;
}
