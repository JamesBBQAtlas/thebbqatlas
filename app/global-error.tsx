"use client";

import { useEffect } from "react";

/**
 * Root error boundary — the last line of defense. Renders its own <html>/<body>
 * because it replaces the root layout when an error escapes everything else.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

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
          gap: "1rem",
          background: "#171310",
          color: "#f5efe6",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
          The fire went out.
        </h1>
        <p style={{ maxWidth: "28rem", opacity: 0.8, margin: 0 }}>
          Something broke badly enough to take the whole page down. Please try
          again.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.5rem",
            padding: "0.65rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#e0a43b",
            color: "#171310",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
