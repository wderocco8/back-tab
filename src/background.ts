export {}

// import { onMessage } from "@plasmohq/messaging"
// import { Graph } from "./graph" // your custom graph class

// const graph = new Graph()

// // When a tab is created
// chrome.tabs.onCreated.addListener((tab) => {
//   console.log("[backtround.ts] tab created", tab.id, tab.url);
//   // graph.addNode(tab.id, tab.url)
// })

// // When a tab is updated (e.g., navigated)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.url) {
//     console.log("[backtround.ts] tab updated", tab.id, tab.url, changeInfo);
//     // graph.addNode(tabId, changeInfo.url)
//     // graph.addEdge(tabId, changeInfo.url) // You can track "from" if you store previous URL
//   }
// })

// // When a tab is restored
// chrome.sessions.onChanged.addListener((session) => {
//   if (session.tab) {
//     // graph.addNode(session.tab.id, session.tab.url)
//   }
// })

// // When a tab is removed
// chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
//   console.log("[backtround.ts] tab closed", tabId, removeInfo)
//   // graph.removeNode(tabId)
// })

// // When a user switches tabs
// chrome.tabs.onActivated.addListener((activeInfo) => {
//   chrome.tabs.get(activeInfo.tabId, (tab) => {
//     console.log("[backtround.ts] tab switched (within window)", tab.id, tab.url)
//     // graph.recordActivation(activeInfo.tabId, tab.url)
//   })
// })

chrome.webNavigation.onCommitted.addListener((details) => {
  const { tabId, url, frameId, transitionType, transitionQualifiers } = details

  if (frameId !== 0) {
    console.error("Non-0 frameId change", frameId)
    return
  }

  console.log("[webNavigation] Navigation detected", {
    url,
    transitionType,
    transitionQualifiers
  })

  switch (transitionType) {
    case "link":
      console.log("User clicked a link")
      break
    case "typed":
      console.log("User typed a URL")
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
