export default function NotFound() {
  return (
    <main className="viewer-shell">
      <h1>Snapshot not found</h1>
      <p>This snapshot is unavailable or the hash is invalid.</p>
      <a href="/projects">Explore projects →</a>
    </main>
  );
}
