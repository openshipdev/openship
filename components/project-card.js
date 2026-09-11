import Link from "next/link";
export default function ProjectCard({ project: p, children }) {
  return (
    <article className="project-card">
      <div className="project-card-title">
        <Link
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
      <p>{p.description}</p>
      <div className="project-caption">
        <span>{new URL(p.origin).hostname}</span>
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
