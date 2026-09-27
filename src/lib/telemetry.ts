/**
 * Helpers for the hosted site's anonymous usage and speed statistics.
 *
 * Share links carry the whole diagram in the URL fragment (`#d=…`), so every
 * address sent to Vercel Web Analytics or Speed Insights goes through
 * stripUrl first.
 */

/** `https://x.app/?a=1#d=…` → `https://x.app/` */
export function stripUrl(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

/** beforeSend hook for both Vercel scripts: keep the event, drop `?…` and `#…`. */
export function withoutQueryOrFragment<T extends { url: string }>(event: T): T {
  return { ...event, url: stripUrl(event.url) };
}
