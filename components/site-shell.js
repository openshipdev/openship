import Link from "next/link";
import ThemeToggle from "../app/theme-toggle";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="OpenShip home">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-divider" aria-hidden="true">
          /
        </span>
        OpenShip
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/docs/overview">Docs</Link>
        <Link href="/skill/SKILL.md">Skill</Link>
        <a href="https://github.com/openshipdev/openship" rel="noreferrer" target="_blank">
          Source
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>OpenShip v1.0 · Draft</p>
      <div className="footer-links">
        <Link href="/docs/overview">Docs</Link>
        <a href="https://github.com/openshipdev/openship" rel="noreferrer" target="_blank">
          GitHub ↗
        </a>
      </div>
    </footer>
  );
}
