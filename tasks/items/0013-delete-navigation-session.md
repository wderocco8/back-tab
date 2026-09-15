---
id: 0013
title: Delete tabToNavigationSession and the NavigationSession type
status: backlog
priority: medium
area: graph
tags: [dead-code, quick-fix]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

`tabToNavigationSession` is declared in `Graph` (`src/graph/index.ts:34`), never read, never
written. Delete it and the `NavigationSession` type.

Carried over from the old `chrome.tabs.onRemoved` cleanup task, whose other half is
superseded by [[0002]].
