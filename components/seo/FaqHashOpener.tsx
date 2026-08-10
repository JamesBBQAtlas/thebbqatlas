"use client";

import { useEffect } from "react";

/**
 * Part G — deep-link support for the FAQ accordion. If the page is opened with a
 * `#faq-…` hash (or the hash changes), open the matching <details> and scroll to
 * it. Progressive enhancement only: with JS off, every Q&A is still in the HTML.
 */
export function FaqHashOpener() {
  useEffect(() => {
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;
      const el = document.getElementById(id);
      if (el && el.tagName.toLowerCase() === "details") {
        (el as HTMLDetailsElement).open = true;
        el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);
  return null;
}
