"use client";

import { useMemo } from "react";
import { changeSystemLayer } from "../lib/viewer";

import { filterLayerByDomains } from "@openship/graph/model";

import { SystemGraph } from "@openship/graph";

export default function SystemView({ snapshot, selection, onChange }) {
  const { system: design } = snapshot;
  const layer =
    design.layers.find((item) => item.id === selection.layer) ??
    design.layers[0];
  const instance = design.instances?.find(
    (item) => item.id === selection.instance && item.layerId === layer.id,
  );
  const filtered = useMemo(
    () => filterLayerByDomains(layer, design.domains, selection.hiddenDomains),
    [layer, design.domains, selection.hiddenDomains],
  );
  const system = useMemo(
    () => ({ ...filtered, context: design.context }),
    [filtered, design.context],
  );
  const toggleDomain = (id) => {
    const hidden = new Set(selection.hiddenDomains ?? []);
    if (hidden.has(id)) hidden.delete(id);
    else hidden.add(id);
    const hiddenDomains = [...hidden];
    const visible = filterLayerByDomains(layer, design.domains, hiddenDomains);
    onChange({
      hiddenDomains,
      node: visible.nodes.some((node) => node.id === selection.node)
        ? selection.node
        : layer.rootNodeId,
    });
  };
  const graph = useMemo(
    () => ({
      ...filtered,
      nodes: filtered.nodes.map((node) => ({
        ...node,
        instanceBinding: instance?.bindings.find(
          (binding) => binding.nodeId === node.id,
        ),
      })),
    }),
    [filtered, instance],
  );
  const switchLayer = (id) =>
    onChange(changeSystemLayer(design, selection, id));
  const selectNode = (node) => onChange({ node });
  const domainFilter =
    design.domains?.length > 0 ? (
      <fieldset>
        <legend>Domains</legend>
        {design.domains.map((domain) => (
          <label
            className="osg-chip"
            key={domain.id}
            title={domain.description}
          >
            <input
              type="checkbox"
              checked={!selection.hiddenDomains?.includes(domain.id)}
              onChange={() => toggleDomain(domain.id)}
            />
            {domain.name}
          </label>
        ))}
      </fieldset>
    ) : null;
  const toolbarControls = (
    <>
      {domainFilter}
      <div className="osg-select-controls">
        <label className="osg-select">
          Design layer{" "}
          <select
            value={layer.id}
            onChange={(e) => switchLayer(e.target.value)}
          >
            {design.layers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.role}
              </option>
            ))}
          </select>
        </label>
        <label className="osg-select">
          Instance{" "}
          <select
            value={instance?.id ?? ""}
            onChange={(e) => {
              const target = design.instances?.find(
                (item) => item.id === e.target.value,
              );
              onChange(
                target
                  ? {
                      ...changeSystemLayer(design, selection, target.layerId),
                      instance: target.id,
                    }
                  : { instance: "" },
              );
            }}
          >
            <option value="">Design only</option>
            {(design.instances ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.environment}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
  return (
    <div>
      {instance && (
        <p className="viewer-muted">
          Supplied instance description: {instance.name}. Resource bindings are
          not verified live inventory.
        </p>
      )}
      <p className="viewer-muted">
        {system.name} · {system.nodes.length} components · {system.edges.length}{" "}
        connections. This describes the provider’s design, not live service
        health.
      </p>
      <div className="viewer-system-zone">
        <div className="viewer-system-panel">
          <SystemGraph
            key={system.id}
            toolbarControls={toolbarControls}
            system={graph}
            selectedNodeId={selection.node}
            onSelectNode={selectNode}
          />
        </div>
      </div>
    </div>
  );
}
