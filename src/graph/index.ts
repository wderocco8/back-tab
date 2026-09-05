import type { TraverseDirection } from "@/contents/navigation-tracker"
import type { GraphNode, NavigationSession, TabStack } from "@/types/graph"
import { v4 as uuidv4 } from "uuid"

export class Graph {
  /** nodeId -> GraphNode */
  private nodes: Map<string, GraphNode> = new Map()
  /** tabId -> nodeId */
  private tabToActiveNode: Map<number, string> = new Map()
  /** tabId -> NavigationSession */
  private tabToNavigationSession: Map<number, NavigationSession> = new Map()
  /** tabId -> stack mirroring chrome history */
  private tabToStack: Map<number, TabStack> = new Map()

  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getNode(nodeId: string): GraphNode {
    const node = this.nodes.get(nodeId)
    if (!node)
      throw new Error(`[Graph.getNode] node with nodeId (${nodeId}) not found`)
    return node
  }

  getActiveNodeId(tabId: number): string {
    const activeNodeId = this.tabToActiveNode.get(tabId)
    if (!activeNodeId)
      throw new Error(
        `[Graph.getActiveNodeId] activeNodeId for tabId (${tabId}) not found`
      )
    return activeNodeId
  }

  getStack(tabId: number): TabStack {
    const stack = this.tabToStack.get(tabId)
    if (!stack)
      console.warn(`[Graph.getStack] stack for tabId (${tabId}) not found`)
    return stack ?? { entries: [], cursor: -1 }
  }

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
   * - Otherwise appends a copy of the node and makes it a child of the active node
   * @param tabId
   * @param nodeId
   * @returns activeNode and true if the node was in the stack, false otherwise
   */
  setActiveNode(
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
      // TODO: I think this branch is not necessary? if we push to the new node of then the next
      // chrome update should trigger "typed" transitionType in the background worker
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
    const newNode: GraphNode = {
      id,
      tabId: tabId,
      url,
      timeStamp: timestamp,
      children: [],
      parent: parentNodeId,
      revisitOf: null,
      lastForward: null
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
        // parentNode.lastForward = id
      }
    }

    // Update active node
    this.tabToActiveNode.set(tabId, id)

    return newNode
  }

  traverse(
    tabId: number | undefined,
    direction: TraverseDirection
  ) {
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
}
