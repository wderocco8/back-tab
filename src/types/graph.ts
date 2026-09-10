import type { Node } from "@xyflow/react"

/** Direction of a back/forward traversal through a tab's session history. */
export type TraverseDirection = "forward" | "back"

/** A single page visit. Nodes are never mutated away once created. */
export type GraphNode = {
  /** ID for the node */
  id: string

  /** ID of the tab containing this node */
  tabId: number

  /** URL the node represents */
  url: string

  /** Timestamp (in ms) when the node was created */
  timeStamp: number

  /** List of child node IDs navigated to from this node */
  children: string[]

  /**
   * ID of the parent node (if any). Walking `parent` from the active node
   * yields exactly the tab's session stack up to the cursor, reversed.
   */
  parent: string | null

  /**
   * ID of the node this one re-visits, set when the user clicked a node Chrome
   * had already dropped from the stack. Purely an annotation: `parent` still
   * points at wherever the user actually was. Rendered as a dashed edge.
   */
  revisitOf: string | null
}

export type NavigationSession = {
  /** List of node IDs in visited order */
  stack: string[]

  /** Current position in stack */
  index: number
}

/**
 * Mirror of Chrome's session history for one tab.
 *
 * Holds node IDs rather than URLs so repeat visits to the same URL stay
 * distinguishable. Must copy Chrome's truncation semantics: pushing while the
 * cursor is mid-stack discards everything ahead of it.
 */
export type TabStack = {
  /** List of nodeIds mirroring Chrome history stack */
  entries: string[]

  /** Current index of the stack */
  cursor: number
}

/** Payload carried by each React Flow node, read by `CustomNode`. */
export type FlowNodeData = {
  label: string
  url: string
  tabId: number
  timeStamp: number
  /** Whether this is the tab's current position, for highlighting. */
  isActive: boolean
}

/** A React Flow node with this app's typed `data` payload. */
export type FlowNode = Node<FlowNodeData>
