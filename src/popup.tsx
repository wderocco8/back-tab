import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import CustomNode from "@/components/CustomNode"
import { ThemeProvider, useTheme } from "@/components/ThemeProvider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { convertGraphToFlow } from "@/graph/toFlow"
import applyDagreLayout from "@/graph/toLayout"
import { cn } from "@/lib/utils"
import type { GraphNode } from "@/types/graph"
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type ColorMode,
  type Edge,
  type Node
} from "@xyflow/react"
import { useEffect, useState, type ChangeEventHandler } from "react"

const nodeTypes = {
  tooltip: CustomNode
}

const proOptions = { hideAttribution: true }

function IndexPopup() {
  const { colorMode, setColorMode } = useTheme()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      const tabId = tab.id
      if (!tabId) throw new Error("[popup.tsx] useEffect tabId not defined")

      chrome.runtime.sendMessage(
        { type: "GET_GRAPH", tabId: tabId },
        (response) => {
          if (response?.graph && response?.activeNodeId) {
            const graph: GraphNode[] = response.graph
            const rawFlow = convertGraphToFlow(
              graph,
              response.activeNodeId,
              tabId
            )
            const layoutFlow = applyDagreLayout(rawFlow.nodes, rawFlow.edges)
            setNodes(layoutFlow.nodes)
            setEdges(layoutFlow.edges)
          }
        }
      )
    })
  }, [])

  return (
    <ThemeProvider>
      <div className={cn("w-96 h-96")}>
        <div className="bg-red-500 dark:bg-blue-600">hello world</div>
        <ReactFlow
          className="floating-edges"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          proOptions={proOptions}
          colorMode={colorMode}
          panOnScroll
          panOnScrollSpeed={0.8}
          selectionOnDrag
          fitView>
          {/* <MiniMap /> */}
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />

          <Panel position="top-right">
            <Select onValueChange={setColorMode} defaultValue={colorMode}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </Panel>
        </ReactFlow>
      </div>
    </ThemeProvider>
  )
}

export default IndexPopup
