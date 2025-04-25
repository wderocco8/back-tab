import type { GraphNode } from "@/types/graph"
import { v4 as uuidv4 } from "uuid"

export class Graph {
  private nodes: Map<string, GraphNode> = new Map() // nodeId -> GraphNode
  private tabToActiveNode: Map<number, string> = new Map() // tabId -> nodeId

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

  getActiveNode(tabId: number): GraphNode {
    const nodeId = this.getActiveNodeId(tabId)
    const node = this.nodes.get(nodeId)
    if (!node)
      throw new Error(
        `[Graph.getActiveNode] node with nodeId (${nodeId}) not found`
      )
    return node
  }

  setActiveNode(tabId: number, nodeId: string): GraphNode {
    this.tabToActiveNode.set(tabId, nodeId)
    return this.getNode(nodeId)
  }

  /**
   * Adds a node to our url/tab graph.
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

    const backNode = activeNode.parent ? this.getNode(activeNode.parent) : null
    const forwardNode = activeNode.lastForward
      ? this.getNode(activeNode.lastForward)
      : null

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
