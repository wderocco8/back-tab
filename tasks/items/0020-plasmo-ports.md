---
id: 0020
title: Evaluate Plasmo Ports for the popup's graph subscription
status: backlog
priority: low
area: architecture
tags: [performance, plasmo]
depends_on: [0016]
created: 2026-09-15
updated: 2026-09-15
---

Today the popup learns about graph changes by broadcast-and-refetch: the background fires
`GRAPH_UPDATED` on `chrome.runtime.sendMessage`, and the popup responds by re-requesting the
*entire* graph via `GET_GRAPH`, then re-running dagre layout over all of it. That is a full
round trip and a full relayout for what is often a one-node change.

Plasmo's Ports API (`background/ports/`, `usePort()` in React) is a better shape for this: a
long-lived connection the background pushes down, rather than a broadcast the popup reacts to
by asking for everything again.

**Why it's filed separately from the messaging type-safety work:** Ports is an ergonomics and
data-flow change, not a typing one. Per Plasmo's own docs, `sendToBackground<RequestBody,
ResponseBody>` still takes both generics manually and end-to-end request/response type
linking is "in progress" — so adopting Plasmo messaging would not have improved type safety,
and does no runtime validation either.

## Scope if picked up

- Only worth it if the push carries a *delta* (the changed node, the new cursor). Pushing
  "something changed" and refetching everything is what we already have.
- Requires restructuring `src/background.ts` into `src/background/index.ts` plus a handler
  directory, with the `Graph` instance shared as a module singleton.
- The `webNavigation` listeners stay where they are either way.
- Adds `@plasmohq/messaging`.

**Prerequisite:** incremental layout. Right now `applyDagreLayout` re-lays out the whole
graph on every update, so a delta push would save the round trip but not the relayout — see
[[0016]], which touches the same code.

**Caveat:** a long-lived port also keeps the service worker alive while the popup is open,
which masks worker-lifetime bugs the same way the dev keepalive does. Not a reason to avoid
it, but do not let it substitute for real persistence ([[0001]]).
