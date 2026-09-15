---
id: 0011
title: Popup does not zoom to the active node
status: backlog
priority: medium
area: popup
tags: [bug, react-flow]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

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

## Design notes

- Do not `throw` on a missing node — no-op. A focus target that vanished is not exceptional.
- Framing a single 25px dot at max zoom looks broken. Frame the **neighbourhood** instead:
  active node + parent + children.
- Add a "focus active" button alongside the existing fit-all. `<Controls>` accepts custom
  children. Focus-active should be the default on open; fit-all stays as the zoom-out escape.
