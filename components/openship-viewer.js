"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadProvider, providerOrigin, resolveSelection, safeResourceUrl, selectionQuery } from "../lib/viewer";
import SystemView from "./viewer-system";

const allowLoopback = process.env.NODE_ENV === "development";

function download(name, content) {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function FileTree({ files, selected, onSelect, prefix = "", expand = false }) {
  const folders = new Map();
  const direct = [];
  for (const file of files) {
    const rest = file.metadata.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) direct.push(file);
    else {
      const folder = rest.slice(0, slash + 1);
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(file);
    }
  }
  return <ul>{[...folders].map(([folder, children]) => <li key={folder}><details open={expand || selected.startsWith(prefix + folder) ? true : undefined}><summary>{folder.slice(0, -1)}</summary><FileTree files={children} selected={selected} onSelect={onSelect} prefix={prefix + folder} expand={expand} /></details></li>)}{direct.map(({ metadata }) => <li key={metadata.path}><button className="viewer-file" aria-current={selected === metadata.path ? "true" : undefined} onClick={() => onSelect(metadata.path)} title={metadata.path}>{metadata.path.slice(prefix.length)}</button></li>)}</ul>;
}

function SourcesView({ snapshot, selection, onChange }) {
  const [query, setQuery] = useState("");
  const files = snapshot.verified.files;
  const matching = useMemo(() => files.filter(({ metadata }) => metadata.path.toLowerCase().includes(query.toLowerCase())), [files, query]);
  const file = files.find(({ metadata }) => metadata.path === selection.file);
  const text = useMemo(() => file?.metadata.encoding === "utf-8" ? new TextDecoder().decode(file.bytes) : null, [file]);
  return <div className="viewer-sources">
    <nav className="viewer-file-tree" aria-label="Source files"><label>Find a file<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search paths…" /></label><p className="viewer-muted">{matching.length} files</p><FileTree files={matching} selected={selection.file} onSelect={(path) => onChange({ file: path })} expand={Boolean(query)} />{!matching.length && <p>No matching files.</p>}</nav>
    <section className="viewer-file-content" aria-label="Selected source file">{file ? <><header><h2>{file.metadata.path}</h2><button onClick={() => download(file.metadata.path.split("/").at(-1), file.bytes)}>Download file</button></header><dl className="viewer-metadata"><div><dt>Format</dt><dd>{file.metadata.mediaType} · {file.metadata.encoding} · {file.metadata.type}</dd></div><div><dt>Size</dt><dd>{file.metadata.size.toLocaleString()} bytes</dd></div><div><dt>SHA-256</dt><dd>{file.metadata.sha256}</dd></div>{file.metadata.target && <div><dt>Symlink target</dt><dd>{file.metadata.target}</dd></div>}</dl>{text === null ? <p>Binary content. Download the verified file to inspect it.</p> : <>{text.length > 200000 && <p>Showing the first 200,000 characters. Download the complete file above.</p>}<pre className="viewer-code"><code>{text.slice(0, 200000)}</code></pre></>}</> : <p>This snapshot has no files.</p>}</section>
  </div>;
}

function Resources({ snapshot }) {
  const cap = snapshot.discovery.capabilities;
  const links = [["Discovery", `${snapshot.origin}/.well-known/openship.json`], ["Provider page", snapshot.discovery.page], ["Provider skill", snapshot.discovery.agent.skill], ["Manifest", cap.sources.manifest], ["Bundle", cap.sources.bundle], ["Archive", cap.sources.archive], ["Systems JSON", cap.systems?.document]];
  return <details className="viewer-resources"><summary>Downloads and provider resources</summary><div className="viewer-toolbar"><button onClick={() => download("manifest.json", JSON.stringify(snapshot.verified.manifest, null, 2))}>Download verified manifest</button><button onClick={() => download("bundle.json", JSON.stringify(snapshot.verified.bundle))}>Download verified bundle</button>{snapshot.system && <button onClick={() => download("systems.json", JSON.stringify(snapshot.systemsDocument))}>Download verified Systems</button>}</div><ul>{links.map(([name, value]) => safeResourceUrl(value) ? <li key={name}><a href={safeResourceUrl(value)} target="_blank" rel="noopener noreferrer">{name} ↗</a></li> : null)}</ul></details>;
}

export default function OpenShipViewer() {
  const [input, setInput] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [selection, setSelection] = useState(null);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState(null);
  const request = useRef(null);
  const loaded = useRef(null);

  const open = useCallback(async (value, params = new URLSearchParams(), preferSources = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null); setSnapshot(null); setSelection(null); loaded.current = null;
    setPhase("Reading provider…");
    try {
      const next = await loadProvider(value, { signal: controller.signal, allowLoopback, preferSources, onPhase: setPhase });
      if (controller.signal.aborted) return;
      const state = resolveSelection(params, next);
      loaded.current = next;
      setSnapshot(next); setSelection(state); setInput(next.origin);
      window.history.replaceState(null, "", selectionQuery(next.origin, state));
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure);
    } finally { if (!controller.signal.aborted) setPhase(""); }
  }, []);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const value = params.get("url") ?? "";
      setInput(value);
      if (!value) {
        request.current?.abort(); loaded.current = null; setSnapshot(null); setSelection(null); setError(null); setPhase("");
        return;
      }
      let origin;
      try { origin = providerOrigin(value, allowLoopback); } catch { /* open() reports invalid URLs. */ }
      if (loaded.current?.origin === origin) setSelection(resolveSelection(params, loaded.current));
      else void open(value, params);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => { request.current?.abort(); window.removeEventListener("popstate", restore); };
  }, [open]);

  const changeSelection = (patch) => {
    const next = { ...selection, ...patch };
    setSelection(next);
    window.history.pushState(null, "", selectionQuery(snapshot.origin, next));
  };

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ url: input });
    window.history.pushState(null, "", `?${params}`);
    void open(input, params);
  };

  return <main className="viewer-shell">
    <header className="viewer-heading"><p className="eyebrow">OPENSHIP / VIEWER</p><h1>Open a system.</h1><p>Explore a project’s verified sources and the architecture around them.</p></header>
    <form className="viewer-open-form" onSubmit={submit}><label htmlFor="provider-url">Provider URL</label><div><input id="provider-url" type="url" required placeholder="https://example.com" value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /><button type="submit">Open →</button></div></form>
    <p className="viewer-muted viewer-local-note">Read and validated in your browser. Public endpoints must allow CORS. No backend proxy, account, or uploaded project.</p>
    {phase && <div className="viewer-status" role="status"><span>{phase}</span><button onClick={() => { request.current?.abort(); setPhase(""); }}>Cancel</button></div>}
    {error && <div className="viewer-error" role="alert"><h2>{({ unsupported: "OpenShip not found", transport: "Connection or CORS error", validation: "Invalid OpenShip document", size: "Viewer limit exceeded", timeout: "Request timed out", url: "Invalid provider URL" })[error.code] ?? "Unable to open provider"}</h2><p>{error.message}</p>{error.sourcesAvailable && <button onClick={() => void open(new URLSearchParams(window.location.search).get("url"), new URLSearchParams({ view: "sources" }), true)}>Load advertised Sources instead</button>}</div>}
    {snapshot && selection && <>
      <section className="viewer-snapshot"><div><p className="viewer-verified">✓ Sources integrity verified{snapshot.system ? " · Systems validated" : ""}</p><h2>{snapshot.verified.manifest.project.name}</h2><p>{snapshot.verified.manifest.project.description}</p></div><dl className="viewer-metadata"><div><dt>Origin</dt><dd>{snapshot.origin}</dd></div><div><dt>Snapshot</dt><dd>{snapshot.verified.manifest.digest}</dd></div>{snapshot.verified.manifest.commit && <div><dt>Commit</dt><dd>{typeof snapshot.verified.manifest.commit === "string" ? snapshot.verified.manifest.commit : JSON.stringify(snapshot.verified.manifest.commit)}</dd></div>}<div><dt>Sources</dt><dd>{snapshot.verified.files.length} files · {snapshot.verified.decodedBytes.toLocaleString()} bytes</dd></div></dl><p className="viewer-muted">Integrity checks confirm the published snapshot is consistent, not that its code or claims are trustworthy.</p><Resources snapshot={snapshot} /></section>
      <div className="viewer-tabs viewer-primary-tabs" aria-label="Snapshot views"><button aria-pressed={selection.view === "sources"} onClick={() => changeSelection({ view: "sources" })}>Sources</button>{snapshot.system && <button aria-pressed={selection.view === "system"} onClick={() => changeSelection({ view: "system" })}>System</button>}</div>
      {selection.view === "sources" ? <SourcesView key={snapshot.origin + snapshot.verified.manifest.digest} snapshot={snapshot} selection={selection} onChange={changeSelection} /> : <SystemView snapshot={snapshot} selection={selection} onChange={changeSelection} />}
    </>}
    {!snapshot && !phase && !error && <section className="viewer-empty"><h2>One URL. Two perspectives.</h2><div><article><h3>01 / Sources</h3><p>Browse the exact files a project publishes, with verified hashes and downloadable snapshots.</p></article><article><h3>02 / System</h3><p>When available, explore component boundaries, connections, design documents, and links back to code.</p></article></div><a href="?url=https%3A%2F%2Fwww.openship.dev&view=sources">Explore OpenShip’s own sources →</a></section>}
  </main>;
}
