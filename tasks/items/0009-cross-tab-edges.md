---
id: 0009
title: Cross-tab edges via openerTabId
status: backlog
priority: medium
area: background
tags: [graph, value-per-line]
depends_on: [0002]
created: 2026-09-15
updated: 2026-09-15
---

`chrome.tabs.onCreated` hands over `openerTabId` for free. Middle-clicking or cmd-clicking a
link is the single most common branching behaviour during research, and right now every one
of those starts a disconnected tree with no relationship to where it came from.

Highest value-per-line item on the board. Connect the new tab's root node to the opener's
active node as a child, tagged as a cross-tab edge so it can be styled differently (and
possibly excluded from the dagre ranking — note that the `REVISIT_EDGE_KIND` exclusion this
would have mirrored is deleted by [[0003]], so `toLayout.ts` may need the exclusion mechanism
reintroduced for this case).

Depends on [[0002]] — the edge should point at a lineage, not a `tabId`.
