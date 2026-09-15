import { DEFAULT_NODE_DIMENSIONS, REVISIT_EDGE_KIND } from "@/constants"
import type { FlowNode, GraphNode } from "@/types/graph"
import { MarkerType, type Edge } from "@xyflow/react"

/**
 * Projects the graph into React Flow nodes and edges.
 *
 * Emits every node in the graph regardless of tab, marking those belonging to
 * other tabs as `hidden` rather than dropping them.
 *
 * @param graph Every node the background knows about, across all tabs.
 * @param activeNodeId Node the tab currently sits on, flagged via `data.isActive`.
 * @param tabId Tab being displayed; nodes from other tabs are hidden.
 */
export function convertGraphToFlow(
  graph: GraphNode[],
  activeNodeId: string,
  tabId: number
): {
  nodes: FlowNode[]
  edges: Edge[]
} {
  const nodes: FlowNode[] = []
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
  }

  return { nodes, edges }
}
