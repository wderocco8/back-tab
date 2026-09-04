import { MESSAGE_LISTENERS } from "@/constants"
import { Graph } from "@/graph"

const graph = new Graph()

// const lastUrls = new Map<number, string>() // tabId → last URL

// // TODO: maybe implement de-duplication
// function handleNav(tabId: number, url: string, source: string) {
//   if (lastUrls.get(tabId) === url) return // prevent duplicates
//   lastUrls.set(tabId, url)
//   console.log(`[${source}] Navigation detected:`, url)
//   graph.addNode(tabId, url)
// }

// Use to determine if naviagation is caused by extension or by the browser
const extensionInitiatedNavigations = new Set<string>() // key: `${tabId}|${url}`

// Handle messaging from background to popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    const [tabId, url, direction] = [
      sender.tab?.id,
      request.url,
      request.direction
    ]
    console.log("[background] traverse detected", {
      tabId,
      url,
      direction
    })
    // TODO: decide how this reconciles with the transitionQualifiers
    // "forward_back" check below and graph.goForwardBack's URL matching.
    graph.traverse(tabId, url, direction)
    //   // console.log(graph.getActiveNode(tabId), graph.getGraph())
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
    }
  }

  if (request.type === MESSAGE_LISTENERS.SET_ACTIVE_NODE) {
    const [tabId, nodeId] = [request.tabId, request.nodeId]
    const activeNode = graph.setActiveNode(tabId, nodeId)
    const key = `${tabId}|${activeNode?.url}`
    extensionInitiatedNavigations.add(key)
    chrome.tabs.update({ url: activeNode?.url })
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

  const key = `${details.tabId}|${details.url}`
  const isExtensionNav = extensionInitiatedNavigations.has(key)

  if (isExtensionNav) {
    console.log("[webNavigation] Detected extension-initiated nav")
    extensionInitiatedNavigations.delete(key) // clean up
    return
  }

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
      break
    case "typed":
      console.log("User typed a URL")
      // const prevTabId
      graph.addNode(tabId, url)
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

  // TODO: this is deprecated temporarily -> ideally navigation-tracker should handle it instead...
  // if (transitionQualifiers.includes("forward_back")) {
  //   console.log("User used forward/back")
  //   graph.goForwardBack(tabId, url)
  //   // console.log(graph.getActiveNode(tabId), graph.getGraph())
  // }
})

// chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
//   if (details.frameId === 0) {
//     console.log("[webNavigation] SPA route change detected", {
//       url: details.url,
//       transitionType: details.transitionType
//     })
//     graph.addNode(details.tabId, details.url)
//   }
// })
