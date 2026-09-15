---
id: 0006
title: Permission diet — get to zero host permissions
status: backlog
priority: high
area: manifest
tags: [launch, privacy, cws]
depends_on: [0005]
created: 2026-09-15
updated: 2026-09-15
---

Current manifest asks for `tabs`, `sessions`, `history`, `scripting`, `webNavigation`, and
`host_permissions: ["https://*/*"]`.

## Audit

- `history` — zero usages anywhere in `src/`. Delete.
- `sessions` — zero usages. Re-add only with [[0002]].
- `tabs` — only `tab.id` is read from `chrome.tabs.query` and `chrome.tabs.update` is called.
  Neither needs the permission. Probably droppable; verify. Note [[0008]] wants `favIconUrl`,
  which does need it.
- `scripting` — used for the `history.go()` injection. Works under `activeTab`.
- `webNavigation` — genuinely needed, keep.
- `https://*/*` — the expensive one. Triggers Chrome Web Store broad-host review and makes
  the install prompt read *"Read and change all your data on all websites."* For a history
  visualiser that is a conversion killer.

## The content script is what forces the host permission

It only does two jobs, both of which have background-side replacements:

- SPA push detection → `webNavigation.onHistoryStateUpdated` + `onReferenceFragmentUpdated`
- Traverse direction → URL-matching reconciliation on `forward_back` commits ([[0005]])

And `chrome.scripting.executeScript` for the `history.go()` jump works under `activeTab`,
which is granted both by clicking the extension action (opening the popup) and by a
`chrome.commands` keypress — the only two ways a jump is ever initiated (see [[0010]]).

## Target manifest

```json
{
  "permissions": ["webNavigation", "storage", "activeTab", "commands"],
  "optional_host_permissions": ["https://*/*"]
}
```

**Trade-off to accept knowingly:** `onHistoryStateUpdated` fires for both `pushState` and
`replaceState` and does not distinguish them, so some SPA navigations will be over- or
under-counted versus the Navigation API. Worth it for the permission story. Offer the host
permission as an optional runtime upgrade ("more accurate tracking on single-page apps")
for users who want the fidelity.

**Note:** `matches: ["https://*/*"]` also means the extension is dead on plain `http://`
sites today. Dropping the content script incidentally fixes that.
