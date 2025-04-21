import type { GraphNode } from "@/types/graph"
import { v4 as uuidv4 } from "uuid"

export class Graph {
  private nodes: Map<string, GraphNode> = new Map() // nodeId -> GraphNode
  private tabToActiveNode: Map<number, string> = new Map() // tabId -> nodeId

  // maybe...
  toString() {
    return Array.from(this.nodes.values()).toString()
  }

  // TODO: probably better to return a map instead
  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getNode(nodeId?: string | null): GraphNode | undefined {
    if (!nodeId) return undefined
    return nodeId ? this.nodes.get(nodeId) : undefined
  }

  getActiveNodeId(tabId?: number | null): string | undefined {
    if (!tabId) throw new Error("[Graph.getActiveNode] tabId is undefined")
    return this.tabToActiveNode.get(tabId)
  }

  getActiveNode(tabId?: number | null): GraphNode | undefined {
    const nodeId = this.getActiveNodeId(tabId)
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
