import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "../../components/site-shell";
import MarkdownDocument from "../../components/markdown-document";
import {
  documents,
  getDocument,
  readDocument,
  rawDocumentUrl,
} from "../../lib/protocol";
export const metadata = { title: "Docs" };
export default async function Docs({ searchParams }) {
  const { topic } = await searchParams;
  const document = topic ? getDocument(topic) : null;
  if (topic && !document) notFound();
  return (
    <>
      <SiteHeader />
      <main className="docs-shell">
        <aside className="docs-nav" aria-label="Documentation">
          <Link href="/docs">Get started</Link>
          {documents.map((d) => (
            <Link
              key={d.slug}
              href={`/docs?topic=${d.slug}`}
              aria-current={topic === d.slug ? "page" : undefined}
            >
              {d.title}
            </Link>
          ))}
          <div className="nav-raw">
            <Link href="/skill/SKILL.md">Agent skill ↗</Link>
            <Link href="/skill/references/schemas">Schemas ↗</Link>
            <Link href="/skill/references/examples/valid">Examples ↗</Link>
            <a href="https://www.npmjs.com/package/@openship/protocol">
              Protocol package ↗
            </a>
            <a href="https://github.com/openshipdev/openship/tree/main/packages/protocol">
              Package docs ↗
            </a>
          </div>
        </aside>
        <article className="docs-content">
          {document ? (
            <>
              <header className="docs-hero">
                <h1>{document.title}</h1>
                <p>{document.summary}</p>
                <Link href={rawDocumentUrl(document)}>Raw Markdown ↗</Link>
              </header>
              <div className="prose">
                <MarkdownDocument markdown={await readDocument(document)} />
              </div>
            </>
          ) : (
            <div className="prose">
              <h1>Get started with OpenShip.</h1>
              <p>
                OpenShip is a public interface for understanding a software
                project. Projects publish their source files and, optionally, a
                diagram of the system around them.
              </p>
              <h2>Explore a project</h2>
              <p>
                Paste its public URL into the <Link href="/view">viewer</Link>.
                Select a design layer or deployed instance, then click a
                component to explore its documents and code.
              </p>
              <h2>Share your project</h2>
              <p>
                Give your coding agent the{" "}
                <Link href="/skill/SKILL.md">OpenShip skill</Link>. It explains
                how to publish discovery at{" "}
                <code>/.well-known/openship.json</code> and a verifiable source
                snapshot. Add Systems to describe your architecture.
              </p>
              <h2>Save a snapshot</h2>
              <p>
                Valid projects you view appear in the{" "}
                <Link href="/projects">directory</Link>. Sign in with GitHub or
                Google to archive the project’s published data. Saved projects
                refresh daily, with earlier versions retained.
              </p>
              <h2>Build an integration</h2>
              <p>
                Use{" "}
                <a href="https://www.npmjs.com/package/@openship/protocol">
                  @openship/protocol
                </a>{" "}
                for validation and the CLI. Read the{" "}
                <Link href="/docs?topic=overview">protocol overview</Link>, then
                explore the schemas and examples.
              </p>
            </div>
          )}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
