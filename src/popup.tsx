import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import CustomNode from "@/components/CustomNode"
import { convertGraphToFlow } from "@/graph/toFlow"
import applyDagreLayout from "@/graph/toLayout"
import type { GraphNode } from "@/types/graph"
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node
} from "@xyflow/react"
import { useEffect, useState } from "react"

const nodeTypes = {
  tooltip: CustomNode
}

const proOptions = { hideAttribution: true }

function IndexPopup() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]

      chrome.runtime.sendMessage(
        { type: "GET_GRAPH", tabId: tab.id },
        (response) => {
          if (response?.graph && response?.activeNodeId) {
            const graph: GraphNode[] = response.graph
            const rawFlow = convertGraphToFlow(graph, response.activeNodeId)
            const layoutFlow = applyDagreLayout(rawFlow.nodes, rawFlow.edges)
            setNodes(layoutFlow.nodes)
            setEdges(layoutFlow.edges)
          }
        }
      )
    })
  }, [])

  return (
    <div className="w-96 h-96">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        panOnScroll
        panOnScrollSpeed={0.8}
        selectionOnDrag
        fitView>
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  )
}

export default IndexPopup
