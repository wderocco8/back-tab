---
id: 0007
title: Initialise tabs that were already open
status: backlog
priority: high
area: background
tags: [correctness, bootstrap]
depends_on: [0006]
created: 2026-09-15
updated: 2026-09-15
---

Two distinct failures when the extension loads (install, update, or browser start) with tabs
already open.

## (a) No content script in pre-existing tabs

Declarative `matches` only inject on future page loads, so SPA push tracking is dead in every
already-open tab until it is reloaded. Bootstrap on `onInstalled` / `onStartup`:

```ts
const tabs = await chrome.tabs.query({ url: "https://*/*" })
await Promise.allSettled(
  tabs.map((t) =>
    chrome.scripting.executeScript({
      target: { tabId: t.id! },
      files: ["navigation-tracker.js"]
    })
  )
)
```

Moot if [0006](0006-permission-diet.md) removes the content script entirely — do that first
and this half may disappear.

## (b) `GET_GRAPH` throws for an unknown tab

`Graph.getActiveNodeId` throws, the exception escapes the `onMessage` listener,
`sendResponse` is never called, and the popup just logs `"[popup] GET_GRAPH failed"` and
renders nothing. Fix: make the unknown-tab path a lazy seed — `chrome.tabs.get(tabId)` →
create a root node from the current URL/title → return it.

## Verify the reported symptom first

The claim was "link clicks in an unadopted tab don't add nodes", but that should not be true
as written: `webNavigation.onCommitted` is background-only and `addNode` handles a null
parent fine, so a link click ought to create a root node. If it genuinely does not, that is a
third bug and needs isolating before designing around it.
