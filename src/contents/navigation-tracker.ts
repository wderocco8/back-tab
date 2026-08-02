import { MESSAGE_LISTENERS } from "@/constants"
import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://*/*"],
  run_at: "document_start"
}

export type TraverseDirection = "forward" | "back"

// Runs in the isolated world, which shares the page's DOM/BOM (including
// window.navigation) but not the page's own JS globals or chrome.tabs /
// chrome.webNavigation / chrome.history (those are background-only).
window.navigation.addEventListener("navigate", (event) => {
  console.log("[navigation-tracker] traverse event", event.navigationType)

  if (event.navigationType !== "traverse") {
    chrome.runtime.sendMessage({
      type: event.navigationType,
      url: event.destination.url
    })
    return
  }

  const currentIndex = window.navigation.currentEntry?.index ?? -1
  const direction: TraverseDirection =
    event.destination.index > currentIndex ? "forward" : "back"

  console.log(
    `[navigation-tracker] traverse event. index: ${currentIndex}, direction: ${direction}`
  )

  chrome.runtime.sendMessage({
    type: MESSAGE_LISTENERS.NAVIGATION_TRAVERSE,
    url: event.destination.url,
    direction
  })
})
