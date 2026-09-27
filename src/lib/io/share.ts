import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { normalizeDiagram, type Diagram } from "@/lib/model";

/** Share links longer than this may be cut off by chat apps, email clients or servers. */
export const SHARE_URL_WARN_LENGTH = 8000;

/**
 * The diagram without anything `normalizeDiagram` would fill back in: no
 * `view`/`updatedAt`, and no fields that hold their default value.
 */
export function compactDiagram(d: Diagram): Record<string, unknown> {
  return {
    name: d.name,
    tables: d.tables.map((t) => {
      const o: Record<string, unknown> = { id: t.id, name: t.name, x: t.x, y: t.y };
      if (t.color) o.color = t.color;
      if (t.note) o.note = t.note;
      o.columns = t.columns.map((c) => {
        const col: Record<string, unknown> = { id: c.id, name: c.name, type: c.type };
        if (c.pk) col.pk = 1;
        if (c.unique) col.unique = 1;
        if (c.nullable) col.nullable = 1;
        if (c.multi) col.multi = 1;
        if (c.determinedBy.length) col.determinedBy = c.determinedBy;
        if (c.defaultValue) col.defaultValue = c.defaultValue;
        if (c.note) col.note = c.note;
        return col;
      });
      return o;
    }),
    rels: d.rels.map((r) => {
      const o: Record<string, unknown> = { id: r.id, from: r.from, to: r.to };
      if (r.fromCol) o.fromCol = r.fromCol;
      if (r.toCol) o.toCol = r.toCol;
      if (r.type !== "1:N") o.type = r.type;
      if (r.label) o.label = r.label;
      if (r.fromOptional) o.fromOptional = 1;
      if (!r.toOptional) o.toOptional = 0;
      if (r.onDelete !== "NO ACTION") o.onDelete = r.onDelete;
      if (r.onUpdate !== "NO ACTION") o.onUpdate = r.onUpdate;
      return o;
    }),
  };
}

/** A URL fragment (`#d=…`) that encodes the whole diagram, compressed. */
export function toShareHash(d: Diagram): string {
  return "#d=" + compressToEncodedURIComponent(JSON.stringify(compactDiagram(d)));
}

/** Decode a `#d=…` fragment (or `d=…`); null if absent or invalid. */
export function fromShareHash(hash: string): Diagram | null {
  try {
    const part = String(hash ?? "")
      .replace(/^#/, "")
      .split("&")
      .find((p) => p.startsWith("d="));
    if (!part) return null;
    const json = decompressFromEncodedURIComponent(part.slice(2));
    if (!json) return null;
    const d = normalizeDiagram(JSON.parse(json));
    return { ...d, view: null, updatedAt: 0 };
  } catch {
    return null;
  }
}

/** Length of the full share link for `baseUrl` (e.g. `location.origin + location.pathname`). */
export function shareUrlLength(d: Diagram, baseUrl = ""): number {
  return baseUrl.length + toShareHash(d).length;
}
