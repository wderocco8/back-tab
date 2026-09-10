import { sendMessage } from "@/lib/messaging"
import type { TraverseDirection } from "@/types/graph"
import { MESSAGE_TYPES } from "@/types/messages"
import type { PlasmoCSConfig } from "plasmo"

declare global {
  interface Window {
    /**
     * Set by the background (via `chrome.scripting.executeScript` into this
     * same isolated world) immediately before it calls `history.go()`, holding
     * the node it is traversing to. Its presence on a `navigate` event marks
     * that traversal as extension-initiated.
     */
    __backTabPendingTraverse?: string | null
  }
}

export const config: PlasmoCSConfig = {
  matches: ["https://*/*"],
  run_at: "document_start"
}

// Runs in the isolated world, which shares the page's DOM/BOM (including
// window.navigation) but not the page's own JS globals or chrome.tabs /
// chrome.webNavigation / chrome.history (those are background-only).
window.navigation.addEventListener("navigate", (event) => {
  console.log("[navigation-tracker] navigate event", event.navigationType)

  // Consume on every navigation, not just traversals, so a marker left behind
  // by a go() that didn't navigate can't leak into a later event.
  const pendingNodeId = window.__backTabPendingTraverse ?? null
  window.__backTabPendingTraverse = null

  if (
    // NOTE: we do not include event.userInitiated as a requirement, otherwise it blocks many
    // navigation pushes from SPAs.
    event.navigationType === "push" &&
    event.destination.sameDocument
  ) {
    sendMessage({
      type: MESSAGE_TYPES.NAVIGATION_PUSH,
      url: event.destination.url
    })
    return
  }

  if (event.navigationType !== "traverse") return

  const currentIndex = window.navigation.currentEntry?.index ?? -1
  const direction: TraverseDirection =
    event.destination.index > currentIndex ? "forward" : "back"

  console.log(
    `[navigation-tracker] traverse event. index: ${currentIndex}, direction: ${direction}`
  )

  sendMessage({
    type: MESSAGE_TYPES.NAVIGATION_TRAVERSE,
    direction,
    internalNodeId: pendingNodeId
  })
})
