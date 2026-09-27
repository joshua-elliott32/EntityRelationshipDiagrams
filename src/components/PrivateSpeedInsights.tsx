"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";

/**
 * Vercel Speed Insights with the page address trimmed to its path.
 *
 * Share links carry the whole diagram in the URL fragment (`#d=…`), so the
 * fragment and any query string are removed before a measurement is sent.
 * Only timings, the path, and browser/device type reach Vercel.
 */
export function PrivateSpeedInsights() {
  return <SpeedInsights beforeSend={(event) => ({ ...event, url: stripUrl(event.url) })} />;
}

/** `https://x.app/?a=1#d=…` → `https://x.app/` */
export function stripUrl(url: string): string {
  return url.split(/[?#]/, 1)[0];
}
