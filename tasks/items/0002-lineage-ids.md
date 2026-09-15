---
id: 0002
title: Decouple graph identity from tabId (lineage ids)
status: backlog
priority: critical
area: background
tags: [identity, data-loss, arc]
depends_on: [0001]
created: 2026-09-15
updated: 2026-09-15
---

`tabId` is being used as durable identity and it is not one. It dies on tab close, changes
on restore, and duplicates on duplicate-tab. This single root cause produces several
separate-looking bugs:

- Close a tab and reopen it (Ctrl+Shift+T) → new `tabId`, history orphaned, graph starts over.
- Duplicate a tab → new `tabId`, no connection to the original's history.
- Move a tab between windows, or restore a session on startup → same.
- `GraphNode.tabId` goes stale, and `toFlow.ts` filters visibility on it, so orphaned nodes
  linger and render hidden forever.
- **Arc auto-archives tabs on a timer** (12h by default). Archiving closes the tab; reopening
  it from the archive assigns a new `tabId`. So in Arc this bug fires on a schedule with no
  user action at all, which makes Arc both the worst case for the current design and the best
  test environment for the fix.

## Approach

Introduce a stable lineage id (UUID per browsing session) and demote `tabId` to a disposable
lookup:

```
nodes:           nodeId    -> GraphNode { lineageId, ... }   // durable
lineageToStack:  lineageId -> TabStack                       // durable
tabToLineage:    tabId     -> lineageId                      // ephemeral, rebuilt freely
```

Reattachment becomes one function instead of a per-case special case.

- On `chrome.tabs.onRemoved`, keep the lineage and record a fingerprint: active URL, stack
  length, cursor, timestamp.
- On a new tab's first commit with no known lineage, try to adopt an orphaned one.
  `chrome.sessions.getRecentlyClosed()` gives the closed tab's `sessionId` and URL, which is
  a high-confidence match for the Ctrl+Shift+T case specifically. Fall back to URL + recency
  matching otherwise.
- `chrome.tabs.onCreated` carries `openerTabId` — use it to inherit rather than adopt when
  the new tab was spawned from a live one (see [[0009]]).

## Scope

- Rename `GraphNode.tabId` → `lineageId`; update `toFlow.ts`'s visibility filter and
  `FlowNodeData`.
- Messages still carry `tabId` (that is what the popup and content script know); the
  background resolves it to a lineage at the edge.
- Re-add the `sessions` permission, which is currently declared but unused (see [[0006]]).

## Supersedes the old "clean up per-tab state on `chrome.tabs.onRemoved`" task

That task proposed a `forgetTab(tabId)` clearing all four tabId-keyed maps. That answer is
wrong under this design: on tab close we want to *keep* the lineage and drop only the
`tabToLineage` entry. The one thing still true from it — `tabToNavigationSession` is dead
code — is tracked separately as [[0013]].
