---
id: 0023
title: Track history slots by navigation.currentEntry.key, not traverse direction
status: backlog
priority: critical
area: background
tags: [core-value, correctness, navigation-api]
depends_on: []
created: 2026-10-04
updated: 2026-10-04
---

Back/forward across origins never reaches the background, so the cursor goes stale. The
next back then walks it off the stack and wedges the tab (the `undefined`-active-node failure
in [0012](0012-traverse-bounds-check.md)). Base case: new tab → type `A` → back. Equally
`x.com/a` → link → `y.com/b` → back.

## Why the `navigate` event can't be patched

The content script infers direction from the `navigate` event, which fires in the document
being **left**. Per the HTML spec ("check if unloading is canceled"), a top-level traverse
navigate event fires only when the target entry's origin equals the current entry's origin.
Cross-origin **pushes** do fire `navigate` — that is what MDN's "includes cross-origin
navigations" refers to — but cross-origin **traversals** do not. Verified against the spec
text on 2026-10-02, and matches observed behaviour.

Three further defects in the direction model, independent of origin:

- **Same-origin but non-contiguous.** `x → y → x`, then long-press back two steps: same
  origin, so the event fires, but the destination is not in this document's
  `navigation.entries()`. `destination.entry` is null, `destination.index` is `-1`, and
  `-1 > currentIndex` always reads as `"back"`.
- **Multi-step traversal.** The long-press back menu is one event; the message carries only a
  direction, so `Graph.traverse` moves the cursor 1.
- **Errors compound.** Cursor updates are relative, so one missed event corrupts every later
  position for the life of the tab.

## Fix: identify the slot, not the direction

Read `navigation.currentEntry.key` in the **destination** document. The spec stores the
navigation API key on the session history entry, not the document, so it survives
cross-document traversal and a full reload of that entry. The origin of the page being left
is irrelevant because nothing is read from it.

`key` identifies the history *slot* (reused on replace); `id` identifies the entry. A slot is
what `TabStack` mirrors, so key on `key`.

### Content script

`src/contents/navigation-tracker.ts` reports where it is, not what happened:

```ts
const report = () => {
  const entry = window.navigation.currentEntry
  if (entry?.key) sendMessage({ type: MESSAGE_TYPES.ENTRY, key: entry.key, url: entry.url })
}

report()                                                            // full load, incl. cross-origin traversal
window.navigation.addEventListener("currententrychange", report)     // same-document push / replace / traverse
window.addEventListener("pageshow", (e) => e.persisted && report())  // bfcache restore; content scripts don't re-run
```

`currententrychange` rather than `navigate`: it fires *after* the change, so `currentEntry` is
already the destination. One message (`ENTRY` is a placeholder name) replaces both
`NAVIGATION_PUSH` and `NAVIGATION_TRAVERSE`.

### Stack shape

The key lives on the stack entry, not the node:

```ts
export type StackEntry = {
  nodeId: string
  /** navigation.currentEntry.key; null when no content script could run (NTP, chrome://) */
  key: string | null
}

export type TabStack = { entries: StackEntry[]; cursor: number }
```

- **Not on `GraphNode`.** After `A → B → back → A → C → jump(B)`, Chrome discarded `B`'s
  original slot; `tabs.update` creates a new slot with a new key and `pushExisting` puts the
  existing `B` node in it. Same node, different key. Nodes are also what gets persisted
  ([0001](0001-persist-graph-state.md)) and exported ([0017](0017-export-graph-json.md));
  keys mean nothing once the tab closes.
- **Not a separate `key → nodeId` map.** Push-truncation drops dead slots' keys along with
  their entries for free. A parallel map would accumulate stale keys.

Both invariants hold: a `nodeId` appears at most once in `entries` (from
[0003](0003-jump-to-existing-node.md)), and so does a `key`.

### Background handler

The `ENTRY` handler is the **only** thing that mutates the stack for pages the content script
runs on:

- **Known key** → `cursor = entries.findIndex((e) => e.key === key)`, active node follows.
  Absolute, so any direction and any distance, and the next report re-anchors after a missed
  one.
- **Unknown key** → new slot. `takePendingJump`; if it names a node whose URL matches,
  `pushExisting(tabId, node, key)`, else `addNode(tabId, url, key)`.

Extension-initiated traversal (`SET_ACTIVE_NODE`, in-stack case) keeps `history.go(delta)`
with `delta` computed from the two indices. It no longer needs to move the cursor
optimistically — the destination's report does that.

`onCommitted` shrinks to pages with no content script plus transition metadata; that is
[0005](0005-transition-coverage.md).

## Deletes

- `TraverseDirection`, `NAVIGATION_PUSH`, `NAVIGATION_TRAVERSE` in `src/types/messages.ts`.
- `Graph.traverse` — and with it [0012](0012-traverse-bounds-check.md).
- `window.__backTabPendingTraverse`, its `executeScript` setter, and the cursor-drift check in
  the `NAVIGATION_TRAVERSE` handler.
- The `addNode` calls in the `onCommitted` `transitionType` switch.
- `targetNode`'s cursor write on the in-stack path.

## Decide now, not later

- **Known key, different URL.** A replace (`location.replace`, `replaceState` to a new URL,
  client redirects) keeps the key. Either update the node's `url` in place or mint a node and
  swap it into the slot. `GraphNode` is documented as never mutated away, so this is a real
  choice, not a detail.
- **`matches`.** Widen to `http://*/*` as well as `https://*/*`; plain-http sites are untracked
  today. Same install warning — see [0006](0006-permission-diet.md).

## Verify before building on it

- `currentEntry` is non-null at `document_start`.
- The key on `A` is identical after `A(x) → B(y) → back`, without bfcache (DevTools →
  Application → Back/forward cache → disable, or an `unload` handler).
- Replay with the `Graph` ring buffer (`console.table(graph.getLog())`): `A(x) → B(y) →
  back → forward`; `x → y → x` then long-press back 2; `NTP → A → back → forward`;
  `A → B → back → A → C → D → jump(B) → back ×4`. On `build/chrome-mv3-prod`.

## Out of scope / ruled out

- **Background-only URL matching as the primary mechanism.** `A → B → A`, back to `B`: back
  and forward both lead to URL `A` and nothing in `onCommitted` distinguishes the two slots.
  `documentId` only matches on bfcache hits, which are not guaranteed. Rejected for the core
  traversal path; kept only as the fallback for pages without a content script in
  [0005](0005-transition-coverage.md).
- **Removing the content script.** No background API exposes a tab's session-history
  position. Decision recorded in [0006](0006-permission-diet.md).
- **`navigation.traverseTo(key)` for jumps.** It only reaches entries in the calling
  document's same-origin `entries()`, so it cannot replace `history.go(delta)`.

## Related

- [0005](0005-transition-coverage.md) — the `onCommitted` side: pages with no content script
  and transition metadata. Depends on this.
- [0006](0006-permission-diet.md) — the content script stays; permission story changes.
- [0007](0007-initialise-open-tabs.md) — bootstrap-injects this content script into tabs that
  were already open.
- [0012](0012-traverse-bounds-check.md) — superseded; `traverse` is deleted.
- [0003](0003-jump-to-existing-node.md) — the pending-jump consumption moves from
  `onCommitted` into the `ENTRY` handler.
- [0004](0004-stack-overlay.md) — reads `entries`, so it picks up the `StackEntry` shape.
- On shipping, update README's Architecture section and the "Cross-origin back/forward is not
  tracked" known limitation, and CONTRIBUTING's content-script notes.
