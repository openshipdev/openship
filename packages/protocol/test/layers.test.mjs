import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { validateSystems } from '../src/index.js';
const fixture = JSON.parse(await readFile(new URL('../../../skills/openship/references/examples/valid/systems-layered.json', import.meta.url)));
const fresh = () => structuredClone(fixture);

test('layered model preserves unresolved bindings, context and store state without resolving references', () => {
  const value = fresh();
  assert.equal(validateSystems(value), value);
  assert.equal(value.system.instances[0].bindings[1].resourceId, undefined);
  assert.equal(value.system.instances[0].bindings[1].state.appliedMigration, '001.sql');
});
test('supports any positive number of layers, custom and repeated roles, many-to-many and skipped refinements', () => {
  const value = fresh();
  value.system.layers[0].role = 'custom';
  value.system.layers[2].role = 'technical';
  value.system.refinements.push({ id: 'split', fromNodeId: 'provider.web', toNodeId: 'logical.data' }, { id: 'combined', fromNodeId: 'provider.data', toNodeId: 'logical.data' });
  validateSystems(value);
  value.system.layers = [value.system.layers[1]];
  value.system.refinements = []; value.system.instances = []; delete value.system.domains;
  validateSystems(value);
});
const invalid = [
  ['legacy version', d => { delete d.systemsVersion; }],
  ['legacy shape', d => { d.system.nodes = []; }],
  ['empty layers', d => { d.system.layers = []; }],
  ['duplicate layer', d => { d.system.layers[1].id = 'logical'; }],
  ['duplicate node', d => { d.system.layers[1].nodes[0].id = 'logical.root'; }],
  ['wrong root', d => { d.system.layers[0].rootNodeId = 'logical.web'; }],
  ['cross-layer parent', d => { d.system.layers[0].nodes[1].parentId = 's.root'; }],
  ['containment cycle', d => { d.system.layers[0].nodes[1].parentId = 'logical.data'; d.system.layers[0].nodes[2].parentId = 'logical.web'; }],
  ['cross-layer edge', d => { d.system.layers[0].edges[0].toNodeId = 'p.web'; }],
  ['root endpoint', d => { d.system.layers[0].edges[0].toNodeId = 'logical.root'; }],
  ['Dataflow cycle', d => { d.system.layers[0].edges = [{ id: 'a', type: 'Dataflow', fromNodeId: 'logical.web', toNodeId: 'logical.web' }]; }],
  ['Dependency cycle', d => { d.system.layers[0].edges = [{ id: 'a', type: 'Dependency', fromNodeId: 'logical.web', toNodeId: 'logical.web' }]; }],
  ['wrong refinement direction', d => { d.system.refinements[0].fromNodeId = 'logical.data'; }],
  ['missing refinement endpoint', d => { d.system.refinements[0].fromNodeId = 'missing'; }],
  ['same-layer refinement', d => { d.system.refinements[0].toNodeId = 's.root'; }],
  ['unknown instance layer', d => { d.system.instances[0].layerId = 'missing'; }],
  ['cross-layer binding', d => { d.system.instances[0].bindings[0].nodeId = 'p.web'; }],
  ['duplicate binding', d => { d.system.instances[0].bindings.push(d.system.instances[0].bindings[0]); }],
  ['state on process', d => { d.system.instances[0].bindings[0].state = {}; }],
  ['invalid timestamp', d => { d.system.instances[0].bindings[1].state.snapshot.capturedAt = 'yesterday'; }],
  ['invalid calendar date', d => { d.system.instances[0].bindings[1].state.snapshot.capturedAt = '2026-02-30T00:00:00Z'; }],
  ['invalid digest', d => { d.system.instances[0].bindings[1].state.snapshot.digest = 'abc'; }],
  ['configuration shape', d => { d.system.layers[2].nodes[2].configuration[0].required = 'yes'; }],
  ['duplicate config names', d => { const n = d.system.layers[2].nodes[2]; n.configuration.push(n.configuration[0]); }],
  ['sensitive literal', d => { const c = d.system.layers[2].nodes[2].configuration[1]; c.sensitive = true; }],
  ['reference plus literal', d => { d.system.instances[0].bindings[1].configuration[0].value = 'secret'; }],
  ['non-JSON configuration', d => { d.system.layers[2].nodes[2].configuration[0].value = undefined; }],
  ['root secret scope', d => { d.system.instances[0].bindings[1].configuration[0].secretRef.nodeId = 'provider.root'; }],
  ['unknown secret scope', d => { d.system.instances[0].bindings[1].configuration[0].secretRef.nodeId = 'missing'; }],
];
for (const [name, mutate] of invalid) test(`rejects ${name}`, () => { const value = fresh(); mutate(value); assert.throws(() => validateSystems(value)); });
test('Runtime cycles and explicit null configuration values are valid', () => {
  const d = fresh();
  d.system.layers[0].edges.push({ id: 'back', type: 'Runtime', fromNodeId: 'logical.data', toNodeId: 'logical.web' });
  d.system.layers[2].nodes[2].configuration[0].value = null;
  validateSystems(d);
});

test('domains are optional and may overlap across layers or have no members', () => {
  const d = fresh();
  validateSystems(d);
  d.system.domains.push({ id: 'empty', name: 'Empty', nodeIds: [], vendor: true });
  assert.equal(validateSystems(d).system.domains.at(-1).vendor, true);
  delete d.system.domains;
  validateSystems(d);
  d.system.domains = [];
  validateSystems(d);
});
for (const [name, change] of [
  ['null domains', d => { d.system.domains = null; }],
  ['duplicate domain ID', d => { d.system.domains.push(d.system.domains[0]); }],
  ['invalid domain ID', d => { d.system.domains[0].id = 'not an id'; }],
  ['empty domain name', d => { d.system.domains[0].name = ''; }],
  ['missing domain members', d => { delete d.system.domains[0].nodeIds; }],
  ['duplicate domain member', d => { d.system.domains[0].nodeIds.push(d.system.domains[0].nodeIds[0]); }],
  ['unknown domain member', d => { d.system.domains[0].nodeIds.push('missing'); }],
  ['invalid domain description', d => { d.system.domains[0].description = 123; }],
]) test(`rejects ${name}`, () => { const d = fresh(); change(d); assert.throws(() => validateSystems(d)); });

test('Contract uses Process graph and binding rules, without Store state', () => {
  const d = fresh();
  for (const layer of d.system.layers) {
    for (const node of layer.nodes) if (node.kind === 'Process') node.kind = 'Contract';
  }
  assert.equal(validateSystems(d), d);
  const binding = d.system.instances[0].bindings[0];
  const node = d.system.layers.flatMap(layer => layer.nodes).find(node => node.id === binding.nodeId);
  assert.equal(node.kind, 'Contract');
  binding.state = {};
  assert.throws(() => validateSystems(d), /Store/);
});
