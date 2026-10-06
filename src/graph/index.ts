import type {
  GraphNode,
  NavigationSession,
  StackEntry,
  TabStack,
  TraverseDirection
} from "@/types/graph"
import { v4 as uuidv4 } from "uuid"

/** Oldest entries are dropped past this, so the log can't grow unbounded. */
const LOG_LIMIT = 200

export type GraphLogDescribeStack = [StackEntry, string][]

export type GraphLogDescribe = {
  stack: GraphLogDescribeStack
  cursor: number
  active: string | undefined
  pending: string | undefined
}

/**
 * One state transition, for debugging stack drift. Stacks are pre-rendered
 * strings so `console.table(graph.getLog())` reads without expanding anything.
 */
export type GraphLogEntry = {
  event: string
  tabId: number
  detail: string
  before: GraphLogDescribe
  after: GraphLogDescribe
}

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
  /** Ring buffer of recent mutations, newest last. */
  private log: GraphLogEntry[] = []

  getLog(): GraphLogEntry[] {
    return [...this.log]
  }

  private label(nodeId: string | undefined): string {
    if (nodeId === undefined) return "undefined"
    const url = this.nodes.get(nodeId)?.url ?? "?"
    // The id suffix keeps repeat visits to one URL distinguishable.
    return `${url.replace(/^https?:\/\//, "").slice(0, 40)}#${nodeId.slice(0, 4)}`
  }

  /**
   * Renders the tab's stack with the cursor entry in brackets. Only flags
   * `active` and `pending` when they disagree with the stack or are set, so
   * a healthy row stays short and an inconsistent one stands out.
   */
  private describe(tabId: number): GraphLogDescribe {
    const { entries, cursor } = this.tabToStack.get(tabId) ?? {
      entries: [],
      cursor: -1
    }
    const stack: GraphLogDescribeStack = entries.map((e) => {
      const url = this.nodes.get(e.nodeId)?.url ?? "?"
      return [e, url]
    })
    const active = this.tabToActiveNode.get(tabId)
    const pending = this.tabToPendingJump.get(tabId)

    const parts = {
      stack,
      cursor,
      active,
      pending
    }

    return parts
  }

  private record(
    event: string,
    tabId: number,
    before: GraphLogDescribe,
    detail = ""
  ) {
    console.log("describing event:", event)
    this.log.push({ event, tabId, detail, before, after: this.describe(tabId) })
    if (this.log.length > LOG_LIMIT) this.log.shift()
  }

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
  ): { targetNode: GraphNode; nodeInStack: boolean; delta: number } {
    const before = this.describe(tabId)
    const { entries, cursor } = this.getStack(tabId)
    const nodeInStack = entries.some((e) => e.nodeId === nodeId)
    const newCursor = entries.findIndex((e) => e.nodeId === nodeId)
    const delta = newCursor - cursor

    // TODO: is this necessary? Shouldn't navigation-tracker be able to send this value back to the
    // background worker which could handle the pending jump in handleNaviagtionEntry
    if (!nodeInStack) {
      // Chrome discarded this entry, so it can't be reached by traversal.
      // The caller navigates with chrome.tabs.update, which pushes a fresh
      // history entry; this marker lets the resulting commit recognise the
      // navigation as ours and reuse `nodeId` via `pushExisting` instead of
      // minting a duplicate node.
      this.tabToPendingJump.set(tabId, nodeId)
    }

    this.record(
      "targetNode",
      tabId,
      before,
      `${this.label(nodeId)} ${nodeInStack ? `go(${delta})` : "tabs.update"}`
    )
    return { targetNode: this.getNode(nodeId), nodeInStack, delta }
  }

  handleNavigationEntry(tabId: number, key: string, url: string | null) {
    const { entries } = this.getStack(tabId)
    const index = entries.findIndex((e) => e.key === key)

    // CASE 1: Key in stack → move the cursor to it
    if (index !== -1) {
      this.tabToStack.set(tabId, { entries, cursor: index })
      this.tabToActiveNode.set(tabId, entries[index].nodeId)
      return
    }

    const jump = this.takePendingJump(tabId)

    // CASE 2: Key not in stack, pending jump with matching URL → pushExisting the marked node into the new slot
    if (jump && jump.url === url) {
      this.pushExisting(tabId, jump, key)
    }

    // CASE 3: Key not in stack, no marker → addNode
    else {
      if (!url) {
        console.warn(
          "[handleNavigationEntry] addNode cannot called with null URL"
        )
      } else {
        this.addNode(tabId, key, url)
      }
    }
  }

  /**
   * Adds a **new** node to our url/tab graph.
   * @param tabId ID of tab associated with node
   * @param key {@link StackEntry.key}
   * @param url URL asscoaited with this node
   */
  addNode(tabId: number, key: string, url: string): GraphNode {
    const before = this.describe(tabId)
    const timestamp = Date.now()
    const id = uuidv4()

    const parentNodeId = this.tabToActiveNode.get(tabId) ?? null

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
    const newEntry: StackEntry = { nodeId: id, key }
    const newEntries = [...entries.slice(0, cursor + 1), newEntry]
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

    this.record("addNode", tabId, before, url)
    return newNode
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
    if (nodeId === undefined) return undefined
    const before = this.describe(tabId)
    this.tabToPendingJump.delete(tabId)
    // Logged only when a marker existed; this runs on every main-frame commit.
    this.record("takePendingJump", tabId, before, this.label(nodeId))

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
  pushExisting(tabId: number, node: GraphNode, key: string) {
    const before = this.describe(tabId)
    // Only update the stack, not the graph
    const { entries, cursor } = this.getStack(tabId)
    const newEntry: StackEntry = { nodeId: node.id, key }
    const newEntries = [...entries.slice(0, cursor + 1), newEntry]
    const newCursor = cursor + 1
    this.tabToStack.set(tabId, {
      entries: newEntries,
      cursor: newCursor
    })
    // Update active node
    this.tabToActiveNode.set(tabId, node.id)
    this.record("pushExisting", tabId, before, this.label(node.id))
  }

  // /**
  //  * Moves the cursor one step for a back/forward the *user* performed.
  //  *
  //  * Do not call this for extension-initiated traversals: `targetNode` already
  //  * moves the cursor, and a `history.go()` of any size still produces a single
  //  * traverse event, so applying a step here would overshoot.
  //  *
  //  * @param tabId Undefined when the message arrived without a sender tab.
  //  */
  // traverse(tabId: number | undefined, direction: TraverseDirection) {
  //   if (!tabId) {
  //     console.error("[Graph.traverse] tabId is undefined?")
  //     return
  //   }
  //   const before = this.describe(tabId)
  //   const { entries, cursor } = this.getStack(tabId)
  //   const delta = direction === "forward" ? 1 : -1
  //   const newCursor = cursor + delta
  //   const newActiveNodeId = entries[newCursor]

  //   this.tabToStack.set(tabId, { entries, cursor: newCursor })
  //   this.tabToActiveNode.set(tabId, newActiveNodeId)
  //   this.record("traverse", tabId, before, direction)
  // }
}
