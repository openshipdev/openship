import Link from "next/link";
import { headers } from "next/headers";
import { SiteHeader, SiteFooter } from "../../components/site-shell";
import ProjectCard from "../../components/project-card";
import ProjectAdmin from "../../components/project-admin";
import { listProjects, workerHealth } from "../../lib/server/projects";
import { getSession, isAdmin } from "../../lib/server/auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };
export default async function ProjectsPage({ searchParams }) {
  const params = await searchParams;
  let result = { items: [], total: 0, page: 1 },
    admin = false,
    health = null,
    error = "";
  try {
    admin = isAdmin(await getSession(await headers()));
    result = await listProjects({
      q: params.q,
      filter: params.filter,
      page: params.page,
      admin,
    });
    if (admin) health = await workerHealth();
  } catch {
    error = "The project directory is temporarily unavailable.";
  }
  const href = (page) =>
    `/projects?${new URLSearchParams({ q: params.q || "", filter: params.filter || "all", page: String(page) })}`;
  return (
    <>
      <SiteHeader />
      <main className="directory-shell">
        <header>
          <h1>OpenShip projects.</h1>
          <p>
            Software you can look inside. Discover the source and design behind
            each project.
          </p>
        </header>
        <form className="directory-search">
          <input
            type="search"
            name="q"
            defaultValue={params.q || ""}
            placeholder="Search projects"
            aria-label="Search projects"
          />
          <select
            name="filter"
            defaultValue={params.filter || "all"}
            aria-label="Filter projects"
          >
            {["all", "featured", "top", "promoted", "unavailable"].map((f) => (
              <option value={f} key={f}>
                {f[0].toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
          <button>Search</button>
        </form>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            {result.items.map((p) => (
              <ProjectCard key={p.id} project={p}>
                {admin && <ProjectAdmin project={p} />}
              </ProjectCard>
            ))}
            {!result.items.length && (
              <p className="empty-directory">
                No projects here yet. <Link href="/view">Open a project</Link>{" "}
                to add it.
              </p>
            )}
            <nav className="pagination" aria-label="Directory pages">
              {result.page > 1 && (
                <Link href={href(result.page - 1)}>← Previous</Link>
              )}
              <span>{result.total} projects</span>
              {result.page * 24 < result.total && (
                <Link href={href(result.page + 1)}>Next →</Link>
              )}
            </nav>
          </>
        )}
        {health && (
          <details>
            <summary>Collection health</summary>
            <p>
              Last scheduler run: {health.lastRunAt?.toISOString() || "Never"}
            </p>
            {health.states.map((s) => (
              <p key={s.state}>
                {s.state}: {s.count}
              </p>
            ))}
          </details>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
