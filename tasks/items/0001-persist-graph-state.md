---
id: 0001
title: Persist graph state across service worker restarts
status: backlog
priority: critical
area: background
tags: [mv3, storage, data-loss]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

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

## Verify before and after

Add an instance marker at the top of `src/background.ts`:

```ts
const INSTANCE = crypto.randomUUID()
console.log("[background] worker start", INSTANCE)
```

Load `build/chrome-mv3-prod` unpacked, browse, idle ~40s, reopen the popup. A changed
`INSTANCE` means the worker restarted. `chrome://extensions` also shows
"service worker (inactive)" when it is dead.

## Scope

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

## Decide now, not later

- **Retention.** `nodes` is append-only and never truncates by design, so it grows without
  bound. Needs a cap — per-lineage node limit, or TTL eviction of lineages with no live tab.
  Pick one before persistence ships, because storage makes unbounded growth permanent.
- **`session` vs `local`.** `session` means the tree dies on browser restart, which
  undercuts the core "never lose what B was" pitch. `local` means persisting a full
  browsing history to disk — a real privacy commitment needing explicit disclosure in the
  store listing. Ship `session` as the default, expose `local` as an opt-in setting with a
  retention window.

## Related

Blocks [[0002]] (stale tab keys only matter once state survives), and the
`chrome.tabs.onRemoved` cleanup is folded into that task. Retention/eviction makes [[0016]]
a live bug rather than a latent one. An opt-in `local` setting is the likely first reason to
re-add `src/options.tsx` (see [[0022]]).
