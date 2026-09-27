import { memo, type ReactNode } from "react";
import {
  endKinds,
  endText,
  endTextAt,
  estimateText,
  markerPath,
  METRICS,
  type Route,
  type TableBox,
  type TextMeasurer,
} from "@/lib/geometry";
import { keyLabel, type Diagram, type Relationship, type Selection, type Table } from "@/lib/model";
import type { AnalysisResult } from "@/lib/analysis";
import type { Settings } from "@/lib/settings/types";
import { PILL_H, pillText, pillWidth } from "./pill";
import { PRINT, SCREEN, type Palette } from "./palette";
import styles from "./canvas.module.css";

/**
 * The diagram drawing itself — tables, relationship lines, markers, labels —
 * as a pure function of its props. Used on screen (inside DiagramCanvas's
 * pan/zoom group) and for SVG/PNG export (palette "print"). Renders a <g> in
 * world coordinates; wrap it in an <svg>.
 *
 * Event handling is left to the host: elements carry `data-table`,
 * `data-rel`, `data-col` and `data-handle` attributes for delegation.
 */

export interface DiagramSvgProps {
  diagram: Diagram;
  boxes: Map<string, TableBox>;
  routes: Map<string, Route>;
  analysis: AnalysisResult | null;
  settings: Pick<Settings, "showDataTypes" | "highlightIssues" | "notation">;
  selection: Selection;
  hover: Selection;
  /** Link mode: null = off, "" = picking the parent, id = parent chosen. */
  linkFrom: string | null;
  palette: "screen" | "print";
  /** Measures label pills. Defaults to the geometry estimator. */
  measure?: TextMeasurer;
  /** Screen only: connector handles, wide hit areas and hover affordances. */
  interactive?: boolean;
}

const { HEAD_H, ROW_H, PAD_X, KEY_W } = METRICS;
const RADIUS = 6;
const SEP = "\u0001";

export const DiagramSvg = memo(function DiagramSvg(p: DiagramSvgProps) {
  const pal = p.palette === "print" ? PRINT : SCREEN;
  const measure = p.measure ?? estimateText;
  const interactive = !!p.interactive && p.palette === "screen";
  const { diagram: d, boxes, routes, selection, hover, linkFrom } = p;
  const showIssues = !!p.analysis && p.settings.highlightIssues;
  const flaggedCols = showIssues ? p.analysis!.flaggedColumns : null;

  const selTable = selection?.kind === "table" ? selection.id : null;
  const selRel = selection?.kind === "rel" ? selection.id : null;
  const hoverTable = hover?.kind === "table" ? hover.id : null;
  const hoverRel = hover?.kind === "rel" ? hover.id : null;

  // Lines touching the hovered table, or the hovered relationship, light up.
  const relState = (r: Relationship): number =>
    r.id === selRel
      ? 2
      : r.id === hoverRel || (hoverTable && (r.from === hoverTable || r.to === hoverTable))
        ? 1
        : 0;

  // Rows joined by the hovered/selected relationship are highlighted.
  const activeCols = new Map<string, string[]>();
  const markActive = (tableId: string, colId: string) => {
    if (!colId) return;
    const list = activeCols.get(tableId) ?? [];
    list.push(colId);
    activeCols.set(tableId, list);
  };
  for (const id of new Set([selRel, hoverRel])) {
    const r = id ? d.rels.find((x) => x.id === id) : undefined;
    if (!r) continue;
    markActive(r.from, r.fromCol);
    markActive(r.to, r.toCol);
  }

  // Relationships that point *into* each table decide its FK badges.
  const relsInto = new Map<string, Relationship[]>();
  for (const r of d.rels) {
    const list = relsInto.get(r.to) ?? [];
    list.push(r);
    relsInto.set(r.to, list);
  }

  const linkTarget = linkFrom && hoverTable && hoverTable !== linkFrom ? hoverTable : null;

  // Selected table on top; active lines above inactive ones.
  const tables = d.tables.slice();
  const si = selTable ? tables.findIndex((t) => t.id === selTable) : -1;
  if (si >= 0) tables.push(tables.splice(si, 1)[0]);
  const rels = d.rels
    .filter((r) => routes.has(r.id))
    .map((r) => ({ r, s: relState(r) }))
    .sort((a, b) => a.s - b.s);

  return (
    <g>
      <g>
        {rels.map(({ r, s }) => (
          <RelLine
            key={r.id}
            rel={r}
            route={routes.get(r.id)!}
            pal={pal}
            notation={p.settings.notation}
            state={s}
            interactive={interactive}
          />
        ))}
      </g>
      <g>
        {rels.map(({ r, s }) => (
          <RelLabel
            key={r.id}
            rel={r}
            route={routes.get(r.id)!}
            pal={pal}
            state={s}
            width={pillWidth(r, measure)}
            interactive={interactive}
          />
        ))}
      </g>
      <g>
        {tables.map((t) => {
          const box = boxes.get(t.id);
          if (!box) return null;
          const lite = { ...d, rels: relsInto.get(t.id) ?? [] };
          return (
            <TableView
              key={t.id}
              table={t}
              box={box}
              pal={pal}
              showTypes={p.settings.showDataTypes}
              keys={t.columns.map((c) => keyLabel(lite, t, c)).join(SEP)}
              flagged={
                flaggedCols
                  ? t.columns
                      .filter((c) => flaggedCols.has(c.id))
                      .map((c) => c.id)
                      .join(SEP)
                  : ""
              }
              issueCount={showIssues ? (p.analysis!.byTable[t.id] ?? 0) : 0}
              activeCols={(activeCols.get(t.id) ?? []).join(SEP)}
              selected={t.id === selTable}
              linkSource={!!linkFrom && t.id === linkFrom}
              linkTarget={t.id === linkTarget}
              interactive={interactive}
            />
          );
        })}
      </g>
    </g>
  );
});

// ---------------------------------------------------------------------------
// Tables

interface TableViewProps {
  table: Table;
  box: TableBox;
  pal: Palette;
  showTypes: boolean;
  /** keyLabel of each column, SEP-joined (strings keep memo comparisons cheap). */
  keys: string;
  /** Flagged column ids, SEP-joined. */
  flagged: string;
  issueCount: number;
  /** Column ids joined by the active relationship, SEP-joined. */
  activeCols: string;
  selected: boolean;
  linkSource: boolean;
  linkTarget: boolean;
  interactive: boolean;
}

const TableView = memo(function TableView(p: TableViewProps) {
  const { table: t, box, pal, interactive } = p;
  const w = box.w;
  const h = box.h;
  const name = t.name || "untitled";
  const keys = p.keys.split(SEP);
  const flagged = new Set(p.flagged ? p.flagged.split(SEP) : []);
  const active = new Set(p.activeCols ? p.activeCols.split(SEP) : []);
  const n = t.columns.length;
  const head = pal.head(t.color);
  const mono = pal.mono;

  const rows = t.columns.map((c, i) => {
    const cy = c.id in box.rowY ? box.rowY[c.id] - box.y : HEAD_H + i * ROW_H + ROW_H / 2;
    const top = Math.round(cy - ROW_H / 2);
    const base = top + 16;
    const flag = flagged.has(c.id);
    const act = active.has(c.id);
    const ink = flag ? pal.hlInk : pal.ink;
    const soft = flag ? pal.hlInk : pal.soft;
    const key = keys[i] ?? "";
    const isPk = key.includes("PK");
    const isFk = key.includes("FK");
    const parts: ReactNode[] = [];
    if (i > 0)
      parts.push(
        <line
          key="sep"
          x1={1}
          x2={w - 1}
          y1={top + 0.5}
          y2={top + 0.5}
          style={{ stroke: pal.rule, strokeWidth: 1 }}
        />,
      );
    if (act || flag)
      parts.push(
        <rect
          key="bg"
          x={4.5}
          y={top + 3.5}
          width={w - 9}
          height={ROW_H - 6}
          rx={3}
          style={{
            fill: flag ? pal.hl : pal.accentSoft,
            stroke: act ? pal.accent : "none",
            strokeWidth: 1,
          }}
        />,
      );
    if (isPk || isFk)
      parts.push(
        <text
          key="key"
          x={PAD_X}
          y={base}
          style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.2 }}
        >
          {isPk && <tspan style={{ fill: flag ? pal.hlInk : pal.accent }}>PK</tspan>}
          {isPk && isFk && " "}
          {isFk && (
            <tspan style={{ fill: flag ? pal.hlInk : pal.soft, fontStyle: "italic" }}>FK</tspan>
          )}
        </text>,
      );
    parts.push(
      <text
        key="name"
        x={PAD_X + KEY_W}
        y={base}
        style={{
          fill: ink,
          fontFamily: mono,
          fontSize: 12,
          fontWeight: c.pk ? 600 : 400,
          textDecoration: c.pk ? "underline" : undefined,
        }}
      >
        {c.name || "?"}
      </text>,
    );
    if (p.showTypes && c.type)
      parts.push(
        <text
          key="type"
          x={w - PAD_X}
          y={base}
          textAnchor="end"
          style={{ fill: soft, fontFamily: mono, fontSize: 11 }}
        >
          {c.type}
          {c.nullable && <tspan style={{ fill: flag ? pal.hlInk : pal.faint }}>?</tspan>}
        </text>,
      );
    if (interactive) {
      // Full-row hover target plus a connector handle on each side.
      parts.push(
        <rect key="hit" x={0} y={top} width={w} height={ROW_H} style={{ fill: "transparent" }} />,
      );
      for (const side of ["left", "right"] as const) {
        const hx = side === "left" ? 0 : w;
        parts.push(
          <circle
            key={`hh-${side}`}
            className={styles.handleHit}
            data-handle={side}
            cx={hx}
            cy={top + ROW_H / 2}
            r={8}
            style={{ fill: "transparent" }}
          />,
          <circle
            key={`h-${side}`}
            className={styles.handle}
            data-handle={side}
            cx={hx}
            cy={top + ROW_H / 2}
            r={4}
            style={{ fill: pal.card, stroke: pal.accent, strokeWidth: 1.5 }}
          />,
        );
      }
      return (
        <g key={c.id} className={styles.row} data-col={c.id}>
          {parts}
        </g>
      );
    }
    return <g key={c.id}>{parts}</g>;
  });

  const badge = p.issueCount > 0 ? String(p.issueCount > 99 ? "99+" : p.issueCount) : "";
  const badgeW = Math.max(18, badge.length * 7 + 8);

  return (
    <g
      data-table={t.id}
      className={interactive ? styles.table : undefined}
      transform={`translate(${box.x} ${box.y})`}
      role="group"
      aria-label={`Table ${name}, ${n} column${n === 1 ? "" : "s"}`}
    >
      {(p.selected || p.linkSource || p.linkTarget) && (
        <rect
          x={-4.5}
          y={-4.5}
          width={w + 9}
          height={h + 9}
          rx={RADIUS + 4}
          style={{
            fill: "none",
            stroke: pal.accent,
            strokeWidth: p.linkTarget && !p.selected && !p.linkSource ? 1.5 : 2,
            strokeDasharray: p.linkSource ? "5 4" : undefined,
          }}
        />
      )}
      <rect x={0} y={0} width={w} height={h} rx={RADIUS} style={{ fill: pal.card }} />
      <path
        d={`M0 ${HEAD_H}V${RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${RADIUS} 0H${w - RADIUS}A${RADIUS} ${RADIUS} 0 0 1 ${w} ${RADIUS}V${HEAD_H}Z`}
        style={{ fill: head }}
      />
      <text
        x={PAD_X}
        y={22}
        style={{ fill: pal.headFg, fontFamily: pal.sans, fontSize: 13, fontWeight: 600 }}
      >
        {name}
      </text>
      {badge && (
        <g aria-label={`${p.issueCount} issue${p.issueCount === 1 ? "" : "s"}`}>
          <rect
            x={w - 8 - badgeW}
            y={8}
            width={badgeW}
            height={18}
            rx={9}
            style={{ fill: pal.hl }}
          />
          <text
            x={w - 8 - badgeW / 2}
            y={21}
            textAnchor="middle"
            style={{ fill: pal.hlInk, fontFamily: pal.sans, fontSize: 11, fontWeight: 700 }}
          >
            {badge}
          </text>
        </g>
      )}
      {n === 0 && (
        <text
          x={PAD_X}
          y={HEAD_H + 16}
          style={{ fill: pal.soft, fontFamily: pal.sans, fontSize: 12, fontStyle: "italic" }}
        >
          No columns yet
        </text>
      )}
      {rows}
      <rect
        x={0.5}
        y={0.5}
        width={w - 1}
        height={h - 1}
        rx={RADIUS - 0.5}
        style={{ fill: "none", stroke: pal.border, strokeWidth: 1, pointerEvents: "none" }}
      />
    </g>
  );
});

// ---------------------------------------------------------------------------
// Relationships

interface RelProps {
  rel: Relationship;
  route: Route;
  pal: Palette;
  /** 0 normal, 1 highlighted (hover), 2 selected. */
  state: number;
  interactive: boolean;
}

const RelLine = memo(function RelLine(
  p: RelProps & { notation: DiagramSvgProps["settings"]["notation"] },
) {
  const { rel: r, route, pal, state, notation } = p;
  const [k0, k1] = endKinds(r);
  const stroke = state ? pal.accent : pal.line;
  const sw = state === 2 ? 2.25 : state === 1 ? 1.75 : 1.25;
  const markers = [markerPath(route.start, k0, notation), markerPath(route.end, k1, notation)]
    .filter(Boolean)
    .join(" ");
  const numeric = notation === "numeric";
  return (
    <g data-rel={r.id} className={p.interactive ? styles.rel : undefined}>
      {p.interactive && (
        <path d={route.d} style={{ fill: "none", stroke: "transparent", strokeWidth: 14 }} />
      )}
      <path
        d={route.d}
        style={{
          fill: "none",
          stroke,
          strokeWidth: sw,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      {markers && (
        // Only the optional-end circles enclose area: filling with the canvas
        // colour makes them hollow over the line.
        <path
          d={markers}
          style={{
            fill: pal.paper,
            stroke,
            strokeWidth: Math.min(sw, 1.75),
            strokeLinecap: "round",
            strokeLinejoin: "round",
          }}
        />
      )}
      {numeric &&
        (
          [
            [route.start, k0],
            [route.end, k1],
          ] as const
        ).map(([end, kind], i) => {
          const at = endTextAt(end);
          const label = endText(kind);
          // Mono font: ~0.6em per glyph. Push wide labels ("0..N") clear of
          // the table edge on horizontal ends.
          const half = (label.length * 10.5 * 0.6) / 2;
          const push = Math.abs(end.dir.x) > 0.5 ? Math.sign(end.dir.x) * Math.max(0, half - 9) : 0;
          return (
            <text
              key={i}
              x={at.x + push}
              y={at.y + 3.5}
              textAnchor="middle"
              style={{
                fill: stroke,
                fontFamily: pal.mono,
                fontSize: 10.5,
                fontWeight: 600,
                stroke: pal.paper,
                strokeWidth: 3,
                strokeLinejoin: "round",
                paintOrder: "stroke",
              }}
            >
              {label}
            </text>
          );
        })}
    </g>
  );
});

const RelLabel = memo(function RelLabel(p: RelProps & { width: number }) {
  const { rel: r, route, pal, state, width } = p;
  const { x, y } = route.labelAt;
  const text = pillText(r);
  if (!text) return null;
  const sel = state === 2;
  return (
    <g data-rel={r.id} className={p.interactive ? styles.rel : undefined}>
      <rect
        x={x - width / 2}
        y={y - PILL_H / 2}
        width={width}
        height={PILL_H}
        rx={PILL_H / 2}
        style={{
          fill: sel ? pal.accent : pal.card,
          stroke: state ? pal.accent : pal.line,
          strokeWidth: 1,
        }}
      />
      <text
        x={x}
        y={y + 3.6}
        textAnchor="middle"
        style={{
          fill: sel ? pal.accentInk : state ? pal.accent : pal.ink,
          fontFamily: pal.mono,
          fontSize: 10.5,
          fontWeight: 600,
        }}
      >
        {text}
      </text>
    </g>
  );
});
