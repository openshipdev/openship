import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-shell";

const capabilities = [
  {
    number: "01",
    name: "Sources",
    label: "The foundation",
    description:
      "A verifiable snapshot of the files that make a project what it is—safe to fetch, hash, inspect, and reproduce.",
    href: "/docs/sources",
  },
  {
    number: "02",
    name: "Changes",
    label: "The optional write path",
    description:
      "A proposal targets an exact source digest and can produce an isolated, inspectable candidate version.",
    href: "/docs/changes",
  },
  {
    number: "03",
    name: "Systems",
    label: "The complete model",
    description:
      "Sources plus the runtime graph, context, dataflow, dependencies, and artifacts that explain the live system.",
    href: "/docs/systems",
  },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />

      <main>
        <section className="hero">
          <p className="kicker">Open protocol · Version 1.0</p>
          <h1>A running project should explain itself.</h1>
          <p className="hero-copy">
            OpenShip gives people and agents a stable way to inspect a project’s exact
            source, propose a change, or understand the system that is actually running.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/docs/overview">
              Read the protocol <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button" href="/openship.md">
              View raw Markdown
            </Link>
          </div>
        </section>

        <section className="ladder" aria-labelledby="capabilities-title">
          <div className="section-intro">
            <p className="kicker">One protocol, three capabilities</p>
            <h2 id="capabilities-title">Start with proof. Add power deliberately.</h2>
          </div>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <Link className="capability-card" href={capability.href} key={capability.name}>
                <div className="card-meta">
                  <span>{capability.number}</span>
                  <span>{capability.label}</span>
                </div>
                <h3>{capability.name}</h3>
                <p>{capability.description}</p>
                <span className="card-link">Open specification ↗</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="install-band" aria-labelledby="install-title">
          <div>
            <p className="kicker">Portable by design</p>
            <h2 id="install-title">Install the whole skill. Load only what you need.</h2>
            <p>
              Add the <code>skills/openship</code> directory or zip to an agent. The short
              router points it to the overview, Sources, Changes, or Systems specification
              without loading the entire protocol every time.
            </p>
          </div>
          <div className="install-links">
            <Link href="/skill/SKILL.md">Open SKILL.md ↗</Link>
            <Link href="/skill/references/schemas/discovery.schema.json">Browse schemas ↗</Link>
            <Link href="/skill/references/examples/valid/discovery.json">See valid fixtures ↗</Link>
          </div>
        </section>

        <section className="discovery-band" aria-labelledby="discovery-title">
          <div>
            <p className="kicker">A predictable front door</p>
            <h2 id="discovery-title">Discovery begins at one well-known URL.</h2>
          </div>
          <code>/.well-known/openship.json</code>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
