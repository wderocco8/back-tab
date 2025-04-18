import "@xyflow/react/dist/style.css"
import "@/styles/globals.css"

import { Background, BackgroundVariant, ReactFlow, useEdgesState, useNodesState, type Edge, type Node } from "@xyflow/react"
import { useEffect } from "react"
import { convertGraphToFlow } from "@/graph/toFlow";
import type { GraphNode } from "@/types/graph";

function IndexPopup() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);


  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_GRAPH" }, (response) => {
      if (response?.graph) {
        const graph: GraphNode[] = response.graph;
        const raw = convertGraphToFlow(graph)
        console.log("[IndexPopup] converted graph", raw);
        
        setNodes(raw.nodes)
        setEdges(raw.edges)
      }
    })
  }, [])

  return (
    <div className="w-96 h-96">
      <ReactFlow nodes={nodes} edges={edges}>
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  )
}

export default IndexPopup
