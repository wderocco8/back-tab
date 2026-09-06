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
