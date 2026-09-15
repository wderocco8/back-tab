# Backlog

Prioritized list of upcoming work. Move items to `active.md` when starting, `archive.md` when done.

---

## Critical

### Persist graph state across service worker restarts

All graph state lives in `Graph`'s in-memory maps. MV3 terminates the service worker after
~30s idle, taking every map with it. Every open tab silently loses its history and starts
over from a root node on the next navigation.

**This is invisible in development.** `plasmo dev` injects a keepalive into the background
bundle that makes the worker immortal:

```js
// build/chrome-mv3-dev/static/background/index.js
let t = () => setInterval(e.getPlatformInfo, 24e3);
e.onStartup.addListener(t), t();
```

Any `chrome.*` call resets the idle timer, so a 24s interval keeps the worker alive forever.
The HMR WebSocket pings on the same interval and extends the lifetime too. The production
bundle (`build/chrome-mv3-prod/static/background/index.js`) contains **none** of this —
zero `setInterval`, zero `WebSocket`, zero `getPlatformInfo`. So the worker dies constantly
for real users and never for us.

**Verify before and after**

Add an instance marker at the top of `src/background.ts`:

```ts
const INSTANCE = crypto.randomUUID()
console.log("[background] worker start", INSTANCE)
```

Load `build/chrome-mv3-prod` unpacked, browse, idle ~40s, reopen the popup. A changed
`INSTANCE` means the worker restarted. `chrome://extensions` also shows
"service worker (inactive)" when it is dead.

**Scope**

- Back `Graph` with `chrome.storage.session`. Survives worker restart, never touches disk,
  cleared on browser restart, 10 MB quota.
- Write-behind with a short debounce (~200ms). Every navigation event mutating storage
  synchronously would be a lot of churn.
- Hydrate lazily on first access, guarded by a single in-flight promise so concurrent
  events (a commit and a `GET_GRAPH` arriving together on a cold worker) don't double-load
  or interleave writes.
- Every `Graph` accessor becomes async. This ripples through `background.ts` — note the
  existing comment there about keeping `sendResponse` synchronous; the listener must still
  `return true` and do the await inside a nested async function.

**Decide now, not later**

- **Retention.** `nodes` is append-only and never truncates by design, so it grows without
  bound. Needs a cap — per-lineage node limit, or TTL eviction of lineages with no live tab.
  Pick one before persistence ships, because storage makes unbounded growth permanent.
- **`session` vs `local`.** `session` means the tree dies on browser restart, which
  undercuts the core "never lose what B was" pitch. `local` means persisting a full
  browsing history to disk — a real privacy commitment needing explicit disclosure in the
  store listing. Ship `session` as the default, expose `local` as an opt-in setting with a
  retention window.

**Related:** blocks the lineage task below (stale tab keys only matter once state survives),
and the `chrome.tabs.onRemoved` cleanup folded into it.

---

### Decouple graph identity from `tabId` (lineage ids)

`tabId` is being used as durable identity and it is not one. It dies on tab close, changes
on restore, and duplicates on duplicate-tab. This single root cause produces several
separate-looking bugs:

- Close a tab and reopen it (Ctrl+Shift+T) → new `tabId`, history orphaned, graph starts over.
- Duplicate a tab → new `tabId`, no connection to the original's history.
- Move a tab between windows, or restore a session on startup → same.
- `GraphNode.tabId` goes stale, and `toFlow.ts` filters visibility on it, so orphaned nodes
  linger and render hidden forever.
- **Arc auto-archives tabs on a timer** (12h by default). Archiving closes the tab; reopening
  it from the archive assigns a new `tabId`. So in Arc this bug fires on a schedule with no
  user action at all, which makes Arc both the worst case for the current design and the best
  test environment for the fix.

**Approach**

Introduce a stable lineage id (UUID per browsing session) and demote `tabId` to a disposable
lookup:

```
nodes:           nodeId    -> GraphNode { lineageId, ... }   // durable
lineageToStack:  lineageId -> TabStack                       // durable
tabToLineage:    tabId     -> lineageId                      // ephemeral, rebuilt freely
```

Reattachment becomes one function instead of a per-case special case.

- On `chrome.tabs.onRemoved`, keep the lineage and record a fingerprint: active URL, stack
  length, cursor, timestamp.
- On a new tab's first commit with no known lineage, try to adopt an orphaned one.
  `chrome.sessions.getRecentlyClosed()` gives the closed tab's `sessionId` and URL, which is
  a high-confidence match for the Ctrl+Shift+T case specifically. Fall back to URL + recency
  matching otherwise.
- `chrome.tabs.onCreated` carries `openerTabId` — use it to inherit rather than adopt when
  the new tab was spawned from a live one (see the cross-tab edges task).

**Scope**

- Rename `GraphNode.tabId` → `lineageId`; update `toFlow.ts`'s visibility filter and
  `FlowNodeData`.
- Messages still carry `tabId` (that is what the popup and content script know); the
  background resolves it to a lineage at the edge.
- Re-add the `sessions` permission, which is currently declared but unused.

**Subsumes the old "clean up per-tab state on `chrome.tabs.onRemoved`" task**, which
proposed a `forgetTab(tabId)` clearing all four tabId-keyed maps. That answer is wrong under
this design: on tab close we want to *keep* the lineage and drop only the `tabToLineage`
entry. Still true from that task: `tabToNavigationSession` is dead code — declared in
`Graph`, never read or written. Delete it and the `NavigationSession` type.

---

## High

### Jump to an existing node instead of minting a duplicate

**This is the core-value task.** The `A → B → A → C`, jump-back-to-`B` case is the reason the
extension exists, and today performing it degrades the graph.

**What goes wrong now**

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

**Fix: push the existing nodeId onto the stack, mint nothing**

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

**Fix the stale broadcast while here (pre-existing bug).** `SET_ACTIVE_NODE` currently does:

```ts
chrome.tabs.update({ url: activeNode.url })
sendMessage({ type: MESSAGE_TYPES.GRAPH_UPDATED, tabId })   // fires immediately
```

That broadcast goes out synchronously, well before the commit, so an open popup refetches
and renders the *pre-jump* state. And `onCommitted` broadcasts nothing at all, so the popup
never learns the jump landed — nor does it learn about any organic navigation. Under this
change the mutation moves entirely to commit time, which makes the staleness worse unless
the broadcast moves there too. Broadcast `GRAPH_UPDATED` from `onCommitted` after the graph
mutates.

**Deletions.** Net negative lines: `GraphNode.revisitOf`, the dashed-edge branch in
`toFlow.ts`, `REVISIT_EDGE_KIND` in `constants/index.ts`, and the exclusion for it in
`toLayout.ts`.

**Explicitly out of scope: URL identity for organic navigation.** Repeat visits reached by
actually navigating still mint new nodes. That is honest (the user really did navigate
there again), it avoids any URL-equality heuristic, and SPAs with stable URLs would collapse
wrongly under one. Revisit after two weeks of real use.

**Not blocked on lineage ids.** The collapse is scoped per `tabId` today; the lineage task
only changes what that scope survives. These are orthogonal — do this one first, it is
smaller and it is the core value.

**Prerequisite for:** the branch-jump keyboard shortcut, and the stack overlay below.

---

### Show the Chrome stack as an overlay on the graph

Required to make the task above safe, not polish.

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

**Wiring**

```ts
// GetGraphResponse
{ graph, activeNodeId, backNodeId, forwardNodeId, stackNodeIds }

// FlowNodeData
{ ..., isActive, isBack, isForward, inStack }
```

**Hold off on** drawing a highlighted polyline through `entries` in order. The stack can jump
across the tree (`A → C → B`), so the path would cut across unrelated edges. Ship the badges
first; add the path only if orientation still feels lost.

---

### Cover all `transitionType`s and `transitionQualifier`s

`webNavigation.onCommitted` in `src/background.ts` switches on all 11 `transitionType`
members but six are silent no-ops that should create nodes. The qualifiers matter more than
the types and are barely handled.

**Types**

| transitionType | current | should be |
| --- | --- | --- |
| `link`, `typed` | addNode | correct |
| `form_submit` | no-op | addNode — it is a real history entry |
| `auto_bookmark` | no-op | addNode |
| `generated`, `keyword`, `keyword_generated` | no-op | addNode (omnibox) |
| `start_page` | no-op | addNode as root (session restore) |
| `reload` | no-op | update the existing node in place (title/timestamp), do not add |
| `auto_subframe`, `manual_subframe` | no-op | dead code — the `frameId !== 0` guard already returned |

**Qualifiers**

- `server_redirect` — creates no new history entry. Must *update* the existing node's URL,
  not append a second node.
- `client_redirect` — replaces the entry inside the redirect window. Currently produces a
  duplicate node.
- `from_address_bar` — informational only.
- `forward_back` — see below, this one is a correctness hole.

**The `forward_back` desync (the real bug here)**

`background.ts` returns early on `forward_back` and defers entirely to the content script.
But the Navigation API **does not fire `navigate` for cross-origin traversals** — this is
already documented in the `NAVIGATION_TRAVERSE` comment in `src/types/messages.ts`. So every
cross-origin back/forward silently desyncs the cursor and nothing ever corrects it.

It compounds: `Graph.traverse` does not bounds-check. `entries[newCursor]` can be
`undefined`, that gets written into `tabToActiveNode`, and from then on every
`getActiveNodeId` throws — which hard-locks that tab's graph, since `GET_GRAPH` never
replies once it starts throwing.

**Fix:** reconcile in the background rather than trusting the content script. On a
`forward_back` commit, compare `details.url` against `entries[cursor - 1]` and
`entries[cursor + 1]` and move the cursor to whichever matches. Use the content script's
`internalNodeId`/`direction` as a fast path when it arrives, and bounds-check in `traverse`
unconditionally. Ambiguity when both neighbours share a URL is acceptable; a wrong cursor
that self-corrects beats one that wedges the tab.

**Also missing:** `chrome.webNavigation.onHistoryStateUpdated` and
`onReferenceFragmentUpdated`. These are the background-side equivalent of the content
script's `NAVIGATION_PUSH`, and adopting them is a prerequisite for the permission diet below.

---

### Permission diet — get to zero host permissions

Current manifest asks for `tabs`, `sessions`, `history`, `scripting`, `webNavigation`, and
`host_permissions: ["https://*/*"]`.

**Audit**

- `history` — zero usages anywhere in `src/`. Delete.
- `sessions` — zero usages. Re-add only with the lineage task.
- `tabs` — only `tab.id` is read from `chrome.tabs.query` and `chrome.tabs.update` is called.
  Neither needs the permission. Probably droppable; verify.
- `scripting` — used for the `history.go()` injection. Works under `activeTab`.
- `webNavigation` — genuinely needed, keep.
- `https://*/*` — the expensive one. Triggers Chrome Web Store broad-host review and makes
  the install prompt read *"Read and change all your data on all websites."* For a history
  visualiser that is a conversion killer.

**The content script is what forces the host permission**, and it only does two jobs, both
of which have background-side replacements:

- SPA push detection → `webNavigation.onHistoryStateUpdated` + `onReferenceFragmentUpdated`
- Traverse direction → URL-matching reconciliation on `forward_back` commits (task above)

And `chrome.scripting.executeScript` for the `history.go()` jump works under `activeTab`,
which is granted both by clicking the extension action (opening the popup) and by a
`chrome.commands` keypress — the only two ways a jump is ever initiated.

**Target manifest**

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

---

### Initialise tabs that were already open

Two distinct failures when the extension loads (install, update, or browser start) with tabs
already open.

**(a) No content script in pre-existing tabs.** Declarative `matches` only inject on future
page loads, so SPA push tracking is dead in every already-open tab until it is reloaded.
Bootstrap on `onInstalled` / `onStartup`:

```ts
const tabs = await chrome.tabs.query({ url: "https://*/*" })
await Promise.allSettled(
  tabs.map((t) =>
    chrome.scripting.executeScript({
      target: { tabId: t.id! },
      files: ["navigation-tracker.js"]
    })
  )
)
```

Moot if the permission diet removes the content script entirely — do that first and this
half may disappear.

**(b) `GET_GRAPH` throws for an unknown tab.** `Graph.getActiveNodeId` throws, the exception
escapes the `onMessage` listener, `sendResponse` is never called, and the popup just logs
`"[popup] GET_GRAPH failed"` and renders nothing. Fix: make the unknown-tab path a lazy seed
— `chrome.tabs.get(tabId)` → create a root node from the current URL/title → return it.

**Verify the reported symptom first.** The claim was "link clicks in an unadopted tab don't
add nodes", but that should not be true as written: `webNavigation.onCommitted` is
background-only and `addNode` handles a null parent fine, so a link click ought to create a
root node. If it genuinely does not, that is a third bug and needs isolating before
designing around it.

---

## Medium

### Store `title` and `favIconUrl` on `GraphNode`

`GraphNode` has neither. The graph renders as anonymous 25px dots (`DEFAULT_NODE_DIMENSIONS`)
with a raw URL in a hover tooltip — unreadable past roughly eight nodes, and it is the first
thing any user sees.

Favicon inside the node plus title on hover changes the entire feel of the product. Both are
available on the `chrome.tabs.Tab` object; `favIconUrl` needs `tabs` or host permission, so
sequence this against the permission diet (fall back to `https://www.google.com/s2/favicons`
or a first-letter glyph if the permission is gone).

Prerequisite for graph search.

---

### Cross-tab edges via `openerTabId`

`chrome.tabs.onCreated` hands over `openerTabId` for free. Middle-clicking or
cmd-clicking a link is the single most common branching behaviour during research, and right
now every one of those starts a disconnected tree with no relationship to where it came from.

Highest value-per-line item on the board. Connect the new tab's root node to the opener's
active node as a child, tagged as a cross-tab edge so it can be styled differently (and
possibly excluded from the dagre ranking — note that the `REVISIT_EDGE_KIND` exclusion this
would have mirrored is itself being deleted, so `toLayout.ts` may need the exclusion
mechanism reintroduced for this case).

Depends on lineage ids — the edge should point at a lineage, not a `tabId`.

---

### Branch-jump keyboard shortcut

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

**Prerequisite:** "Jump to an existing node instead of minting a duplicate" — without it,
every shortcut press grows the snake, which is worse than the popup case because the
shortcut is meant to be used constantly.

**Interaction shape: alt-tab, not click-a-graph.** Press once to jump to the most recently
abandoned sibling at the nearest branch point; press again within a second to cycle to the
next. No popup, no clicking. The graph becomes the thing opened when genuinely lost, which
also lowers how much the layout has to carry.

**Use `chrome.commands`, not an injected keydown handler.** It works regardless of page
focus, never fights with a site's own shortcuts (Gmail, Notion), and — important for the
permission diet — **a commands keypress grants `activeTab`**, which is what makes the
`history.go()` injection legal without host permissions. Chrome allows 4 commands with
suggested key bindings; spend two on next/prev sibling.

---

### Popup does not zoom to the active node

Concrete bug, not a tuning issue. `updateGraph` in `src/popup.tsx` calls
`handleTransform(activeNodeId)` synchronously right after `setNodes(...)`. `useNodesState` is
plain React state and the React Flow store only syncs from props on the next render, so
`getNode(activeNodeId)` reads the *previous* store — empty on first load — returns
`undefined`, and `handleTransform` throws. Meanwhile the `fitView` prop on `<ReactFlow>`
performs its own initial fit of the whole graph. That is exactly the observed symptom, and
the `// TODO: why is it not fitting by default` comment above the call.

**Fix:** drive focus from an effect that runs after the store has the nodes.

```ts
const focusRef = useRef<string | null>(null)

useEffect(() => {
  const id = focusRef.current
  if (!id || !nodes.some((n) => n.id === id)) return
  fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2, padding: 0.6 })
  focusRef.current = null
}, [nodes, fitView])
```

**Design notes**

- Do not `throw` on a missing node — no-op. A focus target that vanished is not exceptional.
- Framing a single 25px dot at max zoom looks broken. Frame the **neighbourhood** instead:
  active node + parent + children.
- Add a "focus active" button alongside the existing fit-all. `<Controls>` accepts custom
  children. Focus-active should be the default on open; fit-all stays as the zoom-out escape.

---

### Quick fixes

Small, independent, no design work needed.

- **`chrome.tabs.update` is missing its `tabId`.** `src/background.ts` calls
  `chrome.tabs.update({ url: activeNode.url })` in the `SET_ACTIVE_NODE` jump branch. With
  no tab id that navigates whatever tab is currently active, not `tabId`. Should be
  `chrome.tabs.update(tabId, { url: activeNode.url })`. Folded into the push-existing task if
that lands first, but it is a one-word fix and worth doing immediately either way.
- **`Graph.traverse` needs bounds checking.** `entries[newCursor]` can be `undefined` when
  the cursor walks off either end, and that gets written into `tabToActiveNode`, permanently
  breaking `getActiveNodeId` for that tab. Clamp and bail. (Detailed under the
  `forward_back` task above.)
- **Delete `tabToNavigationSession` and the `NavigationSession` type.** Declared, never read,
  never written.
- **Popup is `w-96 h-96` (384px).** Fine as a peek; add an "open full view" affordance that
  opens the graph in a real tab for anything non-trivial.

---

### Launch readiness

Blocking on publishing to the Chrome Web Store, tracked here so it does not get discovered
during review.

- **Privacy policy.** The extension records every URL visited. CWS requires a posted privacy
  policy for this data class, and the listing must declare it.
- **Lead with local-only.** "100 % local, never leaves your machine, no network requests"
  belongs in the listing headline, not the fine print. It is the main objection a user will
  have, and it happens to be true.
- **Test against `build/chrome-mv3-prod`, not `plasmo dev`.** The dev keepalive hides the
  entire class of service-worker lifetime bugs (see the persistence task). Any pre-release
  smoke test must run on the production bundle.

---

## Low

### `dagreGraph` is module-level and never cleared

`src/graph/toLayout.ts` builds the dagre graph once, at module scope:

```ts
const dagreGraph = new dagre.graphlib.Graph()   // created once, reused forever

export default function applyDagreLayout(nodes, edges, direction = "TB") {
  nodes.forEach((node) => dagreGraph.setNode(node.id, { ... }))
  edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target))
  dagre.layout(dagreGraph)
  ...
}
```

`setNode` and `setEdge` are upserts — they add or overwrite, they never remove. So the
same graph object is mutated on every call and only ever grows. Anything laid out in an
earlier call is still in there during the next one, influencing ranks and positions even
though the popup no longer renders it.

**Not currently visible**, because `getGraph()` always returns every node and nodes are
never deleted, so each call passes a superset of the last and the upserts are idempotent.

**It goes live the moment nodes can disappear between calls**, which is exactly what the
lineage and retention work introduces. It would also surface if `GET_GRAPH` ever filters by
tab in the background instead of sending everything and hiding client-side. Symptom would be
phantom nodes pulling the layout off-centre and `fitView` framing empty space — hard to
diagnose after the fact, which is why it is worth pre-empting.

**Fix:** move construction inside the function so each layout starts clean.

```ts
export default function applyDagreLayout(nodes, edges, direction = "TB") {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction })
  ...
}
```

Do this together with the retention/eviction work, not after it.

---

### Export the graph to JSON

Trivial to implement and a good trust signal — "your data is not locked in" pairs directly
with the local-only privacy pitch. Serialise `nodes` plus lineage stacks, download via a
blob URL from the popup or options page.

Keep it dumb: one button, one file, no format negotiation.

---

### Search across the graph

Fuzzy find by title or URL, jumping the viewport to the match. Becomes genuinely useful once
graphs span hours of browsing.

**Prerequisite:** titles must be stored on `GraphNode` first — searching raw URLs is close to
useless.

---

### Cross-tab / session-level view

A view showing all lineages at once with navigation between them, rather than only the
active tab's tree.

Genuinely useful, but it is an entire second UI surface with its own layout, navigation, and
empty states. Do not let it delay v1 — ship the single-tab view, get users, then decide
whether this is what they actually ask for.

---

### Evaluate Plasmo Ports for the popup's graph subscription

Today the popup learns about graph changes by broadcast-and-refetch: the background
fires `GRAPH_UPDATED` on `chrome.runtime.sendMessage`, and the popup responds by
re-requesting the *entire* graph via `GET_GRAPH`, then re-running dagre layout over
all of it. That is a full round trip and a full relayout for what is often a
one-node change.

Plasmo's Ports API (`background/ports/`, `usePort()` in React) is a better shape for
this: a long-lived connection the background pushes down, rather than a broadcast the
popup reacts to by asking for everything again.

**Why it's filed separately from the messaging type-safety work:** Ports is an
ergonomics and data-flow change, not a typing one. Per Plasmo's own docs,
`sendToBackground<RequestBody, ResponseBody>` still takes both generics manually and
end-to-end request/response type linking is "in progress" — so adopting Plasmo
messaging would not have improved type safety, and does no runtime validation either.

**Scope if picked up**

- Only worth it if the push carries a *delta* (the changed node, the new cursor).
  Pushing "something changed" and refetching everything is what we already have.
- Requires restructuring `src/background.ts` into `src/background/index.ts` plus a
  handler directory, with the `Graph` instance shared as a module singleton.
- The `webNavigation` listeners stay where they are either way.
- Adds `@plasmohq/messaging`.

**Prerequisite:** incremental layout. Right now `applyDagreLayout` re-lays out the
whole graph on every update, so a delta push would save the round trip but not the
relayout — see the `dagreGraph` task above, which touches the same code.

**Caveat:** a long-lived port also keeps the service worker alive while the popup is open,
which masks worker-lifetime bugs the same way the dev keepalive does. Not a reason to avoid
it, but do not let it substitute for real persistence.

---

## Explicitly out of scope

BACKLOGGED — acknowledged and intentionally deferred.

- **Sync / multi-device / sharing.** Different product, and it breaks the local-only privacy
  pitch that is the main selling point.
