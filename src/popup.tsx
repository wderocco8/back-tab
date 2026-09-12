import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import CustomNode from "@/components/CustomNode"
import { ThemeProvider, useTheme } from "@/components/ThemeProvider"
import { convertGraphToFlow } from "@/graph/toFlow"
import applyDagreLayout from "@/graph/toLayout"
import { parseMessage, sendMessage } from "@/lib/messaging"
import type { FlowNode } from "@/types/graph"
import { EXTENSION_PAGE_MESSAGE_TYPES, MESSAGE_TYPES } from "@/types/messages"
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
  type NodeMouseHandler
} from "@xyflow/react"
import { useCallback, useEffect } from "react"

const nodeTypes = {
  tooltip: CustomNode
}

const proOptions = { hideAttribution: true }

function InnerPopup() {
  const { colorMode } = useTheme()
  const [nodes, setNodes] = useNodesState<FlowNode>([])
  const [edges, setEdges] = useEdgesState<Edge>([])
  const { setViewport, fitView, zoomIn, zoomOut, getNode } = useReactFlow()

  /** Refetches the graph for `tabId` and re-runs layout. */
  const updateGraph = (tabId: number) =>
    sendMessage({ type: MESSAGE_TYPES.GET_GRAPH, tabId }, (response) => {
      // Undefined when the background threw before replying — most often
      // because the tab has no recorded navigation yet.
      if (!response) {
        console.warn(
          "[popup] GET_GRAPH failed:",
          chrome.runtime.lastError?.message
        )
        return
      }

      const { graph, activeNodeId } = response
      const rawFlow = convertGraphToFlow(graph, activeNodeId, tabId)
      const layoutFlow = applyDagreLayout(rawFlow.nodes, rawFlow.edges)
      setNodes(layoutFlow.nodes)
      setEdges(layoutFlow.edges)
      // TODO: why is it not fitting by default
      handleTransform(activeNodeId)
    })

  // 1) Initial graph load
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab.id
      if (!tabId) throw new Error("[popup.tsx] useEffect tabId not defined")
      updateGraph(tabId)
    })
  }, [])

  // 2) Listen for graph updates
  useEffect(() => {
    const handleGraphUpdate = (message: unknown) => {
      console.log("A) handling graph update")

      // Every extension message lands here, so narrow before trusting it.
      const parsed = parseMessage(message, EXTENSION_PAGE_MESSAGE_TYPES)
      if (!parsed) return

      console.log("B) updating graph")
      updateGraph(parsed.tabId)
    }

    chrome.runtime.onMessage.addListener(handleGraphUpdate)

    return () => {
      chrome.runtime.onMessage.removeListener(handleGraphUpdate)
    }
  }, [])

  const handleNodeClick: NodeMouseHandler<FlowNode> = (_, node) => {
    sendMessage({
      type: MESSAGE_TYPES.SET_ACTIVE_NODE,
      nodeId: node.id,
      tabId: node.data.tabId
    })

    handleTransform(node.id)
  }

  /** Pans and zooms the viewport to frame a single node. */
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
