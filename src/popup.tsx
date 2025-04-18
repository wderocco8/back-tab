import { useEffect, useState } from "react"

import "@/styles/globals.css"

import { Button } from "@/components/ui/button"
import type { GraphNode } from "@/types/graph"

function IndexPopup() {
  const [graph, setGraph] = useState<GraphNode[]>([])

  // useEffect(() => {
  //   const listener = (message: any) => {
  //     if (message?.type === "GRAPH_UPDATED") {
  //       setGraph(message.graph)
  //     }
  //   }

  //   chrome.runtime.onMessage.addListener(listener)
  //   return () => chrome.runtime.onMessage.removeListener(listener)
  // }, [])

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_GRAPH" }, (response) => {

      if (response?.graph) {
        setGraph(response.graph)
      }
    })
  }, [])

  return (
    <div className="p-4 text-center">
      Hello from Tailwind!
      <Button variant="destructive">Let's go</Button>
      {graph.toString()}
    </div>
  )
}

export default IndexPopup
