import Link from "next/link";
export default function ProjectCard({ project: p, children }) {
  return (
    <article className="project-card">
      <div className="project-card-title">
        <Link
          className="project-card-link"
          href={
            p.oshHash
              ? `/osh/${p.oshHash}`
              : `/view?url=${encodeURIComponent(p.origin)}`
          }
        >
          <h2>{p.name}</h2>
        </Link>
        <div className="project-badges">
          {p.featuredPosition && <span>Featured</span>}
          {p.isTop && <span>Top</span>}
          {p.isPromoted && <span>Promoted</span>}
          {p.hidden && <span>Hidden</span>}
        </div>
      </div>
      <p className="project-card-description">{p.productDescription}</p>
      <div className="project-caption">
        <a
          className="project-website-link"
          href={p.origin}
          target="_blank"
          rel="noreferrer"
          aria-label={`Visit ${p.name} website (opens in a new tab)`}
          title={new URL(p.origin).hostname}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3h7v7M21 3 10 14" />
            <path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
          </svg>
        </a>
        <span>{p.hasFullBundle ? "Snapshot saved" : "Metadata only"}</span>
        {p.availability !== "available" && <span>{p.availability}</span>}
        <span>
          {p.lastRetrievedAt
            ? `Retrieved ${new Date(p.lastRetrievedAt).toISOString().slice(0, 10)}`
            : "Awaiting retrieval"}
        </span>
      </div>
      {children}
    </article>
  );
}
