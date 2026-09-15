---
id: 0010
title: Branch-jump keyboard shortcut
status: backlog
priority: medium
area: background
tags: [headline-feature, commands, ux]
depends_on: [0003]
created: 2026-09-15
updated: 2026-09-15
---

The headline feature. The `A → B → A → C` case is exactly what Chrome's linear stack
destroys, and it is the reason someone installs this.

The primitive is **not** "jump to last branch" — it is **cycle siblings at the nearest branch
point**:

1. Walk `parent` up from the active node until a node with `children.length > 1`.
2. Move to the next (or previous) sibling subtree.

In `A → B → A → C`: active is `C`, walk up to `A`, `A.children` is `[B, C]`, land on `B`.

Mechanically this reuses `targetNode` unchanged. `B` is no longer in `entries` (the `A → C`
push truncated it), so it takes the push-existing path: `B` is appended to `entries` and
becomes active, and **the graph shape does not change**. That invariance is the point — the
shortcut is meant to be pressed constantly, so it must not accumulate anything.

**Prerequisite:** [[0003]] — without it, every shortcut press grows the snake, which is worse
than the popup case because the shortcut is meant to be used constantly.

**Interaction shape: alt-tab, not click-a-graph.** Press once to jump to the most recently
abandoned sibling at the nearest branch point; press again within a second to cycle to the
next. No popup, no clicking. The graph becomes the thing opened when genuinely lost, which
also lowers how much the layout has to carry.

**Use `chrome.commands`, not an injected keydown handler.** It works regardless of page
focus, never fights with a site's own shortcuts (Gmail, Notion), and — important for [[0006]]
— **a commands keypress grants `activeTab`**, which is what makes the `history.go()`
injection legal without host permissions. Chrome allows 4 commands with suggested key
bindings; spend two on next/prev sibling.
