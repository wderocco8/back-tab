---
id: 0005
title: Cover all transitionTypes and transitionQualifiers
status: backlog
priority: high
area: background
tags: [correctness, webnavigation]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

`webNavigation.onCommitted` in `src/background.ts` switches on all 11 `transitionType`
members but six are silent no-ops that should create nodes. The qualifiers matter more than
the types and are barely handled.

## Types

| transitionType | current | should be |
| --- | --- | --- |
| `link`, `typed` | addNode | correct |
| `form_submit` | no-op | addNode — it is a real history entry |
| `auto_bookmark` | no-op | addNode |
| `generated`, `keyword`, `keyword_generated` | no-op | addNode (omnibox) |
| `start_page` | no-op | addNode as root (session restore) |
| `reload` | no-op | update the existing node in place (title/timestamp), do not add |
| `auto_subframe`, `manual_subframe` | no-op | dead code — the `frameId !== 0` guard already returned |

## Qualifiers

- `server_redirect` — creates no new history entry. Must *update* the existing node's URL,
  not append a second node.
- `client_redirect` — replaces the entry inside the redirect window. Currently produces a
  duplicate node.
- `from_address_bar` — informational only.
- `forward_back` — see below, this one is a correctness hole.

## The `forward_back` desync (the real bug here)

`background.ts` returns early on `forward_back` and defers entirely to the content script.
But the Navigation API **does not fire `navigate` for cross-origin traversals** — this is
already documented in the `NAVIGATION_TRAVERSE` comment in `src/types/messages.ts`. So every
cross-origin back/forward silently desyncs the cursor and nothing ever corrects it.

It compounds: `Graph.traverse` does not bounds-check (see [0012](0012-traverse-bounds-check.md)).
`entries[newCursor]` can be `undefined`, that gets written into `tabToActiveNode`, and from then on
every `getActiveNodeId` throws — which hard-locks that tab's graph, since `GET_GRAPH` never
replies once it starts throwing.

**Fix:** reconcile in the background rather than trusting the content script. On a
`forward_back` commit, compare `details.url` against `entries[cursor - 1]` and
`entries[cursor + 1]` and move the cursor to whichever matches. Use the content script's
`internalNodeId`/`direction` as a fast path when it arrives, and bounds-check in `traverse`
unconditionally. Ambiguity when both neighbours share a URL is acceptable; a wrong cursor
that self-corrects beats one that wedges the tab.

## Also missing

`chrome.webNavigation.onHistoryStateUpdated` and `onReferenceFragmentUpdated`. These are the
background-side equivalent of the content script's `NAVIGATION_PUSH`, and adopting them is a
prerequisite for [0006](0006-permission-diet.md).
