---
id: 0005
title: onCommitted — pages without a content script, and transition metadata
status: backlog
priority: high
area: background
tags: [correctness, webnavigation]
depends_on: [0023]
created: 2026-09-15
updated: 2026-10-04
---

> **Rescoped 2026-10-04.** This task originally made `onCommitted` the source of truth for
> traversal, reconciling `forward_back` commits by matching URLs against neighbouring stack
> entries. That is ambiguous in the `A → B → A` case and was rejected as the core mechanism.
> [0023](0023-track-slots-by-entry-key.md) moves stack mutation for normal pages to the content
> script's `currentEntry.key` report. What is left for `onCommitted` is below.

## 1. Pages no content script can run on

The new-tab page, `chrome://` pages, the Web Store, the PDF viewer, `view-source:`, and
`file://` by default. No key report ever arrives from them.

Today the new-tab page's commit isn't `link` or `typed`, so it never becomes a node: after
`NTP → type A` the stack is `[A]`, back has nowhere to go, and the cursor walks to `-1`. That
is the reported base case.

- **New commit to an unscriptable URL** → `addNode(tabId, url, null)`. A `null`-key entry.
- **`forward_back` commit to an unscriptable URL** → compare `url` with the neighbouring
  entries' nodes (`cursor - 1`, `cursor + 1`). Move only if exactly one matches; otherwise
  log and leave the cursor. Because [0023](0023-track-slots-by-entry-key.md)'s cursor is
  absolute, the next key report from a normal page corrects any mistake here.

**Verify first:** whether `onCommitted` fires at all for `chrome://newtab` / the Google NTP and
other `chrome://` pages, and which URL it reports. Check with the `Graph` ring buffer.

**Decide:** how to classify a URL as unscriptable. A static list (anything outside the content
script's `matches`, plus the Web Store hosts) is deterministic; "no key report within N ms" is
racy. Prefer the list.

## 2. Transition metadata

Once nodes are created from key reports, most of the old type/qualifier table resolves
itself: every new slot is a node, regardless of how it was reached.

| transitionType / qualifier | before | after [0023](0023-track-slots-by-entry-key.md) |
| --- | --- | --- |
| `link`, `typed` | addNode | node from key report |
| `form_submit`, `auto_bookmark`, `generated`, `keyword`, `keyword_generated` | silently dropped | node from key report — fixed for free |
| `reload` | no-op | same key → cursor unchanged — fixed for free |
| `server_redirect` | would duplicate | no new slot; one report from the final URL — fixed for free |
| `client_redirect` | duplicate node | replace: same key, new URL — see 0023's "known key, different URL" decision |
| `start_page` | no-op | session restore — out of scope, see [0002](0002-lineage-ids.md) |
| `auto_subframe`, `manual_subframe` | no-op | dead code — the `frameId !== 0` guard already returned. Delete. |

What remains is *recording* the transition, e.g. a `transition` field on `GraphNode` so the
popup can tell typed from link from form submit. Correlation: `onCommitted` fires before the
new document's content script runs, so stash `lastCommit[tabId] = { url, transitionType,
transitionQualifiers }` and let the `ENTRY` handler consume it when the URL matches. Clear it on
consumption, as `takePendingJump` does, so it can't leak into a later navigation.

## Out of scope / ruled out

- **URL-matching reconciliation for all `forward_back` commits.** Ambiguous whenever both
  neighbours share a URL; see [0023](0023-track-slots-by-entry-key.md).
- **`onHistoryStateUpdated` / `onReferenceFragmentUpdated`.** Were proposed to replace the
  content script's SPA detection. The content script stays and `currententrychange` covers
  same-document navigation with real push/replace/traverse distinction, which these events
  lack.

## Related

Depends on [0023](0023-track-slots-by-entry-key.md). The cursor-wedge failure is
[0012](0012-traverse-bounds-check.md), superseded by 0023.
