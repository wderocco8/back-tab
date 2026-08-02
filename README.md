This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Viewing logs

This extension runs across three separate contexts (content script, background service worker, and extension UI pages), and each one logs to a different DevTools window.

### Content script (`src/contents/navigation-tracker.ts`)

Runs inside the actual web page, so its `console.log`s go to that page's own console, not the extension's.

1. Open any `https://` page the content script matches.
2. Right-click the page → **Inspect** (or press F12) → **Console** tab.
3. Logs from `navigation-tracker.ts` appear alongside the page's own output. Use the console's context dropdown (top-left of the Console panel) to isolate the content script's context if the page is noisy.

### Background service worker (`src/background.ts`)

Has no visible window of its own, so it needs a dedicated inspector:

1. Go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Find this extension's card and click **service worker** under "Inspect views".

MV3 service workers go idle and terminate after a short period of inactivity — if the "service worker" link is grayed out or gone, trigger any extension event (e.g. navigate a tab) to wake it back up. The extension card's **Errors** button also captures uncaught exceptions here even when the console wasn't open at the time.

### Extension UI pages (popup, newtab, options)

Each of these is a real page/tab and can be inspected like any normal webpage:

- **Popup** (`popup.tsx`): open the popup, then right-click inside it → **Inspect** (or right-click the toolbar icon → "Inspect popup"). Opening DevTools keeps the popup pinned open instead of closing on blur.
- **New tab** (`newtab.tsx`): open a new tab as usual, then F12 / right-click → **Inspect**.
- **Options** (`options.tsx`): opens in its own tab (`open_in_tab: true` in the manifest), so F12 / right-click → **Inspect** works directly.

### All-in-one error view

`chrome://extensions` → this extension's card → **Errors** aggregates uncaught errors from the background and content scripts in one place, which is often faster than hunting through separate DevTools windows.

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
