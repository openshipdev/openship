import Link from "next/link";
import { notFound } from "next/navigation";
import MarkdownDocument from "../../../components/markdown-document";
import { SiteFooter, SiteHeader } from "../../../components/site-shell";
import {
  documents,
  extractSections,
  getDocument,
  rawDocumentUrl,
  readDocument,
} from "../../../lib/protocol";

export function generateStaticParams() {
  return documents.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const document = getDocument(slug);
  if (!document) return {};
  return { title: document.title, description: document.summary };
}

export default async function DocumentationPage({ params }) {
  const { slug } = await params;
  const document = getDocument(slug);
  if (!document) notFound();
  const markdown = await readDocument(document);
  const sections = extractSections(markdown);

  return (
    <>
      <SiteHeader />
      <main className="docs-shell">
        <aside className="docs-nav" aria-label="Protocol documents">
          <p className="nav-label">OpenShip v1</p>
          {documents.map((item) => (
            <Link
              aria-current={item.slug === slug ? "page" : undefined}
              className={item.slug === slug ? "active" : undefined}
              href={`/docs/${item.slug}`}
              key={item.slug}
            >
              {item.title}
            </Link>
          ))}
          <div className="nav-raw">
            <p className="nav-label">Portable package</p>
            <Link href="/skill/SKILL.md">SKILL.md ↗</Link>
            <Link href="/skill/references/schemas/discovery.schema.json">JSON schemas ↗</Link>
            <Link href="/skill/references/examples/valid/discovery.json">Examples ↗</Link>
          </div>
        </aside>

        <article className="docs-content">
          <header className="docs-hero">
            <p className="kicker">{document.eyebrow}</p>
            <h1>{document.title}</h1>
            <p>{document.summary}</p>
            <Link className="raw-link" href={rawDocumentUrl(document)}>
              Raw Markdown ↗
            </Link>
          </header>
          <div className="prose">
            <MarkdownDocument markdown={markdown} />
          </div>
        </article>

        <aside className="on-this-page" aria-label="On this page">
          <p className="nav-label">On this page</p>
          {sections.map((section) => (
            <a href={`#${section.id}`} key={section.id}>
              {section.title}
            </a>
          ))}
        </aside>
      </main>
      <SiteFooter />
    </>
  );
}
