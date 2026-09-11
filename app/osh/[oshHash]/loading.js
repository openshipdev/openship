// Next wraps the page in Suspense with this fallback.
export default function OshLoading() {
  return (
    <main
      className="viewer-shell osh-skeleton"
      aria-busy="true"
      aria-label="Loading saved snapshot"
      role="status"
    >
      <div aria-hidden="true">
        <div className="osh-placeholder osh-title" />
        <div className="osh-placeholder osh-description" />
        <div className="osh-placeholder osh-link" />
        <div className="osh-skeleton-tabs">
          <div className="osh-placeholder" />
          <div className="osh-placeholder" />
        </div>
        <div className="osh-skeleton-content">
          <div>
            {Array.from({ length: 8 }, (_, i) => (
              <div className="osh-placeholder osh-file" key={i} />
            ))}
          </div>
          <div>
            {Array.from({ length: 12 }, (_, i) => (
              <div className="osh-placeholder osh-code" key={i} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
