import { filterLayerByDomains } from "@openship/graph/model";
import {
  validateDiscovery,
  validateSources,
  validateSystems,
  matchOpenShipPattern,
} from "@openship/protocol/browser";

export const VIEWER_LIMITS = {
  decodedBytes: 32 * 1024 * 1024,
  documentBytes: 64 * 1024 * 1024,
  discoveryBytes: 1024 * 1024,
  timeoutMs: 30000,
};

export class ViewerError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ViewerError";
    this.code = code;
    this.sourcesAvailable = Boolean(options.sourcesAvailable);
  }
}

export function publicUrl(value, allowLoopback = false) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ViewerError("url", "Enter an absolute HTTPS site URL.");
  }
  const host = url.hostname.toLowerCase();
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const privateHost =
    loopback ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host,
    ) ||
    host.startsWith("[");
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(allowLoopback && loopback && url.protocol === "http:")) ||
    (privateHost && !(allowLoopback && loopback))
  ) {
    throw new ViewerError(
      "url",
      "Use a public HTTPS URL without credentials. Localhost is supported only in development.",
    );
  }
  return url;
}

export function providerOrigin(value, allowLoopback = false) {
  return publicUrl(value, allowLoopback).origin;
}

export function safeResourceUrl(value) {
  try {
    return publicUrl(value).href;
  } catch {
    return null;
  }
}

async function readJson(value, options, maxBytes, discovery = false) {
  const url = publicUrl(value, options.allowLoopback).href;
  const timeout = AbortSignal.timeout(options.limits.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  let reader;
  try {
    const response = await options.fetch(url, {
      credentials: "omit",
      redirect: "follow",
      headers: { Accept: "application/json" },
      signal,
    });
    if (response.url) publicUrl(response.url, options.allowLoopback);
    if (!response.ok)
      throw new ViewerError(
        discovery && response.status === 404 ? "unsupported" : "transport",
        discovery && response.status === 404
          ? "This site does not publish OpenShip discovery."
          : `The provider returned HTTP ${response.status}.`,
      );
    const advertisedLength = Number(response.headers.get("content-length"));
    if (advertisedLength > maxBytes) {
      await response.body?.cancel();
      throw new ViewerError(
        "size",
        "The provider document exceeds the viewer download limit.",
      );
    }
    if (!response.body)
      throw new ViewerError(
        "transport",
        "The provider returned an empty response.",
      );
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let length = 0;
    const parts = [];
    for (;;) {
      signal.throwIfAborted();
      const { done, value: chunk } = await reader.read();
      if (done) break;
      length += chunk.byteLength;
      if (length > maxBytes)
        throw new ViewerError(
          "size",
          "The provider document exceeds the viewer download limit.",
        );
      parts.push(decoder.decode(chunk, { stream: true }));
    }
    parts.push(decoder.decode());
    signal.throwIfAborted();
    try {
      return JSON.parse(parts.join(""));
    } catch {
      throw new ViewerError(
        "validation",
        "The provider returned invalid JSON.",
      );
    }
  } catch (error) {
    if (options.signal?.aborted)
      throw (
        options.signal.reason ?? new DOMException("Cancelled", "AbortError")
      );
    if (timeout.aborted)
      throw new ViewerError(
        "timeout",
        "The provider took too long to respond. Try again.",
      );
    if (error instanceof ViewerError) throw error;
    if (error instanceof TypeError && /encoded data/.test(error.message))
      throw new ViewerError(
        "validation",
        "The provider document is not valid UTF-8.",
      );
    throw new ViewerError(
      "transport",
      "The browser could not read this endpoint. Check connectivity and the provider’s CORS headers. If the site redirects, enter its final public URL.",
      { cause: error },
    );
  } finally {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* An aborted request is already closed. */
      }
      reader.releaseLock();
    }
  }
}

function validate(operation) {
  try {
    return operation();
  } catch (error) {
    throw new ViewerError(
      "validation",
      `OpenShip validation failed: ${error.message}`,
      { cause: error },
    );
  }
}

export async function loadProvider(value, input = {}) {
  const options = {
    fetch: (...args) => globalThis.fetch(...args),
    allowLoopback: false,
    ...input,
    limits: { ...VIEWER_LIMITS, ...input.limits },
  };
  const origin = providerOrigin(value, options.allowLoopback);
  options.onPhase?.("Reading discovery…");
  const rawDiscovery = await readJson(
    `${origin}/.well-known/openship.json`,
    options,
    options.limits.discoveryBytes,
    true,
  );
  const discovery = validate(() => validateDiscovery(rawDiscovery));
  const cap = discovery.capabilities;
  let system = null;
  let systemsDocument = null;
  let manifest, bundle;
  if (cap.systems && !options.preferSources) {
    try {
      options.onPhase?.("Retrieving and validating Systems…");
      const raw = await readJson(
        cap.systems.document,
        options,
        options.limits.documentBytes,
      );
      options.signal?.throwIfAborted();
      const document = validate(() =>
        validateSystems(raw, { maxDecodedBytes: options.limits.decodedBytes }),
      );
      if (
        document.system.layers.reduce((n, layer) => n + layer.nodes.length, 0) >
          2000 ||
        document.system.layers.reduce(
          (n, layer) => n + layer.edges.length,
          document.system.refinements.length,
        ) > 10000
      )
        throw new ViewerError(
          "size",
          "This system is too large to diagram in this viewer (2,000 nodes / 10,000 connections).",
        );
      systemsDocument = document;
      system = document.system;
      ({ manifest, bundle } = document.source);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ViewerError(
        error.code ?? "validation",
        `Systems could not be loaded. ${error.message}`,
        { cause: error, sourcesAvailable: Boolean(cap.sources) },
      );
    }
  } else {
    options.onPhase?.("Retrieving and validating Sources…");
    [manifest, bundle] = await Promise.all([
      readJson(cap.sources.manifest, options, options.limits.documentBytes),
      readJson(cap.sources.bundle, options, options.limits.documentBytes),
    ]);
  }
  options.signal?.throwIfAborted();
  const verified = validate(() =>
    validateSources(manifest, bundle, {
      maxDecodedBytes: options.limits.decodedBytes,
    }),
  );
  return { origin, discovery, system, systemsDocument, verified };
}

export function resolveSelection(params, snapshot) {
  const system = snapshot.system;
  const view =
    params.get("view") === "sources" || !system ? "sources" : "system";
  const instance = system?.instances?.find(
    (item) => item.id === params.get("instance"),
  );
  const layer =
    system?.layers.find(
      (item) => item.id === (instance?.layerId ?? params.get("layer")),
    ) ?? system?.layers[0];
  const hiddenDomains = [...new Set(params.getAll("hideDomain"))].filter((id) =>
    system?.domains?.some((domain) => domain.id === id),
  );
  const filtered =
    layer && filterLayerByDomains(layer, system.domains, hiddenDomains);
  const node = filtered?.nodes.some((item) => item.id === params.get("node"))
    ? params.get("node")
    : (layer?.rootNodeId ?? "");
  const file = snapshot.verified.files.some(
    (item) => item.metadata.path === params.get("file"),
  )
    ? params.get("file")
    : (snapshot.verified.files[0]?.metadata.path ?? "");
  return {
    view,
    node,
    file,
    layer: layer?.id ?? "",
    instance: instance?.id ?? "",
    hiddenDomains,
  };
}

// Map selection without treating refinement as containment or inheritance.
export function changeSystemLayer(system, selection, layerId) {
  const layer =
    system.layers.find((item) => item.id === layerId) ?? system.layers[0];
  const ids = new Set(
    filterLayerByDomains(
      layer,
      system.domains,
      selection.hiddenDomains,
    ).nodes.map((node) => node.id),
  );
  const matches = new Set(
    system.refinements
      .flatMap((ref) =>
        ref.fromNodeId === selection.node
          ? [ref.toNodeId]
          : ref.toNodeId === selection.node
            ? [ref.fromNodeId]
            : [],
      )
      .filter((id) => ids.has(id)),
  );
  return {
    layer: layer.id,
    instance: "",
    node: ids.has(selection.node)
      ? selection.node
      : matches.size === 1
        ? [...matches][0]
        : layer.rootNodeId,
  };
}

export function selectionQuery(origin, state) {
  const params = new URLSearchParams({ url: origin, view: state.view });
  for (const id of state.hiddenDomains ?? []) params.append("hideDomain", id);
  if (state.layer) params.set("layer", state.layer);
  if (state.instance) params.set("instance", state.instance);
  if (state.view === "system") {
    if (state.node) params.set("node", state.node);
  } else if (state.file) params.set("file", state.file);
  return `?${params}`;
}

export function nodeSourceFiles(node, files) {
  return files.filter(({ metadata }) =>
    (node.sourceSelectors ?? []).some((selector) =>
      matchOpenShipPattern(selector, metadata.path),
    ),
  );
}

// Recursive containment placement is deterministic and independent of provider metadata.
export function layoutSystem(system) {
  const children = new Map();
  for (const node of system.nodes) {
    const parent =
      node.parentId ?? (node.kind === "Library" ? system.rootNodeId : null);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(node);
  }
  const order = (node) =>
    Number.isFinite(node.metadata.order) ? node.metadata.order : 1000;
  for (const list of children.values())
    list.sort(
      (a, b) => order(a) - order(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const boxes = [];
  function place(node, x, y, depth) {
    const descendants = children.get(node.id) ?? [];
    let cursor = y + 74;
    const columns = node.kind === "Root" ? 3 : 1;
    const width = node.kind === "Root" ? 1120 : 344 - depth * 28;
    let rowHeight = 0;
    descendants.forEach((child, index) => {
      const column = index % columns;
      const box = place(child, x + 14 + column * 362, cursor, depth + 1);
      rowHeight = Math.max(rowHeight, box.height);
      if (column === columns - 1 || index === descendants.length - 1) {
        cursor += rowHeight + 14;
        rowHeight = 0;
      }
    });
    const height = descendants.length ? cursor - y : 70;
    const box = { node, x, y, width, height, depth };
    boxes.push(box);
    return box;
  }
  const root = place(
    system.nodes.find((node) => node.id === system.rootNodeId),
    12,
    12,
    0,
  );
  return {
    boxes: boxes.sort((a, b) => a.depth - b.depth || a.y - b.y || a.x - b.x),
    width: root.width + 24,
    height: root.height + 24,
  };
}

// Archive responses contain signed R2 URLs; validate every document again before rendering.
export async function loadArchivedProvider(value, input = {}) {
  const origin = providerOrigin(value);
  const fetcher = input.fetch || globalThis.fetch;
  const lookup = await fetcher(
    `/api/projects?origin=${encodeURIComponent(origin)}`,
    { signal: input.signal },
  );
  if (!lookup.ok) throw new ViewerError("archive", "Archive lookup failed.");
  const { id } = await lookup.json();
  if (!id) throw new ViewerError("archive", "No saved snapshot.");
  const response = await fetcher(`/api/projects/${encodeURIComponent(id)}`, {
    signal: input.signal,
  });
  if (!response.ok) throw new ViewerError("archive", "No saved snapshot.");
  const project = await response.json();
  if (!project.archive || project.origin !== origin)
    throw new ViewerError("archive", "No saved snapshot.");
  const options = {
    fetch: fetcher,
    signal: input.signal,
    limits: VIEWER_LIMITS,
    allowLoopback: false,
  };
  const get = (kind) => {
    const resource = project.archive.resources.find((r) => r.kind === kind);
    if (!resource)
      throw new ViewerError("archive", "Incomplete saved snapshot.");
    return readJson(
      resource.url,
      options,
      kind === "discovery"
        ? VIEWER_LIMITS.discoveryBytes
        : VIEWER_LIMITS.documentBytes,
    );
  };
  const [raw, manifest, bundle] = await Promise.all([
    get("discovery"),
    get("manifest"),
    get("bundle"),
  ]);
  const discovery = validate(() => validateDiscovery(raw));
  const verified = validate(() =>
    validateSources(manifest, bundle, {
      maxDecodedBytes: VIEWER_LIMITS.decodedBytes,
    }),
  );
  let systemsDocument = null;
  if (project.archive.resources.some((r) => r.kind === "systems")) {
    try {
      const rawSystems = await get("systems");
      systemsDocument = validate(() =>
        validateSystems(rawSystems, {
          maxDecodedBytes: VIEWER_LIMITS.decodedBytes,
        }),
      );
      if (
        systemsDocument.system.layers.reduce((n, l) => n + l.nodes.length, 0) >
          2000 ||
        systemsDocument.system.layers.reduce(
          (n, l) => n + l.edges.length,
          systemsDocument.system.refinements.length,
        ) > 10000
      )
        systemsDocument = null;
    } catch {
      systemsDocument = null;
    }
  }
  // Systems owns its embedded Sources, just as in the live viewer.
  const sources = systemsDocument
    ? validate(() =>
        validateSources(
          systemsDocument.source.manifest,
          systemsDocument.source.bundle,
          { maxDecodedBytes: VIEWER_LIMITS.decodedBytes },
        ),
      )
    : verified;
  return {
    origin,
    discovery,
    verified: sources,
    system: systemsDocument?.system || null,
    systemsDocument,
    archivedAt: project.archive.retrievedAt,
  };
}
