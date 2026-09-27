import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Diagram } from "@/lib/model";
import type { AnalysisResult } from "@/lib/analysis";
import type { Settings } from "@/lib/settings/types";
import { DiagramSvg } from "@/components/canvas/DiagramSvg";
import { sharedMeasurer } from "@/components/canvas/measure";
import { PRINT } from "@/components/canvas/palette";
import { computeLayout, contentBounds } from "@/components/canvas/stableLayout";
import { embeddedFontCss, loadExportFonts } from "@/components/canvas/exportFonts";

export { loadExportFonts };

/**
 * SVG / PNG export of the diagram, drawn with the fixed light "print"
 * palette so exports look the same whatever theme the user is in.
 *
 * Fonts: table widths are measured with the real page fonts (Instrument Sans
 * and JetBrains Mono), so the export must render with those fonts too or long
 * names could overflow their boxes. The fonts are embedded in the SVG as
 * base64 `@font-face` rules, read from the page's own same-origin
 * next/font stylesheets (`/_next/static/media/*.woff2`) — only the faces whose
 * unicode-range covers characters used in the diagram. Fetching is async, so:
 *   - `toPngBlob` always awaits `loadExportFonts(d)` first;
 *   - `toSvgString` is sync and embeds whatever is already cached. The canvas
 *     warms the cache in the background once the page fonts are ready; call
 *     `await loadExportFonts(d)` before `toSvgString` to be certain.
 * Without embedded fonts the SVG names the same families followed by
 * generic fallbacks.
 */

export interface ImageExportOptions {
  settings: Settings;
  analysis: AnalysisResult | null;
  /** Draw the yellow issue highlights. */
  includeIssues: boolean;
}

const PAD = 36;
const TITLE_H = 40;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Render the diagram as a standalone SVG document string. */
export function toSvgString(d: Diagram, opts: ImageExportOptions): string {
  const { settings } = opts;
  const measure = sharedMeasurer();
  const layout = computeLayout(d.tables, d.rels, measure, {
    showDataTypes: settings.showDataTypes,
    lineStyle: settings.lineStyle,
  });
  const { boxes, routes } = layout;
  const title = d.name.trim();
  let b = contentBounds(d.rels, layout, measure, PAD);
  if (!boxes.size) b = { x: 0, y: 0, w: 320, h: 80 };
  const titleW = title ? measure(title, "head") * (18 / 13) + PAD * 2 : 0;
  const x = Math.floor(b.x);
  const y = Math.floor(b.y - (title ? TITLE_H : 0));
  const w = Math.ceil(Math.max(b.w, titleW) + (b.x - x));
  const h = Math.ceil(b.h + (title ? TITLE_H : 0) + (b.y - (title ? TITLE_H : 0) - y));

  const body = renderToStaticMarkup(
    createElement(DiagramSvg, {
      diagram: d,
      boxes,
      routes,
      analysis: opts.includeIssues ? opts.analysis : null,
      settings: {
        showDataTypes: settings.showDataTypes,
        notation: settings.notation,
        highlightIssues: opts.includeIssues,
      },
      selection: null,
      hover: null,
      linkFrom: null,
      palette: "print",
      measure,
    }),
  );

  const fontCss = embeddedFontCss(d);
  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">`,
    `<title>${esc(title || "Entity relationship diagram")}</title>`,
    fontCss ? `<defs><style>${fontCss}</style></defs>` : "",
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PRINT.paper}"/>`,
    title
      ? `<text x="${b.x + PAD}" y="${b.y + 6}" style="fill:${PRINT.ink};font-family:${esc(PRINT.sans)};font-size:18px;font-weight:700">${esc(title)}</text>`
      : "",
    body,
    `</svg>`,
  ];
  return parts.join("");
}

/** Render the diagram to a PNG (default 2× for crisp text). */
export async function toPngBlob(d: Diagram, opts: ImageExportOptions, scale = 2): Promise<Blob> {
  await loadExportFonts(d);
  const svg = toSvgString(d, opts);
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = m ? Number(m[1]) : 800;
  const h = m ? Number(m[2]) : 600;
  // Stay inside browsers' canvas limits (16k per side, ~64 MP area).
  const s = Math.max(
    0.1,
    Math.min(scale, 16000 / w, 16000 / h, Math.sqrt(64_000_000 / Math.max(1, w * h))),
  );

  const img = new Image();
  img.decoding = "async";
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  // Give embedded @font-face rules a moment to apply inside the SVG image.
  await new Promise((r) => setTimeout(r, 30));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s);
  canvas.height = Math.round(h * s);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = PRINT.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the PNG."))),
      "image/png",
    ),
  );
}
