# Backlog

Prioritized list of upcoming work. Move items to `active.md` when starting, `archive.md` when done.

---


## Medium

### Clean up per-tab state on `chrome.tabs.onRemoved`

`Graph` keeps four `tabId`-keyed maps and nothing ever removes entries for closed tabs:

- `tabToActiveNode`
- `tabToStack`
- `tabToPendingRevisit`
- `tabToNavigationSession` — dead code, declared but never read or written; delete it rather than clean it up

Add a `chrome.tabs.onRemoved` listener in `src/background.ts` calling a new `Graph.forgetTab(tabId)` that clears all of them.

**Notes**

- Low urgency today: the MV3 service worker terminates when idle and takes the maps with it. This becomes real once the graph is persisted to `chrome.storage.session`, where stale tab keys would survive.
- Decide what happens to the *nodes* of a closed tab. They live in `nodes` keyed by nodeId and are filtered for display by `node.tabId` in `toFlow.ts`, so today they linger and render hidden. Keeping them is probably right — history should outlive the tab — but then the tabId-based visibility filter needs rethinking.
- Related: `GraphNode.tabId` goes stale when a tab is restored or duplicated, since Chrome assigns a new tabId.

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
`chrome.tabs.onRemoved` cleanup task introduces. It would also surface if `GET_GRAPH`
ever filters by tab in the background instead of sending everything and hiding client-side.
Symptom would be phantom nodes pulling the layout off-centre and `fitView` framing empty
space — hard to diagnose after the fact, which is why it's worth pre-empting.

**Fix:** move construction inside the function so each layout starts clean.

```ts
export default function applyDagreLayout(nodes, edges, direction = "TB") {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction })
  ...
}
```

Do this together with the `onRemoved` cleanup task above, not after it.

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
