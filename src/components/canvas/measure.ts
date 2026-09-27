import { estimateText, type FontKind, type TextMeasurer } from "@/lib/geometry";

/**
 * Text measuring for layout, backed by an offscreen canvas and the real page
 * fonts (Instrument Sans / JetBrains Mono, self-hosted by next/font).
 *
 * Web fonts load asynchronously, so widths measured before they arrive are
 * those of the fallback font. When the fonts finish loading the shared
 * "measure version" is bumped: every measurer drops its cache and
 * `useLayout` re-runs. Without a canvas (tests, SSR) `estimateText` is used.
 */

/** Font spec for each FontKind. Keep in sync with the renderer (DiagramSvg). */
export const FONT_SPECS: Record<
  FontKind,
  { weight: number; size: number; family: "sans" | "mono" }
> = {
  head: { weight: 600, size: 13, family: "sans" },
  col: { weight: 600, size: 12, family: "mono" },
  type: { weight: 400, size: 11, family: "mono" },
  key: { weight: 700, size: 9.5, family: "mono" },
  label: { weight: 600, size: 10.5, family: "mono" },
};

export const SANS_FALLBACK = `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
export const MONO_FALLBACK = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export interface FontFamilies {
  sans: string;
  mono: string;
}

/** The families next/font put on <html> (`--font-sans` / `--font-mono`), plus fallbacks. */
export function resolveFontFamilies(): FontFamilies {
  let sans = "";
  let mono = "";
  if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
    const cs = getComputedStyle(document.documentElement);
    sans = cs.getPropertyValue("--font-sans").trim();
    mono = cs.getPropertyValue("--font-mono").trim();
  }
  return {
    sans: sans ? `${sans}, ${SANS_FALLBACK}` : SANS_FALLBACK,
    mono: mono ? `${mono}, ${MONO_FALLBACK}` : MONO_FALLBACK,
  };
}

/** CSS `font` shorthand for a FontKind. */
export function fontCss(kind: FontKind, fam: FontFamilies): string {
  const s = FONT_SPECS[kind];
  return `${s.weight} ${s.size}px ${s.family === "sans" ? fam.sans : fam.mono}`;
}

// ---------------------------------------------------------------------------
// Measure version: bumped whenever web fonts finish loading.

let version = 0;
const listeners = new Set<() => void>();
let watching = false;

function bump(): void {
  version++;
  listeners.forEach((l) => l());
}

/** Increments each time fonts load and measured widths may have changed. */
export function getMeasureVersion(): number {
  return version;
}

/** Subscribe to measure-version changes (for useSyncExternalStore). */
export function subscribeMeasure(cb: () => void): () => void {
  listeners.add(cb);
  watchFonts();
  return () => void listeners.delete(cb);
}

function watchFonts(): void {
  if (watching || typeof document === "undefined" || !document.fonts) return;
  watching = true;
  const fonts = document.fonts;
  const fam = resolveFontFamilies();
  // Ask for every face we measure with, so they load even before anything
  // on the page uses them, then re-measure once they (and anything else) are in.
  const loads = (Object.keys(FONT_SPECS) as FontKind[]).map((k) =>
    fonts.load(fontCss(k, fam)).catch(() => []),
  );
  void Promise.all(loads).then(bump);
  void fonts.ready.then(bump);
  fonts.addEventListener?.("loadingdone", bump);
}

function hasCanvas(): boolean {
  if (typeof document === "undefined") return false;
  // jsdom implements <canvas> without a 2D context and logs an error when asked.
  if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) return false;
  return true;
}

/**
 * A cached text measurer using the real canvas fonts. Falls back to
 * `estimateText` when no 2D canvas context is available.
 */
export function createCanvasMeasurer(): TextMeasurer {
  const ctx = hasCanvas() ? document.createElement("canvas").getContext("2d") : null;
  if (!ctx) return estimateText;
  watchFonts();
  const cache = new Map<string, number>();
  let seen = -1;
  let fonts: Record<FontKind, string> | null = null;
  return (text, kind) => {
    if (seen !== version || !fonts) {
      seen = version;
      cache.clear();
      const fam = resolveFontFamilies();
      fonts = {
        head: fontCss("head", fam),
        col: fontCss("col", fam),
        type: fontCss("type", fam),
        key: fontCss("key", fam),
        label: fontCss("label", fam),
      };
    }
    const key = kind + "\u0000" + text;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = fonts[kind];
      w = ctx.measureText(text).width;
      cache.set(key, w);
    }
    return w;
  };
}

let shared: TextMeasurer | null = null;

/** One measurer shared by the canvas, `useLayout` and image export. */
export function sharedMeasurer(): TextMeasurer {
  if (!shared) shared = createCanvasMeasurer();
  return shared;
}
