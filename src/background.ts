import { MESSAGE_LISTENERS } from "@/constants"
import { Graph } from "@/graph"

const graph = new Graph()

// Handle messaging from background to popup
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  console.log("[background] receieved message", request)

  if (request.type === MESSAGE_LISTENERS.GET_GRAPH) {
    sendResponse({
      graph: graph.getGraph(),
      activeNodeId: graph.getActiveNodeId(request.tabId)
    })
  }

  if (request.type === MESSAGE_LISTENERS.NAVIGATION_TRAVERSE) {
    // sender.tab is only present when the message comes from a content
    // script (as opposed to the popup/newtab/options pages).
    const tabId = sender.tab?.id
    const { direction, internalNodeId } = request

    console.log("[background] traverse detected", {
      tabId,
      direction
    })

    if (internalNodeId) {
      // setActiveNode already moved the cursor. Assert it landed right.
      if (tabId !== undefined) {
        const { entries, cursor } = graph.getStack(tabId)
        if (entries[cursor] !== internalNodeId) {
          console.error("[background] cursor drift", {
            expected: internalNodeId,
            actual: entries[cursor]
          })
        }
      }
    } else {
      graph.traverse(tabId, direction)
    }
    console.log(tabId ? graph.getStack(tabId) : "no tabId")
    console.log(graph.getGraph())
  }

  if (request.type === MESSAGE_LISTENERS.NAVIGATION_PUSH) {
    // Same-document (SPA) navigation — webNavigation.onCommitted never
    // fires for these, so this is the only place they get added.
    const tabId = sender.tab?.id
    if (tabId === undefined) {
      console.error("[background] NAVIGATION_PUSH received with no sender.tab")
    } else {
      console.log("[background] SPA push detected", { tabId, url: request.url })
      graph.addNode(tabId, request.url)
      console.log(graph.getStack(tabId))
      console.log(graph.getGraph())
    }
  }

  if (request.type === MESSAGE_LISTENERS.SET_ACTIVE_NODE) {
    const [tabId, nodeId] = [request.tabId, request.nodeId]

    const { activeNode, nodeInStack, delta } = graph.targetNode(tabId, nodeId)
    console.log("[background SET_ACTIVE_NODE]", activeNode, nodeInStack, delta)

    if (nodeInStack) {
      // history.go(delta) // TODO: why does history.go not work without chrome.scripting?
      chrome.scripting.executeScript({
        target: { tabId },
        func: (d: number, id: string) => {
          // Same isolated world as navigation-tracker.ts — it reads this back
          // when the traverse event fires on this document.
          window.__backTabPendingTraverse = id
          history.go(d) // Runs inside the webpage context where 'history' is defined
        },
        args: [delta, nodeId]
      })
    } else {
      chrome.tabs.update({ url: activeNode.url })
    }
    chrome.runtime.sendMessage({
      type: "GRAPH_UPDATED",
      tabId: tabId
    })
  }

  return true
})

// Handle navigation events (contruct the graph)
chrome.webNavigation.onCommitted.addListener((details) => {
  const {
    tabId,
    url,
    frameId,
    transitionType,
    transitionQualifiers,
    documentId
  } = details

  if (frameId !== 0) {
    // console.warn("Non-0 frameId change", frameId)
    return
  }

  console.log("[webNavigation] Navigation detected", {
    url,
    transitionType,
    transitionQualifiers
  })

  if (transitionQualifiers.includes("forward_back")) {
    console.log(
      "[webNavigation] forward/back navigation — handled by navigation-tracker, skipping addNode"
    )
    return
  }

  switch (transitionType) {
    case "link":
      console.log("User clicked a link")
      // TODO: handle edge case (user navigates to same url repeatedly (don't expand graph...))
      graph.addNode(tabId, url)
      console.log(graph.getStack(tabId))
      console.log(graph.getGraph())
      break
    case "typed":
      console.log("User typed a URL")
      // const prevTabId
      graph.addNode(tabId, url)
      console.log(graph.getStack(tabId))
      console.log(graph.getGraph())
      break
    case "auto_bookmark":
      console.log("User used a bookmark")
      break
    case "auto_subframe":
      console.log("User used an auto_subframe")
      break
    case "manual_subframe":
      console.log("User used a manual_subframe")
      break
    case "generated":
      console.log("Navigation from script")
      break
    case "start_page":
      console.log("Automatic reload or redirect")
      break
    case "form_submit":
      console.log("User submitted a form")
      break
    case "reload":
      console.log("User reloaded the page")
      break
    case "keyword":
      console.log("User used keyword")
      break
    case "keyword_generated":
      console.log("User used keyword_generated")
      break
  }
})
