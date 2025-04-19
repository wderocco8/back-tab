import { DEFAULT_NODE_DIMENSIONS } from "@/constants"
import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"

const dagreGraph = new dagre.graphlib.Graph()
// TODO: is this needed?
dagreGraph.setDefaultEdgeLabel(() => ({}))

export default function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "BT" | "LR" | "RL" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  dagreGraph.setGraph({ rankdir: direction })

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: DEFAULT_NODE_DIMENSIONS,
      height: DEFAULT_NODE_DIMENSIONS
    })
  })

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  dagre.layout(dagreGraph)

  nodes.forEach((node) => {
    const pos = dagreGraph.node(node.id)
    node.position = {
      x: pos.x - DEFAULT_NODE_DIMENSIONS / 2,
      y: pos.y - DEFAULT_NODE_DIMENSIONS / 2
    }
  })

  return { nodes, edges }
}
