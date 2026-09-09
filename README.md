# backtab

A Chrome extension that reconstructs your browsing session as a directed graph you can
navigate, instead of the linear stack the back button gives you.

> **Status — IN-PROGRESS.** Not on the Chrome Web Store; it runs as an
> unpacked development build. Graph construction, rendering, and traversal work. Nothing
> persists across service-worker restarts, and several navigation types are still
> uncaptured. See [Limitations](#limitations) and [`tasks/backlog.md`](tasks/backlog.md).

<!-- ==========================================================================
     SCREENSHOT PLACEHOLDER — replace the line below with a GIF of the popup:
     open a few links, press back, branch off in a new direction, then click
     the stranded node to jump back into it. That one image explains the
     project faster than everything under it.
     ========================================================================== -->

_(screenshot / GIF of the graph view goes here)_

---

## The problem

A browser tab's session history is a stack with a cursor. Navigating from anywhere other
than the tip **truncates** everything ahead of it:

| Action | Session stack | Cursor |
| --- | --- | --- |
| visit A, click through to B | `[A, B]` | B |
| press back | `[A, B]` | A |
| click through to C | `[A, C]` | C |

B is now unreachable. No gesture returns you to it, and the browser keeps no record that
the branch ever existed. Any nonlinear session — comparing two docs pages, backing out of
a dead end, following a citation and returning — quietly destroys part of itself.

backtab records every visit as a node in an append-only tree that never truncates, while
separately tracking what the browser's own back/forward buttons will actually do. The
popup draws the tree; clicking a node navigates there.

## How it works

Three MV3 execution contexts, each able to see things the others can't, coordinating over
a typed message bus.

| Context | Source | Role |
| --- | --- | --- |
| Content script | [`contents/navigation-tracker.ts`](src/contents/navigation-tracker.ts) | Runs in the page at `document_start`. Watches the Navigation API for same-document (SPA) navigations and back/forward traversals. |
| Service worker | [`background.ts`](src/background.ts) | Owns all state. Listens to `chrome.webNavigation.onCommitted` for full-document loads and routes every message. |
| Extension UI | [`popup.tsx`](src/popup.tsx) | Fetches the graph, lays it out, renders it, and sends navigation intents back. |

The split is forced by the platform: the content script can reach `window.navigation` but
not `chrome.tabs`; the service worker is the reverse. Neither sees every navigation alone.

```
     ┌────────────────────────────────┐
     │  page  (isolated world)        │
     │  navigation-tracker.ts         │
     └───────────────┬────────────────┘
                     │  NAVIGATION_PUSH
                     │  NAVIGATION_TRAVERSE
                     ▼
     ┌────────────────────────────────┐
     │  service worker                │
     │  background.ts                 │
     │                                │
     │  chrome.webNavigation          │
     │  Graph                         │
     │    ├─ nodes        append-only │
     │    └─ tabToStack   stack mirror│
     └───────────────┬────────────────┘
                     │  GET_GRAPH  ▲  GRAPH_UPDATED
                     │  SET_ACTIVE_NODE
                     ▼
     ┌────────────────────────────────┐
     │  popup.tsx                     │
     │  React Flow + dagre            │
     └────────────────────────────────┘
```

Jumping to a node closes the loop back to the page: the worker injects `history.go(delta)`
with `chrome.scripting.executeScript`, and the resulting event comes back up through the
content script.

### Data model

Two structures kept in step ([`graph/index.ts`](src/graph/index.ts),
[`types/graph.ts`](src/types/graph.ts)):

- **`nodes`** — an append-only tree of every visit. Never truncates, so abandoned branches
  survive. This is what gets drawn.
- **`tabToStack`** — a per-tab mirror of Chrome's session history, replicating its
  truncation semantics exactly (`entries.slice(0, cursor + 1)` on push). This is what makes
  it knowable whether a node is still reachable by a real traversal.

The invariant tying them together: walking `parent` from a tab's active node yields exactly
that tab's stack up to the cursor, reversed. If the two disagree, something is wrong.

## Running it

```bash
pnpm install
pnpm dev
```

Then load the unpacked build:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select `build/chrome-mv3-dev` from this repo.
4. Visit a few `https://` pages, following links and pressing back.
5. Click the extension's toolbar icon to open the graph.

The service worker holds all state, so it is worth knowing that MV3 terminates it after
roughly 30 seconds idle and the graph resets with it. Browse continuously while trying it.

```bash
pnpm build       # production bundle in build/chrome-mv3-prod
pnpm typecheck
```

Each of the three contexts logs to a different DevTools window —
[CONTRIBUTING.md](CONTRIBUTING.md) covers where to find each, plus dev-mode gotchas.

## Implementation notes

**Two sources of navigation truth that must not double-count.**
`webNavigation.onCommitted` never fires for same-document SPA route changes, so those are
caught in the page and forwarded. But an ordinary cross-document link click fires *both* a
`navigate` event and `onCommitted`. The content script filters on
`event.destination.sameDocument`, and that single condition is what keeps every normal link
click from producing two nodes.

**Jumping to a node without corrupting the history it was reconstructed from.**
The naive approach — `chrome.tabs.update({ url })` — *appends* a history entry. Jump back
five nodes that way and the forward button is dead, because you are now at the tip of a
stack five entries longer than before. So `SET_ACTIVE_NODE` first asks whether the target is
still in the tab's mirrored stack. If it is, the worker computes a delta and performs a real
traversal via injected `history.go(delta)` — no entry appended, forward history intact. Only
when Chrome has genuinely discarded the entry does it fall back to a fresh navigation, and
the node created that way is tagged `revisitOf` and drawn as a dashed edge back to the
original, so the graph stays honest about what happened.

**Telling an extension-initiated traversal from a user's back button.**
`history.go()` produces the same `navigate` event the back button does — and exactly one
event no matter how many entries it crossed, so naively applying a ±1 cursor step on top of
the jump overshoots. Before injecting, the worker writes the target node ID onto a `window`
property in the content script's isolated world. The tracker reads and clears it on the next
`navigate` event and echoes it back, letting the worker distinguish *"I caused this, verify
where it landed"* from *"the user did this, move the cursor."* Chrome exposes no first-class
way to attribute a traversal; the isolated world is shared between `executeScript` and the
declarative content script, which makes it a usable side channel.

**Identity by node, not by URL.**
`tabToStack` holds node IDs rather than URLs, so visiting the same URL twice produces two
distinct nodes at two distinct stack positions and the extension can tell which one you are
on. Matching on URLs — the obvious first implementation — collapses them and makes traversal
ambiguous the moment a session revisits anything.

**Typed messaging across three contexts.**
[`types/messages.ts`](src/types/messages.ts) defines one mapping from message type to request
and response payload; the discriminated union and the response-type lookup are both derived
from it, so a handler cannot read a field the sender never sends. Listeners type their
parameter as `unknown` and narrow through [`parseMessage`](src/lib/messaging.ts) — annotating
it as a message type would be an unchecked assertion about data arriving over IPC, and would
narrow the discriminant *before* the runtime check that validates it.

## Project layout

```
src/
  background.ts               service worker: webNavigation listener + message router
  contents/
    navigation-tracker.ts     in-page Navigation API observer
  graph/
    index.ts                  Graph: node tree + per-tab stack mirror
    toFlow.ts                 graph → React Flow nodes and edges
    toLayout.ts               dagre layout pass
  lib/messaging.ts            parseMessage / sendMessage
  types/
    graph.ts                  GraphNode, TabStack, FlowNode
    messages.ts               message contract
  popup.tsx                   React Flow graph view
tasks/                        working backlog
```

Built with [Plasmo](https://docs.plasmo.com/), TypeScript,
[@xyflow/react](https://reactflow.dev/), and [dagre](https://github.com/dagrejs/dagre).

## Limitations

Known and current — these are real, not hypothetical.

- **Nothing persists.** The graph lives in service-worker memory, and MV3 terminates idle
  workers after ~30 seconds, discarding the session. Persisting to `chrome.storage.session`
  is the obvious fix and is not yet implemented. This is the largest gap between the current
  state and something usable daily.
- **Navigation capture is partial.** Only `link` and `typed` transitions create nodes. Form
  submissions, bookmarks, and keyword searches are recognised and deliberately ignored,
  pending a decision on how they should appear in a graph.
- **Cross-origin back/forward is not tracked.** The Navigation API fires no `navigate` event
  when a traversal's destination is a different origin, so the content script never sees it
  and the cursor goes stale. Same-origin traversal works.
- **No tab lifecycle handling.** Per-tab state is never cleaned up on tab close, and
  `GraphNode.tabId` goes stale when a tab is restored or duplicated.
- **Layout is recomputed wholesale** on every update, and the dagre graph instance is
  module-level and accumulates entries across calls.
