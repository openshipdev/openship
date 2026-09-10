"use client";

import { useMemo, useState } from "react";
import { changeSystemLayer, nodeSourceFiles } from "../lib/viewer";

import { filterLayerByDomains } from "@openship/graph/model";

import { SystemGraph } from "@openship/graph";

const label = (value) => typeof value === "string" ? value : JSON.stringify(value);

function Metadata({ value }) {
  if (!value || !Object.keys(value).length) return null;
  return <dl className="viewer-metadata">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{label(item)}</dd></div>)}</dl>;
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
    {prompts.length > 0 && <section><h3>System prompts</h3><p>Published documents for inspection; this viewer does not execute prompts.</p>{prompts.map(documentView)}</section>}
    {artifacts.map((artifact) => <article className="viewer-context-card" key={artifact.id}><h3>{artifact.concern} · {artifact.type}</h3>{artifact.type === "Code" ? <ul>{artifact.sourcePaths.map((path) => <li key={path}><button className="viewer-text-button" onClick={() => onSource(path)}>{path}</button></li>)}</ul> : <pre className="viewer-prose">{artifact.text}</pre>}</article>)}
    {!assignments.length && !artifacts.length && !prompts.length && <p>No context is assigned to this component and concern.</p>}
    <details><summary>All shared context documents ({documents.size})</summary>{[...documents.keys()].map(documentView)}</details>
    <details><summary>Additional context metadata</summary><Metadata value={Object.fromEntries(Object.entries(context).filter(([key]) => !["concerns", "documents", "matrix", "artifacts", "systemPromptRefs"].includes(key)))} /></details>
  </section>;
}

function Configuration({ entries }) {
  if (!entries?.length) return <p className="viewer-muted">No configuration supplied.</p>;
  return <dl className="viewer-metadata">{entries.map((entry) => <div key={entry.name}><dt>{entry.name}{entry.required ? " (required)" : ""}</dt><dd><p>{entry.description}</p>{entry.secretRef ? `Secret reference: ${entry.secretRef.nodeId} / ${entry.secretRef.key} (unresolved)` : Object.hasOwn(entry, "value") ? label(entry.value) : "Unresolved"}</dd></div>)}</dl>;
}

export default function SystemView({ snapshot, selection, onChange }) {
  const { system: design, verified } = snapshot;
  const layer = design.layers.find((item) => item.id === selection.layer) ?? design.layers[0];
  const instance = design.instances?.find((item) => item.id === selection.instance && item.layerId === layer.id);
  const filtered = useMemo(() => filterLayerByDomains(layer, design.domains, selection.hiddenDomains), [layer, design.domains, selection.hiddenDomains]);
  const system = useMemo(() => ({ ...filtered, context: design.context }), [filtered, design.context]);
  const toggleDomain = (id) => {
    const hidden = new Set(selection.hiddenDomains ?? []);
    if (hidden.has(id)) hidden.delete(id); else hidden.add(id);
    const hiddenDomains = [...hidden];
    const visible = filterLayerByDomains(layer, design.domains, hiddenDomains);
    onChange({ hiddenDomains, node: visible.nodes.some((node) => node.id === selection.node) ? selection.node : layer.rootNodeId });
  };
  const graph = useMemo(() => ({ ...filtered, nodes: filtered.nodes.map((node) => ({ ...node, instanceBinding: instance?.bindings.find((binding) => binding.nodeId === node.id) })) }), [filtered, instance]);
  const binding = instance?.bindings.find((item) => item.nodeId === selection.node);
  const switchLayer = (id) => onChange(changeSystemLayer(design, selection, id));
  const follow = (nodeId) => {
    const target = design.layers.find((item) => item.nodes.some((node) => node.id === nodeId));
    onChange({ layer: target.id, node: nodeId, instance: "" });
  };
  const related = (direction) => [...new Set(design.refinements.filter((ref) => ref[direction === "implements" ? "fromNodeId" : "toNodeId"] === selection.node).map((ref) => ref[direction === "implements" ? "toNodeId" : "fromNodeId"]))];
  const mappings = (direction, title) => <section><h4>{title}</h4>{related(direction).length ? related(direction).map((id) => {
    const target = design.layers.find((item) => item.nodes.some((node) => node.id === id));
    return <p key={id}><button className="viewer-text-button" disabled={!filterLayerByDomains(target, design.domains, selection.hiddenDomains).nodes.some((node) => node.id === id)} onClick={() => follow(id)}>{target.nodes.find((node) => node.id === id).name} · {target.name} →</button></p>;
  }) : <p className="viewer-muted">No mapping supplied.</p>}</section>;
  const selected = system.nodes.find((node) => node.id === selection.node);
  const sourceFiles = nodeSourceFiles(selected, verified.files);
  const selectNode = (node) => onChange({ node });
  const openSource = (file) => onChange({ view: "sources", file });
  return <div>
    {design.domains?.length > 0 && <fieldset className="viewer-domain-filter"><legend>Domains</legend><div>{design.domains.map((domain) => <label key={domain.id} title={domain.description}><input type="checkbox" checked={!selection.hiddenDomains?.includes(domain.id)} onChange={() => toggleDomain(domain.id)} />{domain.name}</label>)}</div><p className="viewer-muted">Shared blocks remain visible while any of their domains is selected. Blocks with no domain remain visible; parent boundaries are kept for visible blocks.</p></fieldset>}
    <div className="viewer-toolbar"><label>Design layer <select value={layer.id} onChange={(e) => switchLayer(e.target.value)}>{design.layers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
    <label>Instance <select value={instance?.id ?? ""} onChange={(e) => {
      const target = design.instances?.find((item) => item.id === e.target.value);
      onChange(target ? { ...changeSystemLayer(design, selection, target.layerId), instance: target.id } : { instance: "" });
    }}><option value="">Design only</option>{(design.instances ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.environment}</option>)}</select></label></div>
    {instance && <p className="viewer-muted">Supplied instance description: {instance.name}. Resource bindings are not verified live inventory.</p>}
    <div className="viewer-tabs" aria-label="System views">{["architecture", "connections", "context"].map((panel) => <button key={panel} aria-pressed={selection.panel === panel} onClick={() => onChange({ panel })}>{panel[0].toUpperCase() + panel.slice(1)}</button>)}</div>
    <p className="viewer-muted">{system.name} · {system.nodes.length} components · {system.edges.length} connections. This describes the provider’s design, not live service health.</p>
    <label className="viewer-component-picker">Component <select value={selection.node} onChange={(e) => selectNode(e.target.value)}>{system.nodes.map((node) => <option key={node.id} value={node.id}>{node.name} ({node.kind})</option>)}</select></label>
    {selection.panel === "architecture" && <SystemGraph key={system.id} system={graph} selectedNodeId={selection.node} onSelectNode={selectNode} onOpenContext={(node) => onChange({ node, panel: "context" })} />}
    {selection.panel === "connections" && <Connections key={system.id} system={system} onSelect={selectNode} />}
    {selection.panel === "context" && <Context key={system.id} system={system} selected={selection.node} onSource={openSource} />}
    <aside className="viewer-node-details" aria-label="Selected component" aria-live="polite"><h3>{selected.name}</h3><p>{selected.kind} · {selected.id}{selected.parentId ? ` · Parent: ${selected.parentId}` : ""}</p><Metadata value={selected.metadata} />
      {design.domains?.length > 0 && <p>Domains: {design.domains.filter((domain) => domain.nodeIds.includes(selected.id)).map((domain) => domain.name).join(", ") || "None"}</p>}
      <h4>Intended configuration</h4><Configuration entries={selected.configuration} />
      {instance && <section><h4>Instance binding</h4><p>Resource: {binding?.resourceId ?? "Unresolved"}</p><Configuration entries={binding?.configuration} />{selected.kind === "Store" && <><h4>Database instance state</h4>{binding?.state ? <Metadata value={binding.state} /> : <p>Not supplied. No database records are included.</p>}</>}</section>}
      {mappings("implements", "Implements")}{mappings("implementedBy", "Implemented by")}
      <details><summary>Additional node properties</summary><Metadata value={Object.fromEntries(Object.entries(selected).filter(([key]) => !["id", "name", "kind", "parentId", "metadata", "sourceSelectors", "configuration"].includes(key)))} /></details>
      {selected.sourceSelectors?.length > 0 && <><h4>Source selectors</h4><ul>{selected.sourceSelectors.map((path) => <li key={path}><code>{path}</code></li>)}</ul><details><summary>Matching source files ({sourceFiles.length})</summary><ul className="viewer-source-links">{sourceFiles.map(({ metadata }) => <li key={metadata.path}><button className="viewer-text-button" onClick={() => openSource(metadata.path)}>{metadata.path}</button></li>)}</ul></details></>}
    </aside><details><summary>System metadata</summary><Metadata value={design.metadata} /></details>
  </div>;
}
