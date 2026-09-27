import { findTable, isForeignKey, type Diagram, type Relationship } from "@/lib/model";

/** Mermaid entity/attribute names: letters, digits, `_` and `-`. */
function mermaidName(name: string, fallback: string): string {
  const s = name
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "");
  if (!s) return fallback;
  return /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

/** Attribute types allow letters, digits, `_`, `-`, `(`, `)`, `[` and `]` — no commas or spaces. */
function mermaidType(type: string): string {
  const s = type
    .trim()
    .replace(/\s*,\s*/g, "-")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_()[\]-]/g, "");
  if (!s) return "unknown";
  return /^[A-Za-z_]/.test(s) ? s : `_${s}`;
}

function quoteText(s: string): string {
  return `"${s.replace(/\s*[\r\n]+\s*/g, " ").replace(/"/g, "'")}"`;
}

/** Crow's-foot markers for a relationship, parent on the left. */
export function mermaidConnector(r: Relationship): string {
  // Left marker: how many parents a child has (fromOptional → may have none).
  const left = r.type === "N:M" ? (r.fromOptional ? "}o" : "}|") : r.fromOptional ? "|o" : "||";
  // Right marker: how many children a parent has (toOptional → may have none).
  const many = r.type !== "1:1";
  const right = many ? (r.toOptional ? "o{" : "|{") : r.toOptional ? "o|" : "||";
  return `${left}--${right}`;
}

/** Mermaid `erDiagram` source. */
export function toMermaid(d: Diagram): string {
  const out = ["erDiagram"];
  const ids = new Map<string, string>();
  const used = new Set<string>();
  d.tables.forEach((t, i) => {
    const base = mermaidName(t.name, `table_${i + 1}`);
    let id = base;
    for (let n = 2; used.has(id.toLowerCase()); n++) id = `${base}_${n}`;
    used.add(id.toLowerCase());
    ids.set(t.id, id);
  });

  for (const t of d.tables) {
    const id = ids.get(t.id)!;
    if (!t.columns.length) {
      out.push(`    ${id} {`, "    }");
      continue;
    }
    out.push(`    ${id} {`);
    t.columns.forEach((c, i) => {
      const keys: string[] = [];
      if (c.pk) keys.push("PK");
      if (isForeignKey(d, t.id, c.id)) keys.push("FK");
      if (c.unique && !c.pk) keys.push("UK");
      let line = `        ${mermaidType(c.type)} ${mermaidName(c.name, `column_${i + 1}`)}`;
      if (keys.length) line += ` ${keys.join(", ")}`;
      if (c.note.trim()) line += ` ${quoteText(c.note.trim())}`;
      out.push(line);
    });
    out.push("    }");
  }

  for (const r of d.rels) {
    if (!findTable(d, r.from) || !findTable(d, r.to)) continue;
    const label = r.label.trim() || (r.type === "N:M" ? "relates to" : "has");
    const text = /^[A-Za-z0-9_-]+$/.test(label) ? label : quoteText(label);
    out.push(`    ${ids.get(r.from)} ${mermaidConnector(r)} ${ids.get(r.to)} : ${text}`);
  }
  return out.join("\n") + "\n";
}
