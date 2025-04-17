import { v4 as uuidv4 } from "uuid"

type GraphNode = {
  id: string
  url: string
  timestamp: number
  children: string[]
  parent: string | null
}

export class Graph {
  private activeNodeId: string = null
  private nodes: Map<string, GraphNode> = new Map()

  /**
   * Adds a node to our url/tab graph.
   * @param tabId
   * @param url
   */
  addNode(tabId: number, url: string): GraphNode {
    const timestamp = Date.now()
    const id = uuidv4()

    const parentNodeId = this.activeNodeId
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
    this.activeNodeId = id

    return newNode
  }

  getGraph(): GraphNode[] {
    return Array.from(this.nodes.values())
  }
}
