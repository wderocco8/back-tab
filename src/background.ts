import { Graph } from "./graph"

export {}

const graph = new Graph()

chrome.webNavigation.onCommitted.addListener((details) => {
  const { tabId, url, frameId, transitionType, transitionQualifiers } = details

  if (frameId !== 0) {
    // console.warn("Non-0 frameId change", frameId)
    return
  }

  console.log("[webNavigation] Navigation detected", {
    url,
    transitionType,
    transitionQualifiers
  })

  switch (transitionType) {
    case "link":
      if (!transitionQualifiers.includes("forward_back")) {
        console.log("User clicked a link")
        graph.addNode(tabId, url)
        
        console.log("ADDED NODE TO GRAPH", graph.getGraph());
      }

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

  if (transitionQualifiers.includes("forward_back")) {
    console.log("User used forward/back");
    
  }
})
