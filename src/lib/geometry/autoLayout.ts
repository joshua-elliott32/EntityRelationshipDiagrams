import type { Diagram } from "@/lib/model";
import type { Point } from "./types";
import { METRICS } from "./types";

/**
 * "Tidy up": a small, deterministic layered (Sugiyama-style) layout.
 *
 * 1. Split tables into connected components; lone tables go in a row at the end.
 * 2. Break cycles with a DFS (back edges are reversed), ignore self-links.
 * 3. Layer by longest path so every parent (rel.from) sits left of its children.
 * 4. Order each layer by barycentre, sweeping down and up a few times.
 * 5. Stack each layer, then pull tables toward the centre of their neighbours
 *    while keeping order and spacing. Everything snaps to a 10px grid.
 */

export const AUTO_LAYOUT = { GAP_X: 120, GAP_Y: 50, COMPONENT_GAP: 90, GRID: 10 } as const;

interface Size {
  w: number;
  h: number;
}

const snapUp = (v: number) => Math.ceil(v / AUTO_LAYOUT.GRID - 1e-9) * AUTO_LAYOUT.GRID;
const snap = (v: number) => Math.round(v / AUTO_LAYOUT.GRID) * AUTO_LAYOUT.GRID;

/** "Tidy up": new top-left positions for every table. */
export function autoLayout(
  d: Diagram,
  boxes: Map<string, { w: number; h: number }>,
): Map<string, Point> {
  const ids = d.tables.map((t) => t.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const size: Size[] = d.tables.map((t) => {
    const b = boxes.get(t.id);
    return b
      ? { w: b.w, h: b.h }
      : { w: METRICS.MIN_W, h: METRICS.HEAD_H + Math.max(1, t.columns.length) * METRICS.ROW_H };
  });
  const n = ids.length;
  const out = new Map<string, Point>();
  if (!n) return out;

  // Edges between distinct, existing tables (deduplicated, direction kept).
  const succ: number[][] = Array.from({ length: n }, () => []);
  const und: number[][] = Array.from({ length: n }, () => []);
  const seen = new Set<string>();
  for (const r of d.rels) {
    const a = index.get(r.from);
    const b = index.get(r.to);
    if (a === undefined || b === undefined || a === b) continue;
    const key = `${a}>${b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    succ[a].push(b);
    und[a].push(b);
    und[b].push(a);
  }

  // Connected components, in table order.
  const comp = new Array<number>(n).fill(-1);
  const comps: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const list: number[] = [];
    const stack = [i];
    comp[i] = comps.length;
    while (stack.length) {
      const v = stack.pop()!;
      list.push(v);
      for (const w of und[v]) {
        if (comp[w] < 0) {
          comp[w] = comps.length;
          stack.push(w);
        }
      }
    }
    list.sort((p, q) => p - q);
    comps.push(list);
  }
  const connected = comps
    .filter((c) => c.length > 1)
    .sort((p, q) => q.length - p.length || p[0] - q[0]);
  const lonely = comps.filter((c) => c.length === 1).map((c) => c[0]);

  // Keep the tidied diagram roughly where it was.
  const originX = snap(Math.min(...d.tables.map((t) => t.x)));
  const originY = snap(Math.min(...d.tables.map((t) => t.y)));

  let y = originY;
  let maxW = 0;
  for (const c of connected) {
    const pos = layoutComponent(
      c,
      succ,
      size,
      d.tables.map((t) => t.y),
    );
    let w = 0;
    let h = 0;
    pos.forEach((p, v) => {
      w = Math.max(w, p.x + size[v].w);
      h = Math.max(h, p.y + size[v].h);
    });
    pos.forEach((p, v) => out.set(ids[v], { x: originX + p.x, y: y + p.y }));
    y = snapUp(y + h + AUTO_LAYOUT.COMPONENT_GAP);
    maxW = Math.max(maxW, w);
  }

  // Lone tables: rows, wrapping at the width of the widest component (or 1200px).
  const rowLimit = Math.max(maxW, 1200);
  let x = 0;
  let rowH = 0;
  for (const v of lonely) {
    if (x > 0 && x + size[v].w > rowLimit) {
      y = snapUp(y + rowH + AUTO_LAYOUT.GAP_Y);
      x = 0;
      rowH = 0;
    }
    out.set(ids[v], { x: originX + x, y });
    x = snapUp(x + size[v].w + AUTO_LAYOUT.GAP_X / 2);
    rowH = Math.max(rowH, size[v].h);
  }
  return out;
}

/** Positions (relative to 0,0) for one connected component. */
function layoutComponent(
  nodes: number[],
  succ: number[][],
  size: Size[],
  oldY: number[],
): Map<number, Point> {
  const inComp = new Set(nodes);
  // Break cycles: DFS from sources first (then any unvisited), reversing back edges.
  const indeg = new Map<number, number>(nodes.map((v) => [v, 0]));
  for (const v of nodes)
    for (const w of succ[v]) if (inComp.has(w)) indeg.set(w, indeg.get(w)! + 1);
  const order = nodes.slice().sort((p, q) => indeg.get(p)! - indeg.get(q)! || p - q);
  const state = new Map<number, number>(); // 1 = on stack, 2 = done
  const dag = new Map<number, number[]>(nodes.map((v) => [v, []]));
  const visit = (root: number) => {
    const stack: [number, number][] = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const [v, k] = top;
      if (k < succ[v].length) {
        top[1]++;
        const w = succ[v][k];
        if (!inComp.has(w)) continue;
        const s = state.get(w);
        if (s === 1)
          dag.get(w)!.push(v); // back edge → reversed
        else {
          dag.get(v)!.push(w);
          if (!s) {
            state.set(w, 1);
            stack.push([w, 0]);
          }
        }
      } else {
        state.set(v, 2);
        stack.pop();
      }
    }
  };
  for (const v of order) if (!state.get(v)) visit(v);

  // Longest-path layering (Kahn's order over the DAG).
  const layer = new Map<number, number>(nodes.map((v) => [v, 0]));
  const din = new Map<number, number>(nodes.map((v) => [v, 0]));
  dag.forEach((ws) => ws.forEach((w) => din.set(w, din.get(w)! + 1)));
  const queue = nodes.filter((v) => din.get(v) === 0);
  for (let qi = 0; qi < queue.length; qi++) {
    const v = queue[qi];
    for (const w of dag.get(v)!) {
      layer.set(w, Math.max(layer.get(w)!, layer.get(v)! + 1));
      din.set(w, din.get(w)! - 1);
      if (din.get(w) === 0) queue.push(w);
    }
  }
  // Pull sources right next to their first child so they don't sit far left.
  const hasPred = new Set<number>();
  dag.forEach((ws) => ws.forEach((w) => hasPred.add(w)));
  for (const v of nodes) {
    const kids = dag.get(v)!;
    if (!hasPred.has(v) && kids.length) {
      layer.set(v, Math.min(...kids.map((w) => layer.get(w)!)) - 1);
    }
  }

  const L = Math.max(...nodes.map((v) => layer.get(v)!)) + 1;
  const layers: number[][] = Array.from({ length: L }, () => []);
  for (const v of nodes) layers[layer.get(v)!].push(v);
  for (const l of layers) l.sort((p, q) => oldY[p] - oldY[q] || p - q);

  // Neighbours in both directions (original edges within the component).
  const nb = new Map<number, number[]>(nodes.map((v) => [v, []]));
  dag.forEach((ws, v) =>
    ws.forEach((w) => {
      nb.get(v)!.push(w);
      nb.get(w)!.push(v);
    }),
  );

  // Crossing reduction: barycentre sweeps.
  const pos = new Map<number, number>();
  const refresh = () =>
    layers.forEach((l) => l.forEach((v, i) => pos.set(v, i / Math.max(1, l.length))));
  refresh();
  for (let sweep = 0; sweep < 3; sweep++) {
    const down = sweep % 2 === 0;
    const seq = down ? layers.map((_, i) => i) : layers.map((_, i) => L - 1 - i);
    for (const li of seq) {
      const ref = (w: number) => (down ? layer.get(w)! < li : layer.get(w)! > li);
      const bary = new Map<number, number>();
      for (const v of layers[li]) {
        const ns = nb.get(v)!.filter(ref);
        bary.set(v, ns.length ? ns.reduce((s, w) => s + pos.get(w)!, 0) / ns.length : pos.get(v)!);
      }
      layers[li].sort((p, q) => bary.get(p)! - bary.get(q)! || pos.get(p)! - pos.get(q)! || p - q);
      layers[li].forEach((v, i) => pos.set(v, i / Math.max(1, layers[li].length)));
    }
  }

  // X per layer.
  const xs: number[] = [];
  let x = 0;
  for (const l of layers) {
    xs.push(x);
    const w = Math.max(0, ...l.map((v) => size[v].w));
    x = snapUp(x + w + AUTO_LAYOUT.GAP_X);
  }

  // Y: stack, then align with neighbours (down, up, down), keeping order and gaps.
  const y = new Map<number, number>();
  for (const l of layers) {
    let cy = 0;
    for (const v of l) {
      y.set(v, cy);
      cy = snapUp(cy + size[v].h + AUTO_LAYOUT.GAP_Y);
    }
  }
  const centre = (v: number) => y.get(v)! + size[v].h / 2;
  const align = (li: number, ref: (w: number) => boolean) => {
    const l = layers[li];
    const desired = l.map((v) => {
      const ns = nb.get(v)!.filter(ref);
      if (!ns.length) return y.get(v)!;
      return ns.reduce((s, w) => s + centre(w), 0) / ns.length - size[v].h / 2;
    });
    // Place in order, never closer than the gap, then shift the block by the mean error.
    const placed: number[] = [];
    l.forEach((v, i) => {
      const min = i ? placed[i - 1] + size[l[i - 1]].h + AUTO_LAYOUT.GAP_Y : -Infinity;
      placed.push(Math.max(desired[i], min));
    });
    const shift = placed.reduce((s, p, i) => s + (p - desired[i]), 0) / l.length;
    l.forEach((v, i) => y.set(v, placed[i] - shift));
  };
  for (let li = 1; li < L; li++) align(li, (w) => layer.get(w)! < li);
  for (let li = L - 2; li >= 0; li--) align(li, (w) => layer.get(w)! > li);
  for (let li = 1; li < L; li++) align(li, (w) => layer.get(w)! < li);

  // Normalise to 0 and snap to the grid without shrinking any gap.
  const minY = Math.min(...nodes.map((v) => y.get(v)!));
  const out = new Map<number, Point>();
  layers.forEach((l, li) => {
    let prevBottom = -Infinity;
    for (const v of l) {
      let vy = snap(y.get(v)! - minY);
      if (vy < prevBottom + AUTO_LAYOUT.GAP_Y) vy = snapUp(prevBottom + AUTO_LAYOUT.GAP_Y);
      out.set(v, { x: xs[li], y: vy });
      prevBottom = vy + size[v].h;
    }
  });
  const minOut = Math.min(...Array.from(out.values(), (p) => p.y));
  out.forEach((p) => (p.y -= minOut));
  return out;
}
