import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-shell";
import { sourcesManifest } from "../../lib/openship-sources.generated.js";

export const metadata = {
  title: "OpenShip interface",
  description: "The human- and agent-readable OpenShip interface for openship.dev.",
};

const endpoints = [
  {
    label: "Discovery",
    href: "/.well-known/openship.json",
    detail: "Authoritative capability index and agent instructions",
  },
  {
    label: "Agent skill",
    href: "/skill/SKILL.md",
    detail: "Required instructions for interpreting this interface",
  },
  {
    label: "Sources manifest",
    href: "/openship/manifest.json",
    detail: "Authoritative file metadata, hashes, and snapshot totals",
  },
  {
    label: "Sources bundle",
    href: "/openship/bundle.json",
    detail: "Authoritative content for every file in the snapshot",
  },
];

function formatBytes(bytes) {
  return `${bytes.toLocaleString("en")} bytes`;
}

export default function OpenShipPage() {
  return (
    <>
      <SiteHeader />
      <main className="openship-shell">
        <section className="openship-hero" aria-labelledby="openship-title">
          <p className="status-line">OpenShip interface · Sources</p>
          <h1 id="openship-title">OpenShip for OpenShip.</h1>
          <p className="openship-summary">{sourcesManifest.project.description}</p>
          <p className="openship-explanation">
            This is {sourcesManifest.project.name}’s OpenShip page. OpenShip is a public interface
            that lets a running project publish a verifiable source snapshot and optionally
            advertise ways to propose isolated changes or understand its wider system.
          </p>
        </section>

        <aside className="agent-notice" aria-labelledby="agent-start-title">
          <p className="status-line">For agents</p>
          <h2 id="agent-start-title">Start with discovery.</h2>
          <p>
            Fetch <Link href="/.well-known/openship.json">discovery</Link>, then fetch and read its
            <code> agent.skill</code> before interpreting or using any advertised capability.
          </p>
        </aside>

        <section className="capability-section" aria-labelledby="capabilities-title">
          <div className="section-heading">
            <div>
              <p className="status-line">Advertised capability 01</p>
              <h2 id="capabilities-title">Sources</h2>
            </div>
            <p>
              Retrieve and verify the exact source snapshot published by this deployment. This
              origin does not currently advertise Changes or Systems.
            </p>
          </div>

          <dl className="snapshot-stats" aria-label="Current Sources snapshot">
            <div>
              <dt>Digest</dt>
              <dd>
                <code>{sourcesManifest.digest}</code>
              </dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>{sourcesManifest.totals.files.toLocaleString("en")}</dd>
            </div>
            <div>
              <dt>Bytes</dt>
              <dd>{formatBytes(sourcesManifest.totals.bytes)}</dd>
            </div>
          </dl>
        </section>

        <section className="interface-section" aria-labelledby="interface-title">
          <div className="section-heading">
            <div>
              <p className="status-line">Public interface</p>
              <h2 id="interface-title">Authoritative documents</h2>
            </div>
            <p>
              This page is explanatory. The linked discovery, skill, Manifest, and Bundle are the
              authoritative machine-readable interface.
            </p>
          </div>
          <div className="interface-links">
            {endpoints.map((endpoint) => (
              <Link href={endpoint.href} className="interface-link" key={endpoint.href}>
                <span>{endpoint.label}</span>
                <code>{endpoint.href}</code>
                <small>{endpoint.detail}</small>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
