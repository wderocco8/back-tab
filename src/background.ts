export {}
console.log("HELLO WORLD FROM BGSCRIPTS")

// import { onMessage } from "@plasmohq/messaging"
// import { Graph } from "./graph" // your custom graph class

// const graph = new Graph()

// When a tab is created
chrome.tabs.onCreated.addListener((tab) => {
  console.log("[backtround.ts] tab created", tab.id, tab.url);
  // graph.addNode(tab.id, tab.url)
})

// When a tab is updated (e.g., navigated)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    console.log("[backtround.ts] tab updated", tab.id, tab.url, changeInfo);
    // graph.addNode(tabId, changeInfo.url)
    // graph.addEdge(tabId, changeInfo.url) // You can track "from" if you store previous URL
  }
})

// When a tab is removed
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  console.log("[backtround.ts] tab closed", tabId, removeInfo);
  // graph.removeNode(tabId)
})

// When a user switches tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    console.log("[backtround.ts] tab switched (within window)", tab.id, tab.url);
    // graph.recordActivation(activeInfo.tabId, tab.url)
  })
})

// // When a tab is restored
// chrome.sessions.onChanged.addListener((session) => {
//   if (session.tab) {
//     // graph.addNode(session.tab.id, session.tab.url)
//   }
// })
