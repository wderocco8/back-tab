import type {
  GraphNode,
  NavigationSession,
  TabStack,
  TraverseDirection
} from "@/types/graph"
import { v4 as uuidv4 } from "uuid"

/**
 * The browsing history tree, plus a per-tab mirror of Chrome's session stack.
 *
 * Two structures kept in step:
 * - `nodes` is append-only and never truncates, so branches the user abandoned
 *   survive. This is what the popup draws.
 * - `tabToStack` mirrors what Chrome's back/forward buttons will actually do,
 *   holding node IDs (not URLs) so repeat visits to one URL stay distinct.
 *
 * The two are deliberately NOT isomorphic. `parent` records where a page was
 * reached from; `tabToStack` records what Chrome's back/forward can reach. A
 * jump to a discarded node appends it to the stack without touching the tree,
 * so after `A -> B -> back -> A -> C -> jump(B)` the stack is `[A, C, B]` while
 * B's parent is still A. Walking `parent` therefore does not reproduce the
 * stack, and the popup must render the stack as an overlay rather than infer it
 * from the tree's shape.
 *
 * All state is in memory, so it is lost when the MV3 worker terminates.
 */
export class Graph {
  /** nodeId -> GraphNode */
  private nodes: Map<string, GraphNode> = new Map()
  /** tabId -> nodeId */
  private tabToActiveNode: Map<number, string> = new Map()
  /** tabId -> NavigationSession */
  private tabToNavigationSession: Map<number, NavigationSession> = new Map()
  /** tabId -> stack mirroring chrome history */
  private tabToStack: Map<number, TabStack> = new Map()
  /** tabId -> nodeId that the we are trying to "jump" to (a node that is not in `tabToStack`, but is in `nodes`) */
  private tabToPendingJump: Map<number, string> = new Map()

  /** Every node across every tab. Callers filter by `tabId` themselves. */
  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * @throws If no node with `nodeId` exists.
   */
  getNode(nodeId: string): GraphNode {
    const node = this.nodes.get(nodeId)
    if (!node)
      throw new Error(`[Graph.getNode] node with nodeId (${nodeId}) not found`)
    return node
  }

  /**
   * ID of the node `tabId` currently sits on.
   *
   * @throws If the tab has no recorded navigation yet — which includes every
   * tab after the service worker restarts, since state is in memory only.
   */
  getActiveNodeId(tabId: number): string {
    const activeNodeId = this.tabToActiveNode.get(tabId)
    if (!activeNodeId)
      throw new Error(
        `[Graph.getActiveNodeId] activeNodeId for tabId (${tabId}) not found`
      )
    return activeNodeId
  }

  /**
   * The tab's mirror of Chrome's session history.
   *
   * Returns an empty stack (`cursor: -1`) for an unknown tab rather than
   * throwing, so `addNode` can lazily initialise on a tab's first navigation.
   */
  getStack(tabId: number): TabStack {
    const stack = this.tabToStack.get(tabId)
    if (!stack)
      console.warn(`[Graph.getStack] stack for tabId (${tabId}) not found`)
    return stack ?? { entries: [], cursor: -1 }
  }

  /**
   * @throws If the tab has no active node, or it points at a missing node.
   */
  getActiveNode(tabId: number): GraphNode {
    const nodeId = this.getActiveNodeId(tabId)
    const node = this.nodes.get(nodeId)
    if (!node)
      throw new Error(
        `[Graph.getActiveNode] node with nodeId (${nodeId}) not found`
      )
    return node
  }

  /**
   * Modifies the graph and stack to select `nodeId`.
   * - If `nodeId` is in the stack, simply updates active node and cursor
   * - Otherwise records a pending jump, so the `chrome.tabs.update` that is
   *   subsequently called doesn't trigger a new node event, but rather a
   *   `pushExisting` event.
   *
   * @param tabId
   * @param nodeId
   * @returns activeNode and true if the node was in the stack, false otherwise
   */
  targetNode(
    tabId: number,
    nodeId: string
  ): { activeNode: GraphNode; nodeInStack: boolean; delta: number } {
    const { entries, cursor } = this.getStack(tabId)
    const nodeInStack = entries.includes(nodeId)
    const newCursor = entries.indexOf(nodeId)
    const delta = newCursor - cursor

    if (nodeInStack) {
      this.tabToActiveNode.set(tabId, nodeId)
      this.tabToStack.set(tabId, {
        entries,
        cursor: newCursor
      })
    } else {
      // Chrome discarded this entry, so it can't be reached by traversal.
      // The caller navigates with chrome.tabs.update, which pushes a fresh
      // history entry; this marker lets the resulting commit recognise the
      // navigation as ours and reuse `nodeId` via `pushExisting` instead of
      // minting a duplicate node.
      this.tabToPendingJump.set(tabId, nodeId)
    }

    return { activeNode: this.getNode(nodeId), nodeInStack, delta }
  }

  /**
   * Adds a **new** node to our url/tab graph.
   * @param tabId ID of tab associated with node
   * @param url URL asscoaited with this node
   */
  addNode(tabId: number, url: string): GraphNode {
    const timestamp = Date.now()
    const id = uuidv4()

    const parentNodeId = this.tabToActiveNode.get(tabId) ?? null

    // Deliberately does not touch `tabToPendingJump`. `takePendingJump` is its
    // only consumer: `addNode` is also reached from NAVIGATION_PUSH, which never
    // passes through webNavigation, so consuming the marker here would let an
    // SPA push swallow a jump that has not committed yet.
    const newNode: GraphNode = {
      id,
      tabId: tabId,
      url,
      timeStamp: timestamp,
      children: [],
      parent: parentNodeId
    }

    // Add node to graph
    this.nodes.set(id, newNode)
    // Add graph to stack, or initialize stack
    const { entries, cursor } = this.getStack(tabId)
    const newEntries = [...entries.slice(0, cursor + 1), id]
    const newCursor = cursor + 1
    this.tabToStack.set(tabId, {
      entries: newEntries,
      cursor: newCursor
    })

    // Add node to parent's children (if possible)
    if (parentNodeId) {
      const parentNode = this.nodes.get(parentNodeId)
      if (parentNode) {
        parentNode.children.push(id)
      }
    }

    // Update active node
    this.tabToActiveNode.set(tabId, id)

    return newNode
  }

  /**
   * Moves the cursor one step for a back/forward the *user* performed.
   *
   * Do not call this for extension-initiated traversals: `targetNode` already
   * moves the cursor, and a `history.go()` of any size still produces a single
   * traverse event, so applying a step here would overshoot.
   *
   * @param tabId Undefined when the message arrived without a sender tab.
   */
  traverse(tabId: number | undefined, direction: TraverseDirection) {
    if (!tabId) {
      console.error("[Graph.traverse] tabId is undefined?")
      return
    }
    const { entries, cursor } = this.getStack(tabId)
    const delta = direction === "forward" ? 1 : -1
    const newCursor = cursor + delta
    const newActiveNodeId = entries[newCursor]

    this.tabToStack.set(tabId, { entries, cursor: newCursor })
    this.tabToActiveNode.set(tabId, newActiveNodeId)
  }

  /**
   * Reads and clears the pending jump marker for `tabId`.
   *
   * The sole consumer of `tabToPendingJump`. Called on every main-frame commit,
   * not only jump-initiated ones, so a `tabs.update` that never lands cannot
   * leak its marker into an unrelated later navigation.
   *
   * Resolves to `undefined` rather than throwing when the marker names a node
   * that no longer exists: this runs inside the `webNavigation` listener, where
   * a throw would break navigation tracking for the tab entirely. Unreachable
   * while nodes are never deleted, but retention/eviction will make it possible.
   *
   * @param tabId Tab whose marker to consume.
   * @returns The node being jumped to, or `undefined` if there is no live marker.
   */
  takePendingJump(tabId: number): GraphNode | undefined {
    const nodeId = this.tabToPendingJump.get(tabId)
    this.tabToPendingJump.delete(tabId)
    if (nodeId === undefined) return undefined

    const node = this.nodes.get(nodeId)
    if (!node) {
      console.warn(
        `[Graph.takePendingJump] pending jump for tabId (${tabId}) named a missing node (${nodeId})`
      )
      return undefined
    }
    return node
  }

  /**
   * Updates state to reflect jump to existing node.
   * - Clears stack past cursor.
   * - Appends `node.id` to stack.
   * - Updates active node to `node.id`
   * @param tabId
   * @param node
   */
  pushExisting(tabId: number, node: GraphNode) {
    // Only update the stack, not the graph
    const { entries, cursor } = this.getStack(tabId)
    const newEntries = [...entries.slice(0, cursor + 1), node.id]
    const newCursor = cursor + 1
    this.tabToStack.set(tabId, {
      entries: newEntries,
      cursor: newCursor
    })
    // Update active node
    this.tabToActiveNode.set(tabId, node.id)
  }
}
