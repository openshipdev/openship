"use client";

import { useMemo } from "react";
import { changeSystemLayer, nodeSourceFiles } from "../lib/viewer";

import { filterLayerByDomains } from "@openship/graph/model";

import { SystemGraph } from "@openship/graph";

const label = (value) => typeof value === "string" ? value : JSON.stringify(value);

function Metadata({ value }) {
  if (!value || !Object.keys(value).length) return null;
  return <dl className="viewer-metadata">{Object.entries(value).map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{label(item)}</dd></div>)}</dl>;
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
  const domainFilter = design.domains?.length > 0 ? <fieldset><legend>Domains</legend>{design.domains.map((domain) => <label className="osg-chip" key={domain.id} title={domain.description}><input type="checkbox" checked={!selection.hiddenDomains?.includes(domain.id)} onChange={() => toggleDomain(domain.id)} />{domain.name}</label>)}</fieldset> : null;
  const toolbarControls = <>
    {domainFilter}
    <div className="osg-select-controls">
    <label className="osg-select">Design layer <select value={layer.id} onChange={(e) => switchLayer(e.target.value)}>{design.layers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
    <label className="osg-select">Instance <select value={instance?.id ?? ""} onChange={(e) => {
      const target = design.instances?.find((item) => item.id === e.target.value);
      onChange(target ? { ...changeSystemLayer(design, selection, target.layerId), instance: target.id } : { instance: "" });
    }}><option value="">Design only</option>{(design.instances ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.environment}</option>)}</select></label>
    </div>
  </>;
  return <div>
    {instance && <p className="viewer-muted">Supplied instance description: {instance.name}. Resource bindings are not verified live inventory.</p>}
    <p className="viewer-muted">{system.name} · {system.nodes.length} components · {system.edges.length} connections. This describes the provider’s design, not live service health.</p>
    <div className="viewer-system-zone">
      <div className="viewer-system-panel">
        <SystemGraph key={system.id} toolbarControls={toolbarControls} system={graph} selectedNodeId={selection.node} onSelectNode={selectNode} />
      </div>
    </div>
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
