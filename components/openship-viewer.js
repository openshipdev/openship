"use client";

import ProjectSummaries from "./project-summaries";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadProvider,
  providerOrigin,
  resolveSelection,
  selectionQuery,
} from "../lib/viewer";
import SystemView from "./viewer-system";
import { authClient } from "../lib/auth-client";
import { loadArchivedProvider } from "../lib/viewer";

const allowLoopback = process.env.NODE_ENV === "development";

function RetrievalTime({ value }) {
  const [label, setLabel] = useState(null);
  useEffect(() => {
    const date = new Date(value);
    const absolute = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "long",
    }).format(date);
    const relative = new Intl.RelativeTimeFormat(undefined, {
      numeric: "auto",
    });
    const update = () => {
      const seconds = (date.getTime() - Date.now()) / 1000;
      const [unit, size] = [
        ["year", 31536000],
        ["month", 2592000],
        ["week", 604800],
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
        ["second", 1],
      ].find(([, size]) => Math.abs(seconds) >= size) ?? ["second", 1];
      setLabel(
        `${absolute} (${relative.format(Math.trunc(seconds / size), unit)})`,
      );
    };
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, [value]);
  return <time dateTime={value}>{label ?? value}</time>;
}

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
  return (
    <ul>
      {[...folders].map(([folder, children]) => (
        <li key={folder}>
          <details
            open={
              expand || selected.startsWith(prefix + folder) ? true : undefined
            }
          >
            <summary>{folder.slice(0, -1)}</summary>
            <FileTree
              files={children}
              selected={selected}
              onSelect={onSelect}
              prefix={prefix + folder}
              expand={expand}
            />
          </details>
        </li>
      ))}
      {direct.map(({ metadata }) => (
        <li key={metadata.path}>
          <button
            className="viewer-file"
            aria-current={selected === metadata.path ? "true" : undefined}
            onClick={() => onSelect(metadata.path)}
            title={metadata.path}
          >
            {metadata.path.slice(prefix.length)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SourcesView({ snapshot, selection, onChange }) {
  const [query, setQuery] = useState("");
  const files = snapshot.verified.files;
  const matching = useMemo(
    () =>
      files.filter(({ metadata }) =>
        metadata.path.toLowerCase().includes(query.toLowerCase()),
      ),
    [files, query],
  );
  const file = files.find(({ metadata }) => metadata.path === selection.file);
  const text = useMemo(
    () =>
      file?.metadata.encoding === "utf-8"
        ? new TextDecoder().decode(file.bytes)
        : null,
    [file],
  );
  return (
    <div className="viewer-sources">
      <nav className="viewer-file-tree" aria-label="Source files">
        <label>
          Find a file
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search paths…"
          />
        </label>
        <p className="viewer-muted">{matching.length} files</p>
        <FileTree
          files={matching}
          selected={selection.file}
          onSelect={(path) => onChange({ file: path })}
          expand={Boolean(query)}
        />
        {!matching.length && <p>No matching files.</p>}
      </nav>
      <section
        className="viewer-file-content"
        aria-label="Selected source file"
      >
        {file ? (
          <>
            <header>
              <h2>{file.metadata.path}</h2>
              <button
                onClick={() =>
                  download(file.metadata.path.split("/").at(-1), file.bytes)
                }
              >
                Download file
              </button>
            </header>
            <details>
              <summary>File information</summary>
              <dl className="viewer-metadata">
                <div>
                  <dt>Format</dt>
                  <dd>
                    {file.metadata.mediaType} · {file.metadata.encoding} ·{" "}
                    {file.metadata.type}
                  </dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{file.metadata.size.toLocaleString()} bytes</dd>
                </div>
                <div>
                  <dt>SHA-256</dt>
                  <dd>{file.metadata.sha256}</dd>
                </div>
                {file.metadata.target && (
                  <div>
                    <dt>Symlink target</dt>
                    <dd>{file.metadata.target}</dd>
                  </div>
                )}
              </dl>
            </details>
            {text === null ? (
              <p>Binary content. Download the verified file to inspect it.</p>
            ) : (
              <>
                {text.length > 200000 && (
                  <p>
                    Showing the first 200,000 characters. Download the complete
                    file above.
                  </p>
                )}
                <pre className="viewer-code">
                  <code>{text.slice(0, 200000)}</code>
                </pre>
              </>
            )}
          </>
        ) : (
          <p>This snapshot has no files.</p>
        )}
      </section>
    </div>
  );
}

export default function OpenShipViewer({ initialSnapshot = null }) {
  const { data: session } = authClient.useSession();
  const [saveStatus, setSaveStatus] = useState("");
  const [input, setInput] = useState("");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [selection, setSelection] = useState(() =>
    initialSnapshot
      ? resolveSelection(new URLSearchParams(), initialSnapshot)
      : null,
  );
  const [phase, setPhase] = useState("");
  const [error, setError] = useState(null);
  const request = useRef(null);
  const loaded = useRef(null);

  const open = useCallback(
    async (value, params = new URLSearchParams(), preferSources = false) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setError(null);
      setSnapshot(null);
      setSelection(null);
      loaded.current = null;
      setPhase("Reading provider…");
      try {
        let next;
        try {
          next = await loadProvider(value, {
            signal: controller.signal,
            allowLoopback,
            preferSources,
            onPhase: setPhase,
          });
        } catch (liveError) {
          if (
            controller.signal.aborted ||
            preferSources ||
            (liveError.sourcesAvailable && liveError.code === "validation")
          )
            throw liveError;
          try {
            next = await loadArchivedProvider(value, {
              signal: controller.signal,
            });
          } catch {
            throw liveError;
          }
        }
        if (controller.signal.aborted) return;
        next = {
          ...next,
          retrievedAt: next.archivedAt ?? new Date().toISOString(),
        };
        const state = resolveSelection(params, next);
        loaded.current = next;
        setSnapshot(next);
        setSelection(state);
        setInput(next.origin);
        window.history.replaceState(
          null,
          "",
          selectionQuery(next.origin, state),
        );
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure);
      } finally {
        if (!controller.signal.aborted) setPhase("");
      }
    },
    [],
  );

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      if (initialSnapshot) {
        setSelection(resolveSelection(params, initialSnapshot));
        return;
      }
      const value = params.get("url") ?? "";
      setInput(value);
      if (!value) {
        request.current?.abort();
        loaded.current = null;
        setSnapshot(null);
        setSelection(null);
        setError(null);
        setPhase("");
        return;
      }
      let origin;
      try {
        origin = providerOrigin(value, allowLoopback);
      } catch {
        /* open() reports invalid URLs. */
      }
      if (loaded.current && loaded.current.origin === origin)
        setSelection(resolveSelection(params, loaded.current));
      else void open(value, params);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      request.current?.abort();
      window.removeEventListener("popstate", restore);
    };
  }, [open, initialSnapshot]);

  useEffect(() => {
    if (!snapshot || initialSnapshot) return;
    const controller = new AbortController();
    setSaveStatus("");
    fetch("/api/projects/observe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: snapshot.origin }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        setSaveStatus(
          result.state === "current"
            ? ""
            : session
              ? "Snapshot collection queued."
              : "Project discovery queued.",
        );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSaveStatus(
            "Viewing is available; saving is temporarily unavailable.",
          );
      });
    return () => controller.abort();
  }, [snapshot, session?.user?.id, initialSnapshot]);

  const changeSelection = (patch) => {
    const next = { ...selection, ...patch };
    setSelection(next);
    const params = new URLSearchParams(selectionQuery(snapshot.origin, next));
    if (initialSnapshot) params.delete("url");
    window.history.pushState(null, "", `?${params}`);
  };

  const submit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ url: input });
    window.history.pushState(null, "", `?${params}`);
    void open(input, params);
  };

  return (
    <main className={`viewer-shell${snapshot ? "" : " viewer-shell-empty"}`}>
      {!snapshot && (
        <>
          <header className="viewer-heading">
            <h1>Open a project.</h1>
            <p>Explore its source and system design.</p>
          </header>
          <form className="viewer-open-form" onSubmit={submit}>
            <label htmlFor="provider-url">Project URL</label>
            <div>
              <input
                id="provider-url"
                type="url"
                required
                placeholder="https://example.com"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                spellCheck={false}
              />
              <button type="submit">Open →</button>
            </div>
          </form>
        </>
      )}
      {phase && (
        <div className="viewer-status" role="status">
          <span>{phase}</span>
          <button
            onClick={() => {
              request.current?.abort();
              setPhase("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className="viewer-error" role="alert">
          <h2>
            {{
              unsupported: "OpenShip not found",
              transport: "Connection or CORS error",
              validation: "Invalid OpenShip document",
              size: "Viewer limit exceeded",
              timeout: "Request timed out",
              url: "Invalid provider URL",
            }[error.code] ?? "Unable to open provider"}
          </h2>
          <p>{error.message}</p>
          {error.sourcesAvailable && (
            <button
              onClick={() =>
                void open(
                  new URLSearchParams(window.location.search).get("url"),
                  new URLSearchParams({ view: "sources" }),
                  true,
                )
              }
            >
              Load advertised Sources instead
            </button>
          )}
        </div>
      )}
      {snapshot && selection && (
        <>
          <header className="viewer-project-heading">
            <h1>{snapshot.verified.manifest.project.name}</h1>
            <p className="viewer-project-description">
              {snapshot.verified.manifest.project.productDescription}
            </p>
          </header>
          <div
            className="viewer-tabs viewer-primary-tabs"
            role="tablist"
            aria-label="Snapshot views"
            onKeyDown={(event) => {
              const tabs = [
                ...event.currentTarget.querySelectorAll(
                  '[role="tab"]:not(:disabled)',
                ),
              ];
              const index = tabs.indexOf(document.activeElement);
              let next;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              tabs[next].focus();
              tabs[next].click();
            }}
          >
            {[
              { id: "summary", label: "Summary" },
              { id: "sources", label: "Sources" },
              { id: "system", label: "System", disabled: !snapshot.system },
            ].map(({ id, label, disabled }) => (
              <button
                key={id}
                id={`viewer-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={selection.view === id}
                aria-controls={`viewer-panel-${id}`}
                tabIndex={selection.view === id ? 0 : -1}
                disabled={disabled}
                title={disabled ? "No system design available" : undefined}
                onClick={() => changeSelection({ view: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <section
            id="viewer-panel-summary"
            role="tabpanel"
            aria-labelledby="viewer-tab-summary"
            hidden={selection.view !== "summary"}
            tabIndex={0}
          >
            <section className="viewer-summary">
              <p className="viewer-project-description">
                {snapshot.verified.manifest.project.productDescription}
              </p>
              <a href={snapshot.origin} target="_blank" rel="noreferrer">
                {snapshot.origin} ↗
              </a>
              <p className="viewer-muted">
                {snapshot.archivedAt && !initialSnapshot
                  ? "The live project is unavailable. Showing a saved snapshot retrieved"
                  : "Retrieved"}{" "}
                <RetrievalTime
                  value={snapshot.archivedAt ?? snapshot.retrievedAt}
                />
              </p>
              {saveStatus && (
                <p className="viewer-muted" role="status">
                  {saveStatus}
                </p>
              )}
            </section>
            <ProjectSummaries
              key={snapshot.origin}
              project={snapshot.verified.manifest.project}
              detail
            />
          </section>
          <section
            id="viewer-panel-sources"
            role="tabpanel"
            aria-labelledby="viewer-tab-sources"
            hidden={selection.view !== "sources"}
            tabIndex={0}
          >
            {selection.view === "sources" && (
              <SourcesView
                snapshot={snapshot}
                selection={selection}
                onChange={changeSelection}
              />
            )}
          </section>
          <section
            id="viewer-panel-system"
            role="tabpanel"
            aria-labelledby="viewer-tab-system"
            hidden={selection.view !== "system"}
            tabIndex={0}
          >
            {selection.view === "system" && snapshot.system && (
              <SystemView
                snapshot={snapshot}
                selection={selection}
                onChange={changeSelection}
              />
            )}
          </section>
        </>
      )}
      {!snapshot && !phase && !error && (
        <p className="viewer-muted">
          Enter a public OpenShip URL, or{" "}
          <a href="?url=https%3A%2F%2Fopenship.dev">
            explore OpenShip itself →
          </a>
        </p>
      )}
    </main>
  );
}
