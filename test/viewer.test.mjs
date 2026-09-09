import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { loadProvider, providerOrigin, publicUrl, safeResourceUrl, resolveSelection, selectionQuery, nodeSourceFiles, layoutSystem } from "../lib/viewer.js";

const fixture = async (name) => JSON.parse(await readFile(new URL(`../skills/openship/references/examples/valid/${name}.json`, import.meta.url), "utf8"));
const originalDiscovery = await fixture("discovery");
const originalSystem = await fixture("systems");
function provider({ systems = false, mutate = () => {} } = {}) {
  const discovery = structuredClone(originalDiscovery);
  const document = structuredClone(originalSystem);
  if (systems) discovery.capabilities.systems = { description: "System design", document: "https://example.com/openship/systems.json" };
  mutate(document, discovery);
  const values = { "/.well-known/openship.json": discovery, "/openship/systems.json": document, "/openship/manifest.json": document.source.manifest, "/openship/bundle.json": document.source.bundle };
  const calls = [];
  return { calls, fetch: async (url, init) => {
    calls.push(url);
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "follow");
    assert.equal(init.headers.Accept, "application/json");
    return Response.json(values[new URL(url).pathname]);
  } };
}

test("normalizes page URLs and rejects credentials, private URLs and unsafe schemes", () => {
  assert.equal(providerOrigin("https://example.com/openship?x=y#z"), "https://example.com");
  for (const url of ["javascript:alert(1)", "https://user:secret@example.com", "http://example.com", "http://localhost:3000", "https://192.168.1.1", "https://[::1]"]) assert.throws(() => publicUrl(url));
  assert.equal(providerOrigin("http://localhost:3000/openship", true), "http://localhost:3000");
  assert.equal(safeResourceUrl("data:text/html,<script>alert(1)</script>"), null);
});

test("opens Sources-only providers and verifies the downloaded content", async () => {
  const source = provider();
  const result = await loadProvider("https://example.com/article", source);
  assert.equal(result.system, null);
  assert.equal(result.verified.files.length, 2);
  assert.equal(result.origin, "https://example.com");
  assert.equal(source.calls.length, 3);
});

test("Systems uses embedded Sources without separately fetching a different snapshot", async () => {
  const source = provider({ systems: true });
  const result = await loadProvider("https://example.com", source);
  assert.equal(result.system.id, "example-system");
  assert.equal(result.verified.files.length, 2);
  assert.deepEqual(source.calls.map((url) => new URL(url).pathname), ["/.well-known/openship.json", "/openship/systems.json"]);
});

test("invalid Systems offers explicit fallback without silently loading Sources", async () => {
  const source = provider({ systems: true, mutate: (doc) => { doc.system.layers[0].edges[0].toNodeId = "missing"; } });
  await assert.rejects(loadProvider("https://example.com", source), (error) => error.code === "validation" && error.sourcesAvailable);
  assert.equal(source.calls.length, 2);
  const result = await loadProvider("https://example.com", { ...source, preferSources: true });
  assert.equal(result.system, null);
  assert.equal(result.verified.files.length, 2);
});

test("corrupt Sources cannot be displayed as verified", async () => {
  const source = provider({ mutate: (doc) => { doc.source.bundle.files["app/page.js"].content = "tampered"; } });
  await assert.rejects(loadProvider("https://example.com", source), (error) => error.code === "validation");
});

test("optional context is not required; opaque metadata and text are preserved", async () => {
  const source = provider({ systems: true, mutate: (doc) => { delete doc.system.context; doc.system.layers[0].nodes[0].metadata.custom = "<script>alert(1)</script>"; } });
  const result = await loadProvider("https://example.com", source);
  assert.equal(result.system.context, undefined);
  assert.equal(result.system.layers[0].nodes[0].metadata.custom, "<script>alert(1)</script>");
});

test("rejects context hash corruption", async () => {
  const source = provider({ systems: true, mutate: (doc) => { doc.system.context.documents[0].text += " changed"; } });
  await assert.rejects(loadProvider("https://example.com", source), (error) => error.code === "validation" && error.sourcesAvailable);
});

test("differentiates unsupported providers, CORS/transport failure and invalid JSON", async () => {
  await assert.rejects(loadProvider("https://example.com", { fetch: async () => new Response("", { status: 404 }) }), (e) => e.code === "unsupported");
  await assert.rejects(loadProvider("https://example.com", { fetch: async () => { throw new TypeError("Failed to fetch"); } }), (e) => e.code === "transport");
  await assert.rejects(loadProvider("https://example.com", { fetch: async () => new Response("<html>not JSON</html>") }), (e) => e.code === "validation");
});

test("enforces declared, streamed and decoded limits", async () => {
  await assert.rejects(loadProvider("https://example.com", { fetch: async () => new Response("{}", { headers: { "content-length": "9999" } }), limits: { discoveryBytes: 8 } }), (e) => e.code === "size");
  let cancelled = false;
  await assert.rejects(loadProvider("https://example.com", { fetch: async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("0123456789")); }, cancel() { cancelled = true; } })), limits: { discoveryBytes: 8 } }), (e) => e.code === "size");
  assert.equal(cancelled, true);
  await assert.rejects(loadProvider("https://example.com", { ...provider(), limits: { decodedBytes: 1 } }), (e) => e.code === "validation");
});

test("cancels in-flight requests and distinguishes request timeouts", async () => {
  const fetch = async (_url, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const controller = new AbortController();
  const pending = loadProvider("https://example.com", { fetch, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === "AbortError");
  // Keep node alive: AbortSignal.timeout uses an unreferenced timer.
  const keepAlive = setTimeout(() => {}, 1000);
  try { await assert.rejects(loadProvider("https://example.com", { fetch, limits: { timeoutMs: 5 } }), (e) => e.code === "timeout"); } finally { clearTimeout(keepAlive); }
});

test("validates capability URLs before fetching them", async () => {
  const source = provider({ systems: true, mutate: (_doc, discovery) => { discovery.capabilities.systems.document = "https://user:secret@example.com/system"; } });
  await assert.rejects(loadProvider("https://example.com", source));
  assert.equal(source.calls.length, 1);
});

test("restores shareable selections with safe defaults", async () => {
  const result = await loadProvider("https://example.com", provider({ systems: true }));
  const state = { view: "system", panel: "context", node: "p.web", file: "app/page.js", layer: "technical", instance: "" };
  assert.deepEqual(resolveSelection(new URLSearchParams(selectionQuery(result.origin, state)), result), state);
  assert.deepEqual(resolveSelection(new URLSearchParams("view=invalid&panel=bad&node=unknown&file=missing"), result), { view: "system", panel: "architecture", node: "s.root", file: "app/page.js", layer: "technical", instance: "" });
  assert.equal(resolveSelection(new URLSearchParams("view=system"), { ...result, system: null }).view, "sources");
});

test("source selectors resolve only verified files and graph layout is deterministic", async () => {
  const result = await loadProvider("https://example.com", provider({ systems: true }));
  const node = result.system.layers[0].nodes.find((item) => item.id === "p.web");
  assert.deepEqual(nodeSourceFiles(node, result.verified.files).map((item) => item.metadata.path), ["app/page.js"]);
  const layout = layoutSystem(result.system.layers[0]);
  assert.deepEqual(layout, layoutSystem({ ...result.system.layers[0], nodes: [...result.system.layers[0].nodes].reverse() }));
  assert.equal(layout.boxes.length, result.system.layers[0].nodes.length);
  for (const box of layout.boxes) {
    assert.ok(box.x + box.width <= layout.width);
    assert.ok(box.y + box.height <= layout.height);
  }
});


test("calls native browser fetch with its global receiver", async () => {
  const original = globalThis.fetch;
  const source = provider();
  globalThis.fetch = function (...args) {
    assert.equal(this, globalThis);
    return source.fetch(...args);
  };
  try { assert.equal((await loadProvider("https://example.com")).verified.files.length, 2); }
  finally { globalThis.fetch = original; }
});

test('layer and instance navigation round trips and resets invalid selections', async () => {
  const { changeSystemLayer } = await import('../lib/viewer.js');
  const document = await fixture('systems-layered');
  const snapshot = { system: document.system, verified: { files: [] } };
  const state = resolveSelection(new URLSearchParams('instance=production&node=provider.data'), snapshot);
  assert.equal(state.layer, 'provider');
  assert.equal(state.instance, 'production');
  assert.deepEqual(resolveSelection(new URLSearchParams(selectionQuery('https://example.com', state)), snapshot), state);
  assert.deepEqual(changeSystemLayer(document.system, state, 'technical'), { layer: 'technical', instance: '', node: 'technical.data' });
  document.system.refinements.push({ id: 'another', fromNodeId: 'provider.data', toNodeId: 'p.web' });
  assert.equal(changeSystemLayer(document.system, state, 'technical').node, 's.root');
  const reset = resolveSelection(new URLSearchParams('layer=missing&instance=missing&node=provider.data'), snapshot);
  assert.equal(reset.layer, 'logical'); assert.equal(reset.node, 'logical.root'); assert.equal(reset.instance, '');
});

test('aggregate graph limits include nodes across layers and refinement links', async () => {
  const source = provider({ systems: true, mutate: d => {
    const root = { id: 'r', kind: 'Root', name: 'Root', metadata: { ownership: 'first_party' } };
    d.system.layers.push({ id: 'extra', role: 'custom', name: 'Extra', rootNodeId: 'r', nodes: [root, ...Array.from({ length: 1997 }, (_, i) => ({ ...root, id: `extra.${i}`, kind: 'Block', parentId: 'r' }))], edges: [] });
  } });
  await assert.rejects(loadProvider('https://example.com', source), e => e.code === 'size');
});
