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

  /** ID of the parent node (if any)... can also be used to access "back" navigation */
  parent: string | null

  /** ID of the last node navigated to from this one using "forward" */
  lastForward: string | null
}

export type NavigationSession = {
  /** List of node IDs in visited order */
  stack: string[]

  /** Current position in stack */
  index: number
}
