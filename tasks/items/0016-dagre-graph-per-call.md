---
id: 0016
title: dagreGraph is module-level and never cleared
status: backlog
priority: low
area: graph
tags: [latent-bug, layout]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

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

`setNode` and `setEdge` are upserts — they add or overwrite, they never remove. So the same
graph object is mutated on every call and only ever grows. Anything laid out in an earlier
call is still in there during the next one, influencing ranks and positions even though the
popup no longer renders it.

**Not currently visible**, because `getGraph()` always returns every node and nodes are never
deleted, so each call passes a superset of the last and the upserts are idempotent.

**It goes live the moment nodes can disappear between calls**, which is exactly what the lineage and
retention work ([0001](0001-persist-graph-state.md), [0002](0002-lineage-ids.md)) introduces. It
would also surface if `GET_GRAPH` ever filters by tab in the background instead of sending
everything and hiding client-side. Symptom would be phantom nodes pulling the layout off-centre and
`fitView` framing empty space — hard to diagnose after the fact, which is why it is worth
pre-empting.

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
