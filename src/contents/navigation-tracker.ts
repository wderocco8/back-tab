import { MESSAGE_LISTENERS } from "@/constants"
import type { PlasmoCSConfig } from "plasmo"

declare global {
  interface Window {
    __backTabPendingTraverse?: string | null
  }
}

export const config: PlasmoCSConfig = {
  matches: ["https://*/*"],
  run_at: "document_start"
}

export type TraverseDirection = "forward" | "back"

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
    event.navigationType === "push" &&
    // event.userInitiated &&
    event.destination.sameDocument
  ) {
    chrome.runtime.sendMessage({
      type: MESSAGE_LISTENERS.NAVIGATION_PUSH,
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

  chrome.runtime.sendMessage({
    type: MESSAGE_LISTENERS.NAVIGATION_TRAVERSE,
    url: event.destination.url,
    direction,
    internalNodeId: pendingNodeId // non-null ⇒ we caused this
  })
})
