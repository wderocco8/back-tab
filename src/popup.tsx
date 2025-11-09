import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import CustomNode from "@/components/CustomNode"
import { ThemeProvider, useTheme } from "@/components/ThemeProvider"
import { MESSAGE_LISTENERS } from "@/constants"
import { convertGraphToFlow } from "@/graph/toFlow"
import applyDagreLayout from "@/graph/toLayout"
import type { GraphNode } from "@/types/graph"
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler
} from "@xyflow/react"
import { useCallback, useEffect } from "react"

const nodeTypes = {
  tooltip: CustomNode
}

const proOptions = { hideAttribution: true }

function InnerPopup() {
  const { colorMode } = useTheme()
  const [nodes, setNodes] = useNodesState<Node>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const { setViewport, fitView, zoomIn, zoomOut, getNode } = useReactFlow()

  const updateGraph = (tabId: number) =>
    chrome.runtime.sendMessage(
      { type: MESSAGE_LISTENERS.GET_GRAPH, tabId: tabId },
      (response) => {
        const graph: GraphNode[] | undefined = response?.graph
        const activeNodeId: string | undefined = response?.graph
        if (graph && activeNodeId) {
          const rawFlow = convertGraphToFlow(
            graph,
            response.activeNodeId,
            tabId
          )
          const layoutFlow = applyDagreLayout(rawFlow.nodes, rawFlow.edges)
          setNodes(layoutFlow.nodes)
          setEdges(layoutFlow.edges)
          // TODO: why is it not fitting by default
          handleTransform(activeNodeId)
        }
      }
    )

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab.id
      if (!tabId) throw new Error("[popup.tsx] useEffect tabId not defined")
      updateGraph(tabId)
    })
  }, [])

  useEffect(() => {
    const handleGraphUpdate = (
      message: any,
      sender: chrome.runtime.MessageSender
    ) => {
      console.log("A) handling graph update")

      if (message.type === MESSAGE_LISTENERS.GRAPH_UPDATED) {
        console.log("B) updating graph")
        updateGraph(message.tabId)
      }
    }

    chrome.runtime.onMessage.addListener(handleGraphUpdate)

    return () => {
      chrome.runtime.onMessage.removeListener(handleGraphUpdate)
    }
  }, [])

  const handleNodeClick: NodeMouseHandler<Node> = (_, node) => {
    chrome.runtime.sendMessage({
      type: MESSAGE_LISTENERS.SET_ACTIVE_NODE,
      nodeId: node.id,
      tabId: node.data.tabId
    })

    handleTransform(node.id)
  }

  const handleTransform = useCallback(
    (nodeId: string) => {
      const n = getNode(nodeId)
      if (!n)
        throw new Error(
          `[popup.tsx] getNode could not find node with nodeId ${nodeId}`
        )
      fitView({ nodes: [n], duration: 300 })
    },
    [setViewport, getNode]
  )

  return (
    <div className="w-96 h-96">
      <ReactFlow
        className="floating-edges"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        proOptions={proOptions}
        colorMode={colorMode}
        onNodeClick={handleNodeClick}
        panOnScroll
        panOnScrollSpeed={0.8}
        selectionOnDrag
        fitView>
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}

function IndexPopup() {
  return (
    <ThemeProvider>
      <ReactFlowProvider>
        <InnerPopup />
      </ReactFlowProvider>
    </ThemeProvider>
  )
}

export default IndexPopup
