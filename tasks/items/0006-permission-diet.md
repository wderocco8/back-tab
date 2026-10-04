---
id: 0006
title: Permission diet — drop unused permissions, justify the content script
status: backlog
priority: high
area: manifest
tags: [launch, privacy, cws]
depends_on: []
created: 2026-09-15
updated: 2026-10-04
---

> **Rescoped 2026-10-04.** The original goal was zero host permissions, by replacing the
> content script with background-side URL matching. That was dropped: see "Decision" below.

Current manifest asks for `tabs`, `sessions`, `history`, `scripting`, `webNavigation`, and
`host_permissions: ["https://*/*"]`.

## Decision: the content script stays

Exact back/forward tracking needs `navigation.currentEntry.key`, read inside the page
([0023](0023-track-slots-by-entry-key.md)). No background API exposes a tab's session-history
position, and the background-only alternative (URL matching on `forward_back` commits) can't
tell apart two slots with the same URL — `A → B → A`, back to `B`, then back vs forward. That
is the product's core case, so a heuristic there is not acceptable.

A content script declared with broad `matches` produces the same *"Read and change all your
data on all websites"* install warning as `host_permissions`. Accept it, and make it
defensible:

- The script reads `navigation.currentEntry` and sends one message. No DOM reads, no page
  content, no injection into the page's own world.
- Say exactly that in the Web Store permission justification and the listing.

## Audit

- `history` — zero usages anywhere in `src/`. Delete.
- `sessions` — zero usages. Re-add only with [0002](0002-lineage-ids.md).
- `tabs` — only `tab.id` is read from `chrome.tabs.query` and `chrome.tabs.update` is called.
  Neither needs the permission. Probably droppable; verify. Note
  [0008](0008-node-title-favicon.md) wants `favIconUrl`, which needs `tabs` or host
  permission — the latter is now present anyway.
- `scripting` — used for the `history.go()` injection, and needed by
  [0007](0007-initialise-open-tabs.md)'s bootstrap injection. Keep. (The jump itself could
  instead be a `chrome.tabs.sendMessage` to the content script, but 0007 still needs
  `scripting`, so there is nothing to gain.)
- `webNavigation` — needed for pages without a content script and transition metadata
  ([0005](0005-transition-coverage.md)). Keep. Its own warning, *"Read your browsing
  history"*, is an honest description of the product.
- `https://*/*` — keep, and add `http://*/*` (plain-http sites are untracked today). Same
  warning either way.

## Target manifest

```json
{
  "permissions": ["webNavigation", "storage", "scripting"],
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

Plus `tabs` if the audit shows it's needed, `sessions` with 0002, `commands` with
[0010](0010-branch-jump-shortcut.md).

## Out of scope / ruled out

- **Zero host permissions with background-only tracking.** See "Decision".
- **Opt-in exact tracking** (`optional_host_permissions` + runtime-registered content script,
  heuristic tracking by default). Two tracking code paths, and the default one would be the
  heuristic. Revisit only if the install warning measurably hurts conversion.
