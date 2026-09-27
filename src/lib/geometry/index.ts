/**
 * Layout and relationship routing. Pure functions; text measuring is injected
 * so this runs in tests (jsdom has no canvas) and in the browser alike.
 *
 * - measure.ts    table sizes and row positions
 * - ports.ts      which side / row each line attaches to, spreading shared spots
 * - ortho.ts      orthogonal routing (sparse visibility grid + A* with bend cost)
 * - nudge.ts      separates parallel segments sharing a channel
 * - router.ts     `routeRelationships` for all three line styles, labels
 * - markers.ts    crow's-foot markers and numeric end text
 * - autoLayout.ts "Tidy up" layered layout
 */

export * from "./types";
export { ROUTING } from "./constants";
export { BADGE_W, estimateText, layoutTables, rowCentre, tableSize } from "./measure";
export { defaultLabelSize, roundedPath, routeRelationships } from "./router";
export { MARKER, endKinds, endText, endTextAt, markerPath } from "./markers";
export { diagramBounds } from "./bounds";
export { clearRouteCache } from "./ortho";
export { AUTO_LAYOUT, autoLayout } from "./autoLayout";
