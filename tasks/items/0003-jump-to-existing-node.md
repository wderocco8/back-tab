---
id: 0003
title: Jump to an existing node instead of minting a duplicate
status: active
priority: high
area: background
tags: [core-value, graph]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

> **Status note (2026-09-15):** largely implemented on `release/0.1.0`. `pushExisting`,
> `takePendingJump` and the listener ordering are in `src/graph/index.ts` and
> `src/background.ts`; `GraphNode.revisitOf` and the dashed-edge branch are gone; the missing
> `tabId` on `chrome.tabs.update` is fixed; `GRAPH_UPDATED` now fires from `onCommitted`.
>
> Remaining:
> 1. Finish the `sendMessage` pass (HEAD is `de491e8 fix sendMessage bugs (WIP)`).
> 2. The Deletions section below is **not** finished. `REVISIT_EDGE_KIND` still exists in
>    `src/constants/index.ts`, `src/graph/toFlow.ts:1` imports it without using it, and
>    `src/graph/toLayout.ts:35` still tests `edge.data?.kind === REVISIT_EDGE_KIND` — a branch
>    nothing can satisfy now. Note [[0009]] may want that exclusion mechanism back for
>    cross-tab edges, so decide whether to delete it or repurpose it rather than reflexively
>    removing it.
> 3. Verify against a production build, not `plasmo dev`.

**This is the core-value task.** The `A → B → A → C`, jump-back-to-`B` case is the reason the
extension exists, and today performing it degrades the graph.

## What goes wrong

`SET_ACTIVE_NODE` on a node Chrome has discarded sets a pending marker, calls
`chrome.tabs.update`, and the resulting commit runs `addNode` — which mints a *new* node
whose parent is `tabToActiveNode`, i.e. **wherever the user happened to be standing when
they jumped**. So the tree encodes jump origin as navigation structure. On the most common
real trace (a search page `G` with three results):

```
        G                          G
     ╱  │  ╲                    ╱  │  ╲
   r1  r2   r3    jump to r1  r1  r2   r3
                  ─────────►          ╲
                                       r1′ ⇠ ─ ─ r1
                  jump to r2           ╲
                                        r2′ ⇠ ─ ─ r2
```

Every jump grows a snake off the current node, `revisitOf` edges point back across the
graph, dagre ranks the snake deeper each time, and `fitView` drifts away from the cluster
that matters. Using the headline feature makes the view worse.

## Fix: push the existing nodeId onto the stack, mint nothing

The stack bookkeeping is unchanged — `chrome.tabs.update` truncates forward entries and
pushes one, which is exactly what `addNode` already does:

```ts
const newEntries = [...entries.slice(0, cursor + 1), id]
```

The only difference is *which* id gets pushed: the existing node rather than a fresh one.

```ts
/** Jump target already exists in the graph - push it, don't mint a node. */
pushExisting(tabId: number, nodeId: string): void {
  const { entries, cursor } = this.getStack(tabId)
  this.tabToStack.set(tabId, {
    entries: [...entries.slice(0, cursor + 1), nodeId],
    cursor: cursor + 1
  })
  this.tabToActiveNode.set(tabId, nodeId)
}
```

**Listener ordering is the whole trick.** The marker check must run before the
`transitionType` switch and return, or the commit falls through to `addNode` and mints the
duplicate anyway:

```ts
chrome.webNavigation.onCommitted.addListener((details) => {
  const { tabId, url, frameId, transitionType, transitionQualifiers } = details
  if (frameId !== 0) return

  // Read-and-clear on every main-frame commit, so a tabs.update that never
  // landed can't leak its marker into a later, unrelated navigation.
  const pending = graph.takePendingJump(tabId)

  if (transitionQualifiers.includes("forward_back")) return   // traverse path

  if (pending && graph.getNode(pending).url === url) {
    graph.pushExisting(tabId, pending)
    return                              // never reaches the switch
  }

  switch (transitionType) { /* addNode paths */ }
})
```

**Deliberately ignores `transitionType` on this path.** Extension-initiated `tabs.update` is
not documented to report a stable transition (`link` vs `typed` is a coin flip), so the
marker is the signal and the transition is irrelevant once we know we caused the navigation.

**The URL guard is a real fallback, not decoration.** If `tabs.update` hits a redirect and
lands somewhere other than `B.url`, the comparison fails and it falls through to `addNode` —
correct, because the tab genuinely isn't where we aimed. Same for the rare race where the
user clicks a link while the `tabs.update` is in flight.

**Useful invariant that falls out:** `targetNode` only takes the push path when
`entries.includes(nodeId)` is false, so **a nodeId can appear at most once in `entries`**.
`indexOf` stays correct and `targetNode`'s lookup logic needs no changes.

## Fix the stale broadcast while here (pre-existing bug)

`SET_ACTIVE_NODE` used to do:

```ts
chrome.tabs.update({ url: activeNode.url })
sendMessage({ type: MESSAGE_TYPES.GRAPH_UPDATED, tabId })   // fires immediately
```

That broadcast goes out synchronously, well before the commit, so an open popup refetches
and renders the *pre-jump* state. And `onCommitted` broadcast nothing at all, so the popup
never learned the jump landed — nor about any organic navigation. Under this change the
mutation moves entirely to commit time, which makes the staleness worse unless the broadcast
moves there too. Broadcast `GRAPH_UPDATED` from `onCommitted` after the graph mutates.

## Deletions

`GraphNode.revisitOf`, the dashed-edge branch in `toFlow.ts`, `REVISIT_EDGE_KIND` in
`constants/index.ts`, and the exclusion for it in `toLayout.ts`. Net negative lines.

## Explicitly out of scope: URL identity for organic navigation

Repeat visits reached by actually navigating still mint new nodes. That is honest (the user
really did navigate there again), it avoids any URL-equality heuristic, and SPAs with stable
URLs would collapse wrongly under one. Revisit after two weeks of real use.

## Sequencing

**Not blocked on [[0002]].** The collapse is scoped per `tabId` today; lineage ids only
change what that scope survives. Orthogonal — do this one first, it is smaller and it is the
core value. Prerequisite for [[0010]] and [[0004]].
