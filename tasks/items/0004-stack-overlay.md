---
id: 0004
title: Show the Chrome stack as an overlay on the graph
status: backlog
priority: high
area: popup
tags: [ux, graph, safety]
depends_on: [0003]
created: 2026-09-15
updated: 2026-09-15
---

Required to make [[0003]] safe, not polish.

Once jumps stop minting nodes, **back/forward are no longer the graph's parent/children**.
After jumping, `entries` is `[A, C, B]` sitting on `B` — pressing back goes to `C`, which is
`B`'s *sibling* in the tree. The edge `A→B` says nothing about what the back button does.

The wrong fix is encoding the stack in the tree's shape; that is what produces the snake.
The right fix is an overlay:

> The tree shows what you explored. The overlay shows where Chrome can go.

Three states, not two:

| state | meaning | cost of jumping there |
| --- | --- | --- |
| **active** | `entries[cursor]` | — |
| **in stack** | anywhere in `entries` | free, instant `history.go()` |
| **off stack** | in the graph, not in `entries` | a real page load |

The third is the useful one and is currently thrown away. Dimming off-stack nodes tells the
user "this branch is gone from Chrome, going there costs a reload" — exactly the fact
`revisitOf` was clumsily encoding in the graph's shape, now reduced to styling.

Plus explicit back/forward badges on `entries[cursor - 1]` and `entries[cursor + 1]` so the
browser buttons are never a mystery.

## Wiring

```ts
// GetGraphResponse
{ graph, activeNodeId, backNodeId, forwardNodeId, stackNodeIds }

// FlowNodeData
{ ..., isActive, isBack, isForward, inStack }
```

**Hold off on** drawing a highlighted polyline through `entries` in order. The stack can jump
across the tree (`A → C → B`), so the path would cut across unrelated edges. Ship the badges
first; add the path only if orientation still feels lost.
