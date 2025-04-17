import { v4 as uuidv4 } from "uuid"

type GraphNode = {
  id: string
  url: string
  timestamp: number
  children: string[]
  parent: string | null
}

export class Graph {
  private nodes: Map<string, GraphNode> = new Map()
  private tabToActiveNode: Map<number, string> = new Map() // tabId -> nodeId

  /**
   *
   * @returns List of `GraphNode` objects
   */
  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }

  getActiveNode(tabId: number): GraphNode | undefined {
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
      timestamp,
      children: [],
      parent: parentNodeId
    }

    this.nodes.set(id, newNode)

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

  goForwardBack() {

  }
}
