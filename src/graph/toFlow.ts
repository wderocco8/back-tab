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
      data: { label: node.url, timestamp: node.timeStamp },
      position: { x: 0, y: 0 } // TODO: use layout engine to modify
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
