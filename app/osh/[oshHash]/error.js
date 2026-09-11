"use client";

export default function OshError({ reset }) {
  return (
    <main className="viewer-shell">
      <h1>Unable to load this snapshot</h1>
      <p>The saved content could not be read. Please try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
