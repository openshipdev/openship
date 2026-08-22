import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="OpenShip home">
        OpenShip<span aria-hidden="true">*</span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/docs/overview">Protocol</Link>
        <Link href="/skill/SKILL.md">Raw skill</Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>OpenShip v1 · A protocol for projects that can show their work.</p>
      <Link href="/docs/overview">Documentation ↗</Link>
    </footer>
  );
}
