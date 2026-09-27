"use client";

import dynamic from "next/dynamic";

/**
 * The editor depends on localStorage, canvas text measuring and pointer
 * events, so it is rendered only in the browser. The static HTML carries a
 * lightweight placeholder instead.
 */
const App = dynamic(() => import("./App").then((m) => m.App), {
  ssr: false,
  loading: () => (
    <div
      style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-soft)" }}
    >
      Loading ERD Studio…
    </div>
  ),
});

export function AppLoader() {
  return <App />;
}
