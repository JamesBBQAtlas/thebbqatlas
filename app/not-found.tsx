/**
 * Root not-found — catches fully-unmatched top-level URLs that never enter the
 * [locale] segment (so the localized not-found + layout don't apply). It renders
 * its own <html>/<body> with inline styles (no globals/fonts guaranteed here),
 * matching the branded "This pit's gone cold." treatment.
 */
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
          background: "#0c0907",
          color: "#f5efe6",
          fontFamily: "Georgia, 'Times New Roman', serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "0.75rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#e0a43b",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          404 — Off the map
        </p>
        <h1 style={{ margin: 0, fontSize: "2.25rem", fontWeight: 700 }}>
          This pit&apos;s gone cold.
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "28rem",
            opacity: 0.75,
            fontFamily: "system-ui, sans-serif",
            fontSize: "1rem",
          }}
        >
          We couldn&apos;t find that page. Let&apos;s get you back to the good
          stuff.
        </p>
        <div
          style={{
            marginTop: "1.25rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <a
            href="/map"
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "0.5rem",
              background: "#e0a43b",
              color: "#171310",
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Explore the map
          </a>
          <a
            href="/directory"
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(245,239,230,0.25)",
              color: "#f5efe6",
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            Browse the directory
          </a>
        </div>
      </body>
    </html>
  );
}
