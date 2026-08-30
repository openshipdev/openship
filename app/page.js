import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-shell";

const resources = [
  {
    label: "Protocol",
    links: [
      { name: "Overview", detail: "Discovery and conventions", href: "/docs/overview" },
      { name: "Sources", detail: "Verifiable source snapshots", href: "/docs/sources" },
      { name: "MCP", detail: "Optional Sources transport", href: "/docs/mcp" },
      { name: "Changes", detail: "Isolated candidate versions", href: "/docs/changes" },
      { name: "Systems", detail: "Complete system descriptions", href: "/docs/systems" },
    ],
  },
  {
    label: "Use",
    links: [
      { name: "SKILL.md", detail: "Portable agent router", href: "/skill/SKILL.md" },
      {
        name: "Schemas",
        detail: "Machine-readable contracts",
        href: "/skill/references/schemas",
      },
      {
        name: "Examples",
        detail: "Valid conformance fixtures",
        href: "/skill/references/examples/valid",
      },
    ],
  },
  {
    label: "Build",
    links: [
      {
        name: "@openship/protocol",
        detail: "Types, validators, helpers, and CLI",
        href: "https://www.npmjs.com/package/@openship/protocol",
        external: true,
      },
      {
        name: "Package docs",
        detail: "Consumer and synchronization workflow",
        href: "https://github.com/openshipdev/openship/tree/main/packages/protocol",
        external: true,
      },
      {
        name: "Source",
        detail: "OpenShip on GitHub",
        href: "https://github.com/openshipdev/openship",
        external: true,
      },
    ],
  },
];

function ResourceLink({ resource }) {
  const content = (
    <>
      <span className="resource-name">{resource.name}</span>
      <span className="resource-detail">{resource.detail}</span>
      <span className="resource-arrow" aria-hidden="true">
        {resource.external ? "↗" : "→"}
      </span>
    </>
  );

  return resource.external ? (
    <a className="resource-link" href={resource.href} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <Link className="resource-link" href={resource.href}>
      {content}
    </Link>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="home-shell">
        <section className="home-intro" aria-labelledby="home-title">
          <p className="status-line">Open protocol · v1.0 · draft</p>
          <h1 id="home-title">A public interface for running software.</h1>
          <p className="home-summary">
            OpenShip is a public interface that lets running projects publish their source,
            accept isolated changes, and describe the system around them.
          </p>
          <Link className="endpoint" href="/docs/overview">
            <span className="prompt" aria-hidden="true">
              $
            </span>
            <code>GET /.well-known/openship.json</code>
            <span aria-hidden="true">→</span>
          </Link>
        </section>

        <section className="resource-index" aria-labelledby="resource-title">
          <h2 id="resource-title">Find anything</h2>
          {resources.map((group) => (
            <div className="resource-group" key={group.label}>
              <h3>{group.label}</h3>
              <div className="resource-list">
                {group.links.map((resource) => (
                  <ResourceLink key={resource.name} resource={resource} />
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
