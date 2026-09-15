---
id: 0012
title: Graph.traverse needs bounds checking
status: backlog
priority: medium
area: graph
tags: [bug, quick-fix]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

`src/graph/index.ts` — `entries[newCursor]` can be `undefined` when the cursor walks off
either end, and that `undefined` gets written into `tabToActiveNode`. From then on every
`getActiveNodeId` throws, which permanently wedges that tab's graph: `GET_GRAPH` never
replies and the popup renders nothing.

```ts
const newCursor = cursor + delta
const newActiveNodeId = entries[newCursor]   // may be undefined
this.tabToStack.set(tabId, { entries, cursor: newCursor })
this.tabToActiveNode.set(tabId, newActiveNodeId)
```

**Fix:** clamp and bail before writing. Bounds-check unconditionally, not only on the
reconciliation path.

Independent, but the same failure mode is analysed in depth under [[0005]].
