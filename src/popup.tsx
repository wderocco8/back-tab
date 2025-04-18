import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react"
import { useEffect } from "react"

const initialNodes = [
  { id: "1", position: { x: 0, y: 0 }, data: { label: "1" } },
  { id: "2", position: { x: 0, y: 0 }, data: { label: "2" } }
]
const initialEdges = [{ id: "e1-2", source: "1", target: "2" }]

function IndexPopup() {
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_GRAPH" }, (response) => {
      if (response?.graph) {
        // TODO: convert graph to nodes and edges
      }
    })
  }, [])

  return (
    <div className="w-96 h-96">
      <ReactFlow nodes={initialNodes} edges={initialEdges}>
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  )
}

export default IndexPopup
