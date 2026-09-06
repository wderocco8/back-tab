import { DEFAULT_NODE_DIMENSIONS, REVISIT_EDGE_KIND } from "@/constants"
import type { GraphNode } from "@/types/graph"
import { MarkerType, type Edge, type Node } from "@xyflow/react"

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
    const hidden = node.tabId !== tabId

    // Handle node
    nodes.push({
      id: node.id,
      data: {
        label: "",
        url: node.url,
        tabId: node.tabId,
        timeStamp: node.timeStamp,
        isActive: node.id === activeNodeId
      },
      position: { x: 0, y: 0 },
      type: "tooltip",
      width: DEFAULT_NODE_DIMENSIONS,
      height: DEFAULT_NODE_DIMENSIONS,
      connectable: false,
      hidden
    })

    // Handle edge
    for (const childId of node.children) {
      edges.push({
        id: `e[${node.id}]-[${childId}]`,
        source: node.id,
        target: childId
      })
    }

    // Handle revisit edge: this node was created by jumping to a node Chrome
    // had already dropped from the stack, so point back at the original. This
    // is an annotation, not navigation structure - `toLayout` skips it so the
    // original doesn't get ranked below its own revisit.
    if (node.revisitOf) {
      edges.push({
        id: `r[${node.id}]-[${node.revisitOf}]`,
        source: node.id,
        target: node.revisitOf,
        type: "straight",
        data: { kind: REVISIT_EDGE_KIND },
        style: { strokeDasharray: "4 4", strokeWidth: 1, opacity: 0.6 },
        markerEnd: { type: MarkerType.Arrow },
        hidden
      })
    }
  }

  return { nodes, edges }
}
