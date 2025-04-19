import { DEFAULT_NODE_DIMENSIONS } from "@/constants"
import type { GraphNode } from "@/types/graph"
import type { Edge, Node } from "@xyflow/react"

export function convertGraphToFlow(graph: GraphNode[]): {
  nodes: Node[]
  edges: Edge[]
} {
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const node of graph) {
    // Handle node
    nodes.push({
      id: node.id,
      data: { label: "", timestamp: node.timeStamp },
      position: { x: 0, y: 0 }, // TODO: use layout engine to modify (use Omit to ignore this field)
      width: DEFAULT_NODE_DIMENSIONS,
      height: DEFAULT_NODE_DIMENSIONS,
      connectable: false,
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
