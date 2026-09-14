# Contributing

## Setup

```bash
pnpm install
pnpm dev
```

Load `build/chrome-mv3-dev` as an unpacked extension at `chrome://extensions`
(Developer mode → Load unpacked).

```bash
pnpm build       # production bundle in build/chrome-mv3-prod
pnpm typecheck
```

Work is tracked in [`tasks/`](tasks/) — see [`tasks/README.md`](tasks/README.md) for the
board's conventions.

## Viewing logs

This extension runs across three separate contexts (content script, background service
worker, and extension UI pages), and each one logs to a different DevTools window.

### Content script (`src/contents/navigation-tracker.ts`)

Runs inside the actual web page, so its `console.log`s go to that page's own console, not
the extension's.

1. Open any `https://` page the content script matches.
2. Right-click the page → **Inspect** (or press F12) → **Console** tab.
3. Logs from `navigation-tracker.ts` appear alongside the page's own output. Use the
   console's context dropdown (top-left of the Console panel) to isolate the content
   script's context if the page is noisy.

### Background service worker (`src/background.ts`)

Has no visible window of its own, so it needs a dedicated inspector:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Find this extension's card and click **service worker** under "Inspect views".

MV3 service workers go idle and terminate after a short period of inactivity — if the
"service worker" link is grayed out or gone, trigger any extension event (e.g. navigate a
tab) to wake it back up. The extension card's **Errors** button also captures uncaught
exceptions here even when the console wasn't open at the time.

### Extension UI pages (popup, newtab, options)

Each of these is a real page/tab and can be inspected like any normal webpage:

- **Popup** (`popup.tsx`): open the popup, then right-click inside it → **Inspect** (or
  right-click the toolbar icon → "Inspect popup"). Opening DevTools keeps the popup
  pinned open instead of closing on blur.
- **New tab** (`newtab.tsx`): open a new tab as usual, then F12 / right-click →
  **Inspect**.
- **Options** (`options.tsx`): opens in its own tab (`open_in_tab: true` in the
  manifest), so F12 / right-click → **Inspect** works directly.

### All-in-one error view

`chrome://extensions` → this extension's card → **Errors** aggregates uncaught errors
from the background and content scripts in one place, which is often faster than hunting
through separate DevTools windows.

## Gotchas

**Reloading the extension strips content scripts from open tabs.** Every `plasmo dev`
rebuild reloads the extension, and already-open tabs keep running the *previous* build's
content script until they are hard-reloaded — or, if it was removed, none at all. A site
that appears to have stopped being tracked is usually a tab that predates the last save.

**The dev build injects an HMR client into every content script.** Plasmo's live-reload
opens a WebSocket to `ws://localhost:1815` from inside the page, which makes Chrome
attribute a local-network request to whatever site you are on and prompt for permission.
It is absent from `pnpm build` output; test against the production build when that prompt
gets in the way.
