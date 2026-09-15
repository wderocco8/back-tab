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
   * ID of the parent node (if any) - the page this one was reached *from*.
   *
   * Not the same as the tab's session stack: a jump to a node Chrome has
   * discarded appends it to the stack without re-parenting it, so the back
   * button may lead to a sibling rather than to `parent`. See the note on
   * {@link TabStack}.
   */
  parent: string | null
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
 *
 * A node ID appears at most once in `entries`: a jump only pushes when the node
 * is absent (`Graph.targetNode` traverses instead when it is present), so
 * `indexOf` is unambiguous.
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
