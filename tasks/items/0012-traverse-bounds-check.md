---
id: 0012
title: Graph.traverse needs bounds checking
status: wont-do
priority: medium
area: graph
tags: [bug, quick-fix]
depends_on: []
created: 2026-09-15
updated: 2026-10-04
---

> **Superseded by [0023](0023-track-slots-by-entry-key.md) (2026-10-04).** `Graph.traverse` and
> its relative `±1` cursor step are deleted; the cursor is set from the index of a reported
> history key, so it can't walk off the stack. Carry the invariant over: never write
> `undefined` into `tabToActiveNode` — an unknown key or out-of-range index must bail, not
> write.

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

Reproduced 2026-09-25 by replaying `A → B → back → A → C → D → jump(B) → back ×4` against
`Graph`: the fourth back leaves `cursor=-1`. In the real browser the trigger is usually a
cross-origin traversal that never reached the background, leaving the cursor ahead of
Chrome's.
