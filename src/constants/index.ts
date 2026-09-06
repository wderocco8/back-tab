export const DEFAULT_NODE_DIMENSIONS = 25
export const MESSAGE_LISTENERS = {
  // GETTERS
  GET_GRAPH: "GET_GRAPH",
  // SETTERS
  SET_ACTIVE_NODE: "SET_ACTIVE_NODE",
  // LISTENERS
  GRAPH_UPDATED: "GRAPH_UPDATED",
  NAVIGATION_TRAVERSE: "NAVIGATION_TRAVERSE",
  NAVIGATION_PUSH: "NAVIGATION_PUSH",
}

/**
 * Marks an edge as an annotation rather than real navigation structure.
 * Revisit edges are excluded from the dagre layout - see `toLayout.ts`.
 */
export const REVISIT_EDGE_KIND = "revisit"
