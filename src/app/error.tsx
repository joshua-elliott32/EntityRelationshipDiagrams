"use client";

import { useEffect } from "react";

const DRAFT_KEY = "erd-studio:diagram";

/**
 * Last-resort error screen. The diagram is autosaved to localStorage, so the
 * most useful thing we can offer is a way to download that draft before
 * trying again.
 */
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  function downloadDraft() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(DRAFT_KEY);
    } catch {
      raw = null;
    }
    if (!raw) {
      alert("No saved diagram was found in this browser.");
      return;
    }
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "erd-studio-recovered.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main style={{ maxWidth: 520, margin: "15vh auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        ERD Studio hit an unexpected error. Your diagram is saved in this browser — download a copy
        first if you&rsquo;re worried, then try again.
      </p>
      <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={downloadDraft}>
          Download my diagram
        </button>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
      </p>
    </main>
  );
}
