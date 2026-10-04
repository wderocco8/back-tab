---
id: 0007
title: Initialise tabs that were already open
status: backlog
priority: high
area: background
tags: [correctness, bootstrap]
depends_on: [0023]
created: 2026-09-15
updated: 2026-10-04
---

Two distinct failures when the extension loads (install, update, or browser start) with tabs
already open.

## (a) No content script in pre-existing tabs

Declarative `matches` only inject on future page loads, so all tracking from the content script
— which after [0023](0023-track-slots-by-entry-key.md) is every stack mutation on normal pages —
is dead in every already-open tab until it is reloaded. Bootstrap on `onInstalled` /
`onStartup`:

```ts
const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] })
await Promise.allSettled(
  tabs.map((t) =>
    chrome.scripting.executeScript({
      target: { tabId: t.id! },
      files: ["navigation-tracker.js"]
    })
  )
)
```

No longer moot: [0006](0006-permission-diet.md) keeps the content script. The injected script
reports its current key on first run, which seeds the tab's stack with one entry. History
before injection is unknowable — accept a single root, don't try to reconstruct it.

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
