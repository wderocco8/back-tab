import { Graph } from "@/graph"
import { parseMessage, sendMessage } from "@/lib/messaging"
import {
  BACKGROUND_MESSAGE_TYPES,
  MESSAGE_TYPES,
  type GetGraphResponse
} from "@/types/messages"

const graph = new Graph()

/**
 * Routes messages from the popup and the content script.
 *
 * Deliberately not `async`: Chrome keeps the reply port open only when the
 * listener returns the literal `true`, and an async listener returns a Promise
 * instead. Any asynchronous work must go in a nested function so the
 * `sendResponse` calls here stay synchronous.
 */
chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: GetGraphResponse) => void
  ) => {
    console.log("[background] receieved message", message)

    // Anything on the runtime bus reaches this listener, so the parameter is
    // genuinely unknown until validated - including messages from a stale
    // content script left over from a previous build.
    const request = parseMessage(message, BACKGROUND_MESSAGE_TYPES)
    if (!request) {
      console.warn("[background] ignoring unrecognised message", message)
      return false
    }

    // Only present when the sender is a content script; popup pages have no tab.
    const senderTabId = sender.tab?.id

    switch (request.type) {
      case MESSAGE_TYPES.GET_GRAPH: {
        sendResponse({
          graph: graph.getGraph(),
          activeNodeId: graph.getActiveNodeId(request.tabId)
        })
        break
      }

      case MESSAGE_TYPES.NAVIGATION_TRAVERSE: {
        const { direction, internalNodeId } = request
        console.log("[background] traverse detected", { senderTabId, direction })

        if (internalNodeId) {
          // We caused this traversal, and targetNode already moved the cursor.
          // Only verify that it landed where we aimed.
          if (senderTabId !== undefined) {
            const { entries, cursor } = graph.getStack(senderTabId)
            if (entries[cursor] !== internalNodeId) {
              console.error("[background] cursor drift", {
                expected: internalNodeId,
                actual: entries[cursor]
              })
            }
          }
        } else {
          graph.traverse(senderTabId, direction)
        }

        console.log(senderTabId ? graph.getStack(senderTabId) : "no tabId")
        console.log(graph.getGraph())
        break
      }

      case MESSAGE_TYPES.NAVIGATION_PUSH: {
        // Same-document (SPA) navigation — webNavigation.onCommitted never
        // fires for these, so this is the only place they get added.
        if (senderTabId === undefined) {
          console.error(
            "[background] NAVIGATION_PUSH received with no sender.tab"
          )
          break
        }
        console.log("[background] SPA push detected", {
          senderTabId,
          url: request.url
        })
        graph.addNode(senderTabId, request.url)
        console.log(graph.getStack(senderTabId))
        console.log(graph.getGraph())
        break
      }

      case MESSAGE_TYPES.SET_ACTIVE_NODE: {
        const { tabId, nodeId } = request
        const { activeNode, nodeInStack, delta } = graph.targetNode(
          tabId,
          nodeId
        )
        console.log("[background SET_ACTIVE_NODE]", activeNode, nodeInStack, delta)

        if (nodeInStack) {
          // A real traversal: no new history entry, forward entries survive.
          // `func` is serialized to source and rebuilt in the page, so it has
          // no closure over this scope — everything it needs comes via `args`.
          chrome.scripting.executeScript({
            target: { tabId },
            func: (d: number, id: string) => {
              // Same isolated world as navigation-tracker.ts, which reads this
              // back when the traverse event fires on this document.
              window.__backTabPendingTraverse = id
              history.go(d)
            },
            args: [delta, nodeId]
          })
        } else {
          // Chrome discarded this entry, so it cannot be traversed to. The
          // resulting commit creates a revisit node via webNavigation below.
          chrome.tabs.update({ url: activeNode.url })
        }

        sendMessage({ type: MESSAGE_TYPES.GRAPH_UPDATED, tabId })
        break
      }

      default: {
        // Unreachable: parseMessage admits only BACKGROUND_MESSAGE_TYPES, and
        // the cases cover them. Assigning to `never` makes adding a type to
        // that list without a case here a compile error.
        const unhandled: never = request
        console.warn("[background] unhandled message", unhandled)
      }
    }

    // Keeps the reply port open for the synchronous sendResponse above.
    return true
  }
)

/**
 * Builds the graph from full-document navigations.
 *
 * Same-document (SPA) navigation never reaches this listener — that arrives as
 * a NAVIGATION_PUSH message from the content script instead.
 */
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
