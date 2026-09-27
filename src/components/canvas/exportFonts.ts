import type { Diagram } from "@/lib/model";

/**
 * Web-font embedding for image export. Reads the page's own (same-origin)
 * next/font @font-face rules, fetches the woff2 files the diagram needs and
 * turns them into base64 @font-face rules for the exported SVG. Kept apart
 * from src/lib/export/image.ts so the canvas can warm the cache without
 * pulling react-dom/server into the main bundle.
 */

const EXPORT_FAMILIES = ["Instrument Sans", "JetBrains Mono"];

interface FaceInfo {
  family: string;
  weight: string;
  style: string;
  range: [number, number][];
  url: string;
}

/** Font file URL → data: URL (null if it couldn't be fetched). */
const dataCache = new Map<string, Promise<string | null>>();
const dataReady = new Map<string, string>();

function parseRange(range: string): [number, number][] {
  if (!range.trim()) return [[0, 0x10ffff]];
  const out: [number, number][] = [];
  for (const tok of range.split(",")) {
    const t = tok.trim().replace(/^u\+/i, "");
    if (!t) continue;
    if (t.includes("?")) {
      out.push([parseInt(t.replace(/\?/g, "0"), 16), parseInt(t.replace(/\?/g, "f"), 16)]);
    } else if (t.includes("-")) {
      const [a, z] = t.split("-");
      out.push([parseInt(a, 16), parseInt(z, 16)]);
    } else {
      const n = parseInt(t, 16);
      out.push([n, n]);
    }
  }
  return out.filter(([a, z]) => Number.isFinite(a) && Number.isFinite(z));
}

function listFaces(): FaceInfo[] {
  if (typeof document === "undefined") return [];
  const faces: FaceInfo[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const st = rule.style;
      const family = st.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!EXPORT_FAMILIES.includes(family)) continue;
      const src = /url\(\s*(["']?)([^"')]+)\1\s*\)/.exec(st.getPropertyValue("src"));
      if (!src) continue;
      let url: string;
      try {
        url = new URL(src[2], sheet.href ?? document.baseURI).href;
      } catch {
        continue;
      }
      faces.push({
        family,
        weight: st.getPropertyValue("font-weight") || "400",
        style: st.getPropertyValue("font-style") || "normal",
        range: parseRange(st.getPropertyValue("unicode-range")),
        url,
      });
    }
  }
  return faces;
}

function usedCodePoints(d: Diagram | null): Set<number> {
  const cps = new Set<number>();
  // Always include printable ASCII: labels like "No columns yet", "PK", "1:N".
  for (let c = 0x20; c < 0x7f; c++) cps.add(c);
  if (!d) return cps;
  const add = (s: string) => {
    for (const ch of s) cps.add(ch.codePointAt(0)!);
  };
  add(d.name);
  for (const t of d.tables) {
    add(t.name);
    for (const c of t.columns) {
      add(c.name);
      add(c.type);
    }
  }
  for (const r of d.rels) add(r.label);
  return cps;
}

function neededFaces(d: Diagram | null): FaceInfo[] {
  const cps = [...usedCodePoints(d)];
  return listFaces().filter((f) => cps.some((c) => f.range.some(([a, z]) => c >= a && c <= z)));
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function formatOf(url: string): string {
  return /\.woff2(\?|$)/.test(url) ? "woff2" : /\.woff(\?|$)/.test(url) ? "woff" : "";
}

/** Fetch one font file as a data: URL (cached by URL; null on failure). */
function loadData(url: string): Promise<string | null> {
  let p = dataCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))))
      .then((buf) => {
        const fmt = formatOf(url);
        const data = `data:${fmt ? `font/${fmt}` : "application/octet-stream"};base64,${toBase64(buf)}`;
        dataReady.set(url, data);
        return data;
      })
      .catch(() => null);
    dataCache.set(url, p);
  }
  return p;
}

/**
 * Fetch and cache the web fonts an export of `d` needs (all Latin faces when
 * `d` is omitted). Safe to call repeatedly; never rejects.
 */
export async function loadExportFonts(d: Diagram | null = null): Promise<void> {
  if (typeof fetch !== "function") return;
  await Promise.all([...new Set(neededFaces(d).map((f) => f.url))].map(loadData));
}

/**
 * Cached @font-face rules for the faces `d` needs (sync; may be empty).
 * next/font serves variable fonts, so several weights of a family share one
 * file: faces are grouped by file and declared once with a weight range.
 */
export function embeddedFontCss(d: Diagram): string {
  if (!dataReady.size) return "";
  const groups = new Map<string, FaceInfo[]>();
  for (const f of neededFaces(d)) {
    if (!dataReady.has(f.url)) continue;
    const key = `${f.family}|${f.style}|${f.url}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  let css = "";
  for (const faces of groups.values()) {
    const f = faces[0];
    const weights = faces.flatMap((x) => x.weight.split(/\s+/).map(Number)).filter((n) => n > 0);
    const lo = weights.length ? Math.min(...weights) : 400;
    const hi = weights.length ? Math.max(...weights) : 400;
    const fmt = formatOf(f.url);
    const range = f.range.map(([a, z]) => `U+${a.toString(16)}-${z.toString(16)}`).join(",");
    css +=
      `@font-face{font-family:"${f.family}";font-style:${f.style};` +
      `font-weight:${lo === hi ? lo : `${lo} ${hi}`};` +
      `src:url(${dataReady.get(f.url)})${fmt ? ` format("${fmt}")` : ""};unicode-range:${range}}`;
  }
  return css;
}
