import { v4 as uuidv4 } from "uuid"

type GraphNode = {
  /** Unique identifier for the node */
  id: string

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

  // TODO: maybe include tabId
}

export class Graph {
  private nodes: Map<string, GraphNode> = new Map() // nodeId -> GraphNode
  private tabToActiveNode: Map<number, string> = new Map() // tabId -> nodeId

  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getNode(nodeId?: string | null): GraphNode | undefined {
    if (!nodeId) return undefined
    return nodeId ? this.nodes.get(nodeId) : undefined
  }

  getActiveNode(tabId?: number | null): GraphNode | undefined {
    if (!tabId) return undefined
    const nodeId = this.tabToActiveNode.get(tabId)
    return nodeId ? this.nodes.get(nodeId) : undefined
  }

  /**
   * Adds a node to our url/tab graph.
   * @param tabId
   * @param url
   */
  addNode(tabId: number, url: string): GraphNode {
    const timestamp = Date.now()
    const id = uuidv4()

    const parentNodeId = this.tabToActiveNode.get(tabId) ?? null
    const newNode: GraphNode = {
      id,
      url,
      timeStamp: timestamp,
      children: [],
      parent: parentNodeId,
      lastForward: null
    }

    this.nodes.set(id, newNode)

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

  goForwardBack(tabId: number, url: string) {
    const activeNode = this.getActiveNode(tabId)
    if (!activeNode) throw new Error("[Graph.goForwardBack] No active node set")

    const backNode = this.getNode(activeNode?.parent)
    const forwardNode = this.getNode(activeNode?.lastForward)

    // TODO: fix edge case where back and forward share the same URL
    // (it will choose back regardless currently)
    let newActiveNode: string
    if (backNode?.url === url) {
      newActiveNode = backNode.id
      backNode.lastForward = activeNode?.id
    } else if (forwardNode?.url === url) {
      newActiveNode = forwardNode.id
      // TODO: I don't think we need to worry about forwardNode.parent (already persisted)
    } else {
      throw new Error(
        "[Graph.goForwardBack] Back and forward url does not match."
      )
    }

    this.tabToActiveNode.set(tabId, newActiveNode)
  }
}
