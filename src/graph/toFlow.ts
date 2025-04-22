import { DEFAULT_NODE_DIMENSIONS } from "@/constants"
import type { GraphNode } from "@/types/graph"
import type { Edge, Node } from "@xyflow/react"

export function convertGraphToFlow(
  graph: GraphNode[],
  activeNodeId: string,
  tabId: number
): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const node of graph) {
    // Handle node
    nodes.push({
      id: node.id,
      data: {
        label: "",
        url: node.url,
        timestamp: node.timeStamp,
        isActive: node.id === activeNodeId
      },
      position: { x: 0, y: 0 },
      type: "tooltip",
      width: DEFAULT_NODE_DIMENSIONS,
      height: DEFAULT_NODE_DIMENSIONS,
      connectable: false,
      hidden: node.tabId === tabId ? false : true
    })

    // Handle edge
    for (const childId of node.children) {
      edges.push({
        id: `e[${node.id}]-[${childId}]`,
        source: node.id,
        target: childId
      })
    }
  }

  return { nodes, edges }
}
