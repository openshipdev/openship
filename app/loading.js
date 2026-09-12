import { SiteHeader, SiteFooter } from "../components/site-shell";

// Request-specific directory/docs content streams inside this boundary.
// /osh supplies its own more detailed viewer skeleton.
export default function Loading() {
  return (
    <>
      <SiteHeader />
      <main
        className="directory-shell"
        aria-busy="true"
        aria-label="Loading page"
        role="status"
      >
        <div aria-hidden="true">
          <div
            style={{
              height: 48,
              width: "55%",
              background: "var(--border)",
              marginBottom: 32,
            }}
          />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 110,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                marginBottom: 20,
              }}
            />
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
