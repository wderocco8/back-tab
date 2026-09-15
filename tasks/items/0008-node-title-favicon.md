---
id: 0008
title: Store title and favIconUrl on GraphNode
status: backlog
priority: medium
area: graph
tags: [ux, first-impression]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

`GraphNode` has neither. The graph renders as anonymous 25px dots (`DEFAULT_NODE_DIMENSIONS`)
with a raw URL in a hover tooltip — unreadable past roughly eight nodes, and it is the first
thing any user sees.

Favicon inside the node plus title on hover changes the entire feel of the product. Both are
available on the `chrome.tabs.Tab` object; `favIconUrl` needs `tabs` or host permission, so sequence
this against [0006](0006-permission-diet.md) (fall back to `https://www.google.com/s2/favicons` or a
first-letter glyph if the permission is gone).

Prerequisite for [0018](0018-graph-search.md).
