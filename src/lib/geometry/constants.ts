/** Tunables for relationship routing, exported so renderers can line things up. */
export const ROUTING = {
  /** Clearance kept between a routed line and any table it passes. */
  MARGIN: 12,
  /** Straight run out of a table before an orthogonal route may turn. */
  STUB: 32,
  /** Straight run for curved / straight styles (room for the markers). */
  MARKER_STUB: 24,
  /** How far a self-loop reaches out of the table. */
  SELF_OUT: 40,
  /** Minimum vertical distance between the two ends of a self-loop. */
  SELF_MIN_DY: 14,
  /** Corner radius for orthogonal routes. */
  RADIUS: 6,
  /** Spacing between parallel segments sharing a channel. */
  NUDGE: 6,
  /** Never nudge a segment further than this from its routed position. */
  MAX_NUDGE: 8,
  /** Spacing between ends sharing the same side and row. */
  PORT_SPREAD: 6,
  /** A* cost of one bend, in px of length. */
  BEND_COST: 30,
  /** Label pill height used for overlap checks. */
  LABEL_H: 20,
} as const;
