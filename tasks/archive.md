# Archive

Completed tasks, most recent first.

---

## 2026-09-12

### Removed shipped Plasmo boilerplate

Three untouched scaffold files were reaching users via Plasmo's file-presence manifest
generation. Found when testing on stock Chrome — Arc replaces the new tab page with its own
UI, so the newtab override was invisible during development.

| removed | manifest entry it generated | user-visible effect |
| --- | --- | --- |
| `src/newtab.tsx` | `chrome_url_overrides.newtab` | hijacked every new tab with "Welcome to your Plasmo Extension!" |
| `src/options.tsx` | `options_ui` | same boilerplate on the extension's Options entry |
| `src/contents/plasmo.ts` | 3rd content script on `https://www.plasmo.com/*` | set `document.body.style.background = "pink"` on plasmo.com |

Nothing imported any of them. Rebuilt manifest confirms all three entries gone and
`content_scripts` down to the single `https://*/*` navigation tracker.

The newtab override mattered beyond the cosmetics: Chrome shows a "an extension changed your
new tab page" keep-or-revert prompt, and CWS treats newtab overrides as a distinct
single-purpose category — shipping one from a history visualiser invites review friction.

Re-add `src/options.tsx` when there is a real setting to put in it (the `session` vs `local`
persistence choice is the likely first one).

Also updated `README.md`: dropped the newtab/options logging instructions, added a note that
Plasmo generates manifest entries from file presence, and documented that Chrome will not
terminate the service worker while its inspector is attached.

