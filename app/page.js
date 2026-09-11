import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { SiteFooter, SiteHeader } from "../components/site-shell";
import ProjectCard from "../components/project-card";
import { listProjects } from "../lib/server/projects";
async function FeaturedProjects() {
  await connection();
  let featured = [];
  try {
    featured = (await listProjects({ filter: "home" })).items;
  } catch {}
  if (!featured.length) return null;
  return (
    <section className="featured-projects">
      <div className="section-heading">
        <h2>Featured projects</h2>
        <Link href="/projects">All projects →</Link>
      </div>
      {featured.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="home-shell">
        <section className="home-intro">
          <p className="status-line">An open protocol for software</p>
          <h1>See how a project works.</h1>
          <p className="home-summary">
            OpenShip lets projects share their source code and system design.
            Open a project, explore its architecture, and understand what’s
            inside.
          </p>
          <form className="project-open" action="/view">
            <label htmlFor="home-url">Open an OpenShip project</label>
            <div>
              <input
                id="home-url"
                name="url"
                type="url"
                required
                placeholder="https://example.com"
              />
              <button>Open project →</button>
            </div>
          </form>
          <p className="intro-links">
            <Link href="/view?url=https%3A%2F%2Fopenship.dev">
              Try OpenShip’s own project ↗
            </Link>
            <Link href="/docs">Add OpenShip to your project →</Link>
          </p>
        </section>
        <Suspense fallback={null}>
          <FeaturedProjects />
        </Suspense>
        <section className="home-note">
          <h2>One URL. A shared understanding.</h2>
          <p>
            Projects publish a public snapshot of their code and design. You can
            explore without an account. Sign in to save a snapshot for
            everyone—even if the original site goes away.
          </p>
          <Link href="/projects">Explore the directory →</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
