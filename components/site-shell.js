import Link from "next/link";
import ThemeToggle from "../app/theme-toggle";
import AccountControl from "./account-control";
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="wordmark" href="/" aria-label="OpenShip home">
        <span className="brand-mark" aria-hidden="true" />
        OpenShip
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link href="/view">View</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/projects">Projects</Link>
        <AccountControl />
        <ThemeToggle />
      </nav>
    </header>
  );
}
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Open software. Understand how it works.</p>
      <div className="footer-links">
        <Link href="/docs">Docs</Link>
        <a
          href="https://github.com/openshipdev/openship"
          target="_blank"
          rel="noreferrer"
        >
          GitHub ↗
        </a>
      </div>
    </footer>
  );
}
