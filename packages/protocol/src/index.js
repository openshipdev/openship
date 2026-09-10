import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const encoder = new TextEncoder();
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const hexPattern = /^[0-9a-f]{64}$/;
const idPattern = /^[A-Za-z0-9._:-]+$/;

export const OPENSHIP_MCP_TOOL_NAME = "openship";
export const OPENSHIP_MCP_MANIFEST_RESOURCE_URI = "openship://sources/manifest";
export const OPENSHIP_MCP_FILE_RESOURCE_TEMPLATE = "openship://sources/file{?path}";

export class OpenShipValidationError extends Error {
  constructor(path, message, code = "invalid_openship") {
    super(`${path}: ${message}`);
    this.name = "OpenShipValidationError";
    this.path = path;
    this.code = code;
  }
}

const fail = (path, message, code) => { throw new OpenShipValidationError(path, message, code); };
const object = (value, path) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value;
};
const string = (value, path) => {
  if (typeof value !== "string" || value.length === 0) fail(path, "must be a non-empty string");
  return value;
};
const array = (value, path) => {
  if (!Array.isArray(value)) fail(path, "must be an array");
  return value;
};
const unique = (values, path) => {
  if (new Set(values).size !== values.length) fail(path, "must contain unique values");
};
const envelope = (value, capability) => {
  const payload = object(value, "$");
  if (payload.openship !== "1.0") fail("$.openship", "unsupported major version", "unsupported_version");
  if (payload.capability !== capability) fail("$.capability", `must equal ${capability}`);
  return payload;
};

export function sha256Hex(value) {
  return bytesToHex(sha256(typeof value === "string" ? encoder.encode(value) : value));
}

export function compareUtf8(left, right) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const count = Math.min(a.length, b.length);
  for (let index = 0; index < count; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

export function assertSafePath(value, path = "path") {
  string(value, path);
  if (value !== value.normalize("NFC")) fail(path, "must be NFC normalized");
  if (encoder.encode(value).length > 512) fail(path, "exceeds 512 UTF-8 bytes");
  if (value.startsWith("/") || value.includes("\\") || value.includes("\0")) fail(path, "must be repository-relative");
  if (value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) fail(path, "contains an unsafe segment");
  return value;
}

export function matchOpenShipPattern(pattern, path) {
  assertSafePath(pattern, "pattern");
  assertSafePath(path, "path");
  if (!pattern.endsWith("/**")) return pattern === path;
  const prefix = pattern.slice(0, -3);
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function computeSourcesDigest(files) {
  return `sha256:${sha256Hex(files.map((file) => `${file.path}\0${file.sha256}\n`).join(""))}`;
}

export function decodeOpenShipBase64(content, path = "base64") {
  if (typeof content !== "string") fail(path, "must be a string");
  const compact = content.replace(/\s+/g, "");
  let binary;
  try {
    if (typeof Buffer !== "undefined") {
      const bytes = Uint8Array.from(Buffer.from(compact, "base64"));
      const canonical = Buffer.from(bytes).toString("base64");
      if (compact !== canonical && compact !== canonical.replace(/=+$/, "")) fail(path, "must be canonical base64");
      return bytes;
    }
    binary = atob(compact);
  } catch {
    fail(path, "is not valid base64");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const canonical = encodeOpenShipBase64(bytes);
  if (compact !== canonical && compact !== canonical.replace(/=+$/, "")) fail(path, "must be canonical base64");
  return bytes;
}

export function encodeOpenShipBase64(bytes) {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function decodeBundleEntry(entry, path) {
  const payload = object(entry, path);
  const content = typeof payload.content === "string" ? payload.content : fail(`${path}.content`, "must be a string");
  if (payload.encoding === "utf-8") {
    const bytes = encoder.encode(content);
    try {
      if (new TextDecoder("utf-8", { fatal: true }).decode(bytes) !== content) fail(`${path}.content`, "does not round-trip as UTF-8");
    } catch {
      fail(`${path}.content`, "does not round-trip as UTF-8");
    }
    return bytes;
  }
  if (payload.encoding !== "base64") fail(`${path}.encoding`, "must be utf-8 or base64");
  const compact = content.replace(/\s+/g, "");
  const bytes = decodeOpenShipBase64(content, `${path}.content`);
  const canonical = encodeOpenShipBase64(bytes);
  if (compact !== canonical && compact !== canonical.replace(/=+$/, "")) fail(`${path}.content`, "must be canonical base64");
  return bytes;
}

export function validateSourcesManifest(value) {
  const manifest = envelope(value, "sources");
  if (!digestPattern.test(manifest.digest)) fail("$.digest", "must be a sha256 digest");
  const project = object(manifest.project, "$.project");
  string(project.name, "$.project.name");
  string(project.description, "$.project.description");
  const totals = object(manifest.totals, "$.totals");
  if (!Number.isInteger(totals.files) || totals.files < 0) fail("$.totals.files", "must be a non-negative integer");
  if (!Number.isInteger(totals.bytes) || totals.bytes < 0) fail("$.totals.bytes", "must be a non-negative integer");
  const files = array(manifest.files, "$.files");
  const paths = [];
  files.forEach((raw, index) => {
    const file = object(raw, `$.files[${index}]`);
    paths.push(assertSafePath(file.path, `$.files[${index}].path`));
    if (!Number.isInteger(file.size) || file.size < 0) fail(`$.files[${index}].size`, "must be a non-negative integer");
    if (!hexPattern.test(file.sha256)) fail(`$.files[${index}].sha256`, "must be 64 lowercase hexadecimal characters");
    if (file.encoding !== "utf-8" && file.encoding !== "base64") fail(`$.files[${index}].encoding`, "must be utf-8 or base64");
    string(file.mediaType, `$.files[${index}].mediaType`);
    if (file.type !== "file" && file.type !== "symlink") fail(`$.files[${index}].type`, "must be file or symlink");
    if (file.type === "symlink") assertSafePath(file.target, `$.files[${index}].target`);
  });
  unique(paths, "$.files[].path");
  if (!paths.every((path, index) => index === 0 || compareUtf8(paths[index - 1], path) < 0)) fail("$.files", "paths must be sorted by ascending UTF-8 bytes");
  if (totals.files !== files.length) fail("$.totals.files", "does not equal the file count");
  if (totals.bytes !== files.reduce((sum, file) => sum + file.size, 0)) fail("$.totals.bytes", "does not equal the sum of file sizes");
  if (manifest.digest !== computeSourcesDigest(files)) fail("$.digest", "does not match the manifest file metadata");
  return manifest;
}

export function validateSources(manifestValue, bundleValue, options = {}) {
  const manifest = validateSourcesManifest(manifestValue);
  const bundle = envelope(bundleValue, "sources");
  if (bundle.digest !== manifest.digest) fail("$.bundle.digest", "does not match the Manifest digest");
  const bundleFiles = object(bundle.files, "$.bundle.files");
  const bundlePaths = Object.keys(bundleFiles).sort(compareUtf8);
  const manifestPaths = manifest.files.map((file) => file.path);
  if (JSON.stringify(bundlePaths) !== JSON.stringify(manifestPaths)) fail("$.bundle.files", "keys must exactly equal the Manifest paths");
  const files = [];
  let decodedBytes = 0;
  for (const metadata of manifest.files) {
    const entry = object(bundleFiles[metadata.path], `$.bundle.files[${JSON.stringify(metadata.path)}]`);
    if (entry.encoding !== metadata.encoding) fail(`$.bundle.files[${JSON.stringify(metadata.path)}].encoding`, "does not match the Manifest");
    const bytes = decodeBundleEntry(entry, `$.bundle.files[${JSON.stringify(metadata.path)}]`);
    if (bytes.length !== metadata.size) fail(`$.bundle.files[${JSON.stringify(metadata.path)}].content`, "decoded size does not match the Manifest");
    if (sha256Hex(bytes) !== metadata.sha256) fail(`$.bundle.files[${JSON.stringify(metadata.path)}].content`, "SHA-256 does not match the Manifest");
    decodedBytes += bytes.length;
    if (decodedBytes > (options.maxDecodedBytes ?? Number.POSITIVE_INFINITY)) fail("$.bundle.files", "decoded source exceeds the consumer limit", "source_too_large");
    files.push({ metadata, bytes });
  }
  return { manifest, bundle, files, decodedBytes };
}

export function validateDiscovery(value) {
  const discovery = envelope(value, "discovery");
  const absoluteUrl = (value, path) => {
    const raw = string(value, path);
    let url;
    try { url = new URL(raw); } catch { fail(path, "must be an absolute HTTPS URL"); }
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) fail(path, "must be an absolute HTTPS URL outside local development");
    return raw;
  };
  const project = object(discovery.project, "$.project");
  string(project.name, "$.project.name");
  string(project.description, "$.project.description");
  const agent = object(discovery.agent, "$.agent");
  string(agent.summary, "$.agent.summary");
  string(agent.instructions, "$.agent.instructions");
  absoluteUrl(agent.skill, "$.agent.skill");
  if (discovery.page !== undefined) absoluteUrl(discovery.page, "$.page");
  const capabilities = object(discovery.capabilities, "$.capabilities");
  const sources = object(capabilities.sources, "$.capabilities.sources");
  string(sources.description, "$.capabilities.sources.description");
  for (const key of ["manifest", "bundle"]) {
    absoluteUrl(sources[key], `$.capabilities.sources.${key}`);
  }
  for (const key of ["mcp", "archive", "instructions"]) {
    if (sources[key] !== undefined) absoluteUrl(sources[key], `$.capabilities.sources.${key}`);
  }
  if (sources.file !== undefined) {
    absoluteUrl(sources.file, "$.capabilities.sources.file");
    if (!String(sources.file).includes("{path}")) fail("$.capabilities.sources.file", "must contain {path}");
  }
  if (capabilities.systems) {
    const systems = object(capabilities.systems, "$.capabilities.systems");
    string(systems.description, "$.capabilities.systems.description");
    absoluteUrl(systems.document, "$.capabilities.systems.document");
  }
  if (capabilities.changes) {
    const changes = object(capabilities.changes, "$.capabilities.changes");
    string(changes.description, "$.capabilities.changes.description");
    for (const key of ["policy", "submit", "status"]) absoluteUrl(changes[key], `$.capabilities.changes.${key}`);
    if (!String(changes.status).includes("{changeId}")) fail("$.capabilities.changes.status", "must contain {changeId}");
  }
  return discovery;
}

function assertAcyclic(ids, pairs, path) {
  const outgoing = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const [from, to] of pairs) {
    if (!outgoing.has(from) || !outgoing.has(to)) continue;
    outgoing.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  const queue = ids.filter((id) => indegree.get(id) === 0);
  let seen = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    seen += 1;
    for (const next of outgoing.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (seen !== ids.length) fail(path, "must be acyclic");
}

export function validateSystems(value, options = {}) {
  const payload = envelope(value, "systems");
  const source = object(payload.source, "$.source");
  validateSources(source.manifest, source.bundle, options);
  const system = object(payload.system, "$.system");
  string(system.id, "$.system.id");
  string(system.name, "$.system.name");
  if (payload.systemsVersion !== "2.0") fail("$.systemsVersion", "requires layered Systems 2.0; legacy Systems is unsupported", "unsupported_version");
  for (const key of ["nodes", "edges", "rootNodeId"]) if (key in system) fail(`$.system.${key}`, "legacy graph members are unsupported");
  const layers = array(system.layers, "$.system.layers");
  if (!layers.length) fail("$.system.layers", "requires at least one layer");
  const identifier = (value, path) => {
    if (!idPattern.test(string(value, path))) fail(path, "has an invalid identifier");
    return value;
  };
  identifier(system.id, "$.system.id");
  const jsonValue = (value, path, ancestors = new Set()) => {
    if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
    if (typeof value !== "object" || ancestors.has(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail(path, "must be a JSON value");
    ancestors.add(value);
    for (const item of Array.isArray(value) ? value : Object.values(value)) jsonValue(item, path, ancestors);
    ancestors.delete(value);
  };
  const configuration = (entries, path) => {
    if (entries === undefined) return;
    const names = [];
    for (const [index, raw] of array(entries, path).entries()) {
      const at = `${path}[${index}]`, entry = object(raw, at);
      names.push(string(entry.name, `${at}.name`));
      string(entry.description, `${at}.description`);
      if (typeof entry.required !== "boolean") fail(`${at}.required`, "must be boolean");
      if (entry.sensitive !== undefined && typeof entry.sensitive !== "boolean") fail(`${at}.sensitive`, "must be boolean");
      if ("value" in entry) jsonValue(entry.value, `${at}.value`);
      if ("value" in entry && (entry.sensitive === true || entry.secretRef !== undefined)) fail(at, "secret configuration cannot contain a literal value");
      if (entry.secretRef !== undefined) {
        const ref = object(entry.secretRef, `${at}.secretRef`);
        identifier(ref.nodeId, `${at}.secretRef.nodeId`);
        string(ref.key, `${at}.secretRef.key`);
      }
    }
    unique(names, path);
  };
  const nodeById = new Map(), layerByNode = new Map(), layerById = new Map();
  for (const [index, raw] of layers.entries()) {
    const at = `$.system.layers[${index}]`, layer = object(raw, at);
    identifier(layer.id, `${at}.id`);
    if (layerById.has(layer.id)) fail(`${at}.id`, "must be unique");
    layerById.set(layer.id, layer);
    string(layer.name, `${at}.name`);
    if (!["logical", "technical", "provider", "custom"].includes(layer.role)) fail(`${at}.role`, "invalid layer role");
    const rootNodeId = identifier(layer.rootNodeId, `${at}.rootNodeId`);
    const nodes = array(layer.nodes, `${at}.nodes`), local = new Map();
    for (const [i, rawNode] of nodes.entries()) {
      const path = `${at}.nodes[${i}]`, node = object(rawNode, path);
      identifier(node.id, `${path}.id`);
      if (nodeById.has(node.id)) fail(`${path}.id`, "must be globally unique");
      if (!["Root", "Block", "Store", "Host", "Container", "Process", "Contract", "Library"].includes(node.kind)) fail(`${path}.kind`, "invalid node kind");
      string(node.name, `${path}.name`);
      const metadata = object(node.metadata, `${path}.metadata`);
      if (!["first_party", "third_party"].includes(metadata.ownership)) fail(`${path}.metadata.ownership`, "must be first_party or third_party");
      configuration(node.configuration, `${path}.configuration`);
      if (node.sourceSelectors !== undefined) {
        unique(array(node.sourceSelectors, `${path}.sourceSelectors`), `${path}.sourceSelectors`);
        for (const selector of node.sourceSelectors) {
          string(selector, `${path}.sourceSelectors`);
          if (!source.manifest.files.some((file) => matchOpenShipPattern(selector, file.path))) fail(`${path}.sourceSelectors`, `${selector} matches no source path`);
        }
      }
      nodeById.set(node.id, node); local.set(node.id, node); layerByNode.set(node.id, index);
    }
    const roots = nodes.filter((node) => node.kind === "Root");
    if (roots.length !== 1 || roots[0].id !== rootNodeId || roots[0].parentId !== undefined) fail(`${at}.rootNodeId`, "must identify the one parentless Root");
    for (const node of nodes) if (node.id !== rootNodeId && !local.has(node.parentId)) fail(`${at}.nodes.${node.id}.parentId`, "must reference a parent in this layer");
    assertAcyclic([...local.keys()], nodes.filter((node) => node.parentId).map((node) => [node.parentId, node.id]), `${at}.nodes`);
    const edges = array(layer.edges, `${at}.edges`);
    unique(edges.map((edge) => identifier(object(edge, `${at}.edges`).id, `${at}.edges.id`)), `${at}.edges`);
    for (const edge of edges) {
      const from = local.get(edge.fromNodeId), to = local.get(edge.toNodeId);
      if (!from || !to || from.kind === "Root" || to.kind === "Root") fail(`${at}.edges.${edge.id}`, "endpoints must be non-root nodes in this layer");
      if (!["Runtime", "Dataflow", "Dependency"].includes(edge.type)) fail(`${at}.edges.${edge.id}.type`, "invalid edge type");
    }
    for (const type of ["Dataflow", "Dependency"]) assertAcyclic([...local.keys()], edges.filter((edge) => edge.type === type).map((edge) => [edge.fromNodeId, edge.toNodeId]), `${at}.edges[${type}]`);
  }
  const domains = array(system.domains === undefined ? [] : system.domains, "$.system.domains");
  unique(domains.map((domain) => identifier(object(domain, "$.system.domains").id, "$.system.domains.id")), "$.system.domains");
  for (const domain of domains) {
    const at = `$.system.domains.${domain.id}`;
    string(domain.name, `${at}.name`);
    if (domain.description !== undefined) string(domain.description, `${at}.description`);
    const members = array(domain.nodeIds, `${at}.nodeIds`);
    unique(members, `${at}.nodeIds`);
    for (const nodeId of members) if (!nodeById.has(nodeId)) fail(`${at}.nodeIds`, "must reference existing system nodes");
  }
  const refinements = array(system.refinements, "$.system.refinements");
  unique(refinements.map((ref) => identifier(object(ref, "$.system.refinements").id, "$.system.refinements.id")), "$.system.refinements");
  for (const ref of refinements) {
    if (!nodeById.has(ref.fromNodeId) || !nodeById.has(ref.toNodeId) || layerByNode.get(ref.fromNodeId) <= layerByNode.get(ref.toNodeId)) fail(`$.system.refinements.${ref.id}`, "must connect a concrete node to a node in an earlier layer");
  }
  const instances = array(system.instances ?? [], "$.system.instances");
  unique(instances.map((instance) => identifier(object(instance, "$.system.instances").id, "$.system.instances.id")), "$.system.instances");
  for (const instance of instances) {
    const at = `$.system.instances.${instance.id}`;
    string(instance.name, `${at}.name`); string(instance.environment, `${at}.environment`);
    const layer = layerById.get(instance.layerId);
    if (!layer) fail(`${at}.layerId`, "must reference a layer");
    const bindings = array(instance.bindings, `${at}.bindings`);
    unique(bindings.map((binding) => object(binding, `${at}.bindings`).nodeId), `${at}.bindings`);
    for (const binding of bindings) {
      const node = nodeById.get(binding.nodeId);
      if (!node || !layer.nodes.includes(node) || node.kind === "Root") fail(`${at}.bindings`, "must bind non-root nodes in the instance layer");
      if (binding.resourceId !== undefined) string(binding.resourceId, `${at}.resourceId`);
      configuration(binding.configuration, `${at}.configuration`);
      if (binding.state !== undefined) {
        if (node.kind !== "Store") fail(`${at}.state`, "database state requires a Store node");
        const state = object(binding.state, `${at}.state`);
        if (state.appliedMigration !== undefined) string(state.appliedMigration, `${at}.state.appliedMigration`);
        if (state.snapshot !== undefined) {
          const snapshot = object(state.snapshot, `${at}.state.snapshot`);
          string(snapshot.ref, `${at}.state.snapshot.ref`);
          if (typeof snapshot.capturedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(snapshot.capturedAt) || !Number.isFinite(Date.parse(snapshot.capturedAt))) fail(`${at}.state.snapshot.capturedAt`, "must be an RFC3339 timestamp");
          const [year, month, day] = snapshot.capturedAt.slice(0, 10).split("-").map(Number);
          if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) fail(`${at}.state.snapshot.capturedAt`, "must be a valid calendar date");
          if (snapshot.digest !== undefined && !digestPattern.test(snapshot.digest)) fail(`${at}.state.snapshot.digest`, "must be a sha256 digest");
        }
      }
    }
  }
  for (const entries of [...nodeById.values()].map((node) => node.configuration).concat(instances.flatMap((instance) => instance.bindings.map((binding) => binding.configuration)))) {
    for (const entry of entries ?? []) if (entry.secretRef && (!nodeById.has(entry.secretRef.nodeId) || nodeById.get(entry.secretRef.nodeId).kind === "Root")) fail("$.system.configuration.secretRef.nodeId", "must reference a component");
  }
  const context = system.context;
  if (!context) return payload;
  object(context, "$.system.context");
  for (const key of ["concerns", "documents", "matrix", "artifacts", "systemPromptRefs"]) if (context[key] !== undefined) array(context[key], `$.system.context.${key}`);
  unique(context.concerns ?? [], "$.system.context.concerns");
  for (const concern of context.concerns ?? []) string(concern, "$.system.context.concerns");
  const concerns = new Set(context.concerns ?? []);
  const documents = new Map();
  for (const document of context.documents ?? []) {
    object(document, "$.system.context.documents");
    string(document.title, "$.system.context.documents.title");
    string(document.language, "$.system.context.documents.language");
    if (typeof document.text !== "string") fail("$.system.context.documents.text", "must be a string");
    if (!["Document", "Skill", "Prompt"].includes(document.kind)) fail("$.system.context.documents", "contains an invalid document kind");
    const expected = `sha256:${sha256Hex(`${document.kind}\n${document.title}\n${document.language}\n${document.text}`)}`;
    if (document.hash !== expected) fail(`$.system.context.documents.${document.hash}`, "hash does not match canonical document content");
    if (documents.has(document.hash)) fail("$.system.context.documents", `duplicates ${document.hash}`);
    documents.set(document.hash, document);
  }
  assertAcyclic([...documents.keys()], [...documents.values()].filter((doc) => doc.supersedes && documents.has(doc.supersedes)).map((doc) => [doc.hash, doc.supersedes]), "$.system.context.documents[].supersedes");
  for (const cell of context.matrix ?? []) {
    object(cell, "$.system.context.matrix");
    for (const key of ["documentRefs", "skillRefs"]) if (cell[key] !== undefined) unique(array(cell[key], `$.system.context.matrix.${key}`), `$.system.context.matrix.${key}`);
    if (!nodeById.has(cell.nodeId)) fail("$.system.context.matrix", `references missing node ${cell.nodeId}`);
    if (!concerns.has(cell.concern)) fail("$.system.context.matrix", `references undeclared concern ${cell.concern}`);
    for (const hash of cell.documentRefs ?? []) if (documents.get(hash)?.kind !== "Document") fail("$.system.context.matrix", `Document reference ${hash} is missing or has the wrong kind`);
    for (const hash of cell.skillRefs ?? []) if (documents.get(hash)?.kind !== "Skill") fail("$.system.context.matrix", `Skill reference ${hash} is missing or has the wrong kind`);
  }
  for (const hash of context.systemPromptRefs ?? []) if (documents.get(hash)?.kind !== "Prompt") fail("$.system.context.systemPromptRefs", `${hash} is missing or has the wrong kind`);
  const artifactIds = [];
  const sourcePaths = new Set(source.manifest.files.map((file) => file.path));
  for (const artifact of context.artifacts ?? []) {
    object(artifact, "$.system.context.artifacts");
    artifactIds.push(identifier(artifact.id, "$.system.context.artifacts.id"));
    if (!nodeById.has(artifact.nodeId)) fail("$.system.context.artifacts", `references missing node ${artifact.nodeId}`);
    if (!concerns.has(artifact.concern)) fail("$.system.context.artifacts", `references undeclared concern ${artifact.concern}`);
    if (artifact.type === "Code") {
      if (!Array.isArray(artifact.sourcePaths) || artifact.sourcePaths.length === 0) fail(`$.system.context.artifacts.${artifact.id}.sourcePaths`, "is required for Code");
      for (const path of artifact.sourcePaths) if (!sourcePaths.has(path)) fail(`$.system.context.artifacts.${artifact.id}.sourcePaths`, `references missing source ${path}`);
      if (artifact.text !== undefined) fail(`$.system.context.artifacts.${artifact.id}.text`, "Code must not duplicate source content");
    } else if ((artifact.type === "Summary" || artifact.type === "Docs") && typeof artifact.text !== "string") fail(`$.system.context.artifacts.${artifact.id}.text`, "is required");
    else if (!["Summary", "Docs", "Code"].includes(artifact.type)) fail(`$.system.context.artifacts.${artifact.id}.type`, "is not a v1 artifact type");
  }
  unique(artifactIds, "$.system.context.artifacts[].id");
  return payload;
}

export function validateChangesDocument(value) {
  const payload = envelope(value, "changes");
  if (payload.base !== undefined && !digestPattern.test(payload.base)) fail("$.base", "must be a sha256 digest");
  if (payload.digest !== undefined && !digestPattern.test(payload.digest)) fail("$.digest", "must be a sha256 digest");
  if (payload.files !== undefined) {
    const files = object(payload.files, "$.files");
    for (const [path, entry] of Object.entries(files)) {
      assertSafePath(path, `$.files.${path}`);
      if (entry !== null) decodeBundleEntry(entry, `$.files.${path}`);
    }
  }
  return payload;
}

export function validateChangesSubmission(value) {
  const payload = validateChangesDocument(value);
  if (!digestPattern.test(payload.base)) fail("$.base", "must be a sha256 digest");
  string(payload.title, "$.title");
  string(payload.intent, "$.intent");
  const files = object(payload.files, "$.files");
  if (Object.keys(files).length === 0) fail("$.files", "must contain at least one replacement or deletion");
  return payload;
}

function validateChangesLifecycle(value, requireStatusUrl) {
  const payload = validateChangesDocument(value);
  string(payload.changeId, "$.changeId");
  if (!digestPattern.test(payload.base)) fail("$.base", "must be a sha256 digest");
  if (!digestPattern.test(payload.digest)) fail("$.digest", "must be a sha256 digest");
  if (!["pending", "processing", "ready", "rejected", "failed"].includes(payload.status)) fail("$.status", "is not a Changes lifecycle status");
  const candidate = string(payload.candidateOrigin, "$.candidateOrigin");
  try { new URL(candidate); } catch { fail("$.candidateOrigin", "must be an absolute URL"); }
  if (requireStatusUrl) {
    const statusUrl = string(payload.statusUrl, "$.statusUrl");
    try { new URL(statusUrl); } catch { fail("$.statusUrl", "must be an absolute URL"); }
  }
  return payload;
}

export function validateChangesAccepted(value) {
  return validateChangesLifecycle(value, true);
}

export function validateChangesStatus(value) {
  return validateChangesLifecycle(value, false);
}

export function validateChangesPolicy(value) {
  const payload = validateChangesDocument(value);
  for (const [key, patterns] of [["writable", payload.writable], ["protected", payload.protected]]) {
    const values = array(patterns, `$.${key}`);
    for (const [index, pattern] of values.entries()) assertSafePath(pattern, `$.${key}[${index}]`);
    unique(values, `$.${key}`);
  }
  object(payload.limits, "$.limits");
  return payload;
}

export function validateChangesViolation(value) {
  const payload = validateChangesDocument(value);
  string(payload.error, "$.error");
  string(payload.message, "$.message");
  array(payload.violations, "$.violations");
  return payload;
}

export function normalizeOpenShipOrigin(origin, options = {}) {
  let url;
  try { url = new URL(origin); } catch { fail("origin", "must be an absolute URL", "invalid_origin"); }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(options.allowLoopbackHttp && url.protocol === "http:" && loopback)) fail("origin", "must use HTTPS outside loopback development", "invalid_origin");
  return url.toString().replace(/\/$/, "");
}

async function fetchJson(fetcher, url, path) {
  const response = await fetcher(url, { headers: { Accept: "application/json" }, credentials: "omit" });
  if (!response.ok) throw new OpenShipValidationError(path, `GET ${url} returned ${response.status}`, "fetch_failed");
  try { return await response.json(); } catch { throw new OpenShipValidationError(path, `GET ${url} did not return JSON`, "fetch_failed"); }
}

export async function fetchOpenShip(origin, options = {}) {
  const normalized = normalizeOpenShipOrigin(origin, options);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) fail("fetch", "is not available", "fetch_failed");
  const discovery = validateDiscovery(await fetchJson(fetcher, `${normalized}/.well-known/openship.json`, "discovery"));
  if (options.preferSystems !== false && discovery.capabilities.systems) {
    const document = await fetchJson(fetcher, discovery.capabilities.systems.document, "systems");
    validateSystems(document, options);
    return { origin: normalized, discovery, snapshot: { kind: "systems", document }, verified: validateSources(document.source.manifest, document.source.bundle, options) };
  }
  const [manifest, bundle] = await Promise.all([
    fetchJson(fetcher, discovery.capabilities.sources.manifest, "manifest"),
    fetchJson(fetcher, discovery.capabilities.sources.bundle, "bundle"),
  ]);
  const verified = validateSources(manifest, bundle, options);
  return { origin: normalized, discovery, snapshot: { kind: "sources", manifest, bundle }, verified };
}

function bytesEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function diffSources(base, current) {
  if (!base?.files || !current?.files) fail("snapshots", "must be verified Sources values");
  const baseByPath = new Map(base.files.map((file) => [file.metadata.path, file]));
  const currentByPath = new Map(current.files.map((file) => [file.metadata.path, file]));
  return [...new Set([...baseByPath.keys(), ...currentByPath.keys()])].sort(compareUtf8).flatMap((path) => {
    const before = baseByPath.get(path);
    const after = currentByPath.get(path);
    if (!after) return [{ path, operation: "delete", before, after: null }];
    if (!before) return [{ path, operation: "create", before: null, after }];
    if (!bytesEqual(before.bytes, after.bytes) || JSON.stringify(before.metadata) !== JSON.stringify(after.metadata)) {
      return [{ path, operation: "replace", before, after }];
    }
    return [];
  });
}

export function composeChangesSubmission(base, current, input) {
  if (!base?.manifest || !current?.manifest) fail("snapshots", "must be verified Sources values");
  const baseByPath = new Map(base.files.map((file) => [file.metadata.path, file]));
  const currentByPath = new Map(current.files.map((file) => [file.metadata.path, file]));
  const paths = [...new Set([...baseByPath.keys(), ...currentByPath.keys()])].sort(compareUtf8);
  const files = {};
  for (const path of paths) {
    const before = baseByPath.get(path);
    const after = currentByPath.get(path);
    if (!after) files[path] = null;
    else if (!before || !bytesEqual(before.bytes, after.bytes) || before.metadata.type !== after.metadata.type || before.metadata.target !== after.metadata.target) {
      files[path] = {
        encoding: after.metadata.encoding,
        content: after.metadata.encoding === "base64" ? encodeOpenShipBase64(after.bytes) : new TextDecoder().decode(after.bytes),
      };
    }
  }
  return validateChangesSubmission({
    openship: "1.0",
    capability: "changes",
    base: base.manifest.digest,
    title: string(input.title, "title"),
    intent: string(input.intent, "intent"),
    files,
  });
}
