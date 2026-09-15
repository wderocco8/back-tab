---
id: 0015
title: Launch readiness
status: backlog
priority: medium
area: release
tags: [launch, cws]
depends_on: []
created: 2026-09-15
updated: 2026-09-15
---

Blocking on publishing to the Chrome Web Store, tracked here so it does not get discovered
during review.

- [ ] **Privacy policy.** The extension records every URL visited. CWS requires a posted
      privacy policy for this data class, and the listing must declare it. Scope depends on
      the `session` vs `local` decision in [[0001]].
- [ ] **Lead with local-only.** "100 % local, never leaves your machine, no network requests"
      belongs in the listing headline, not the fine print. It is the main objection a user
      will have, and it happens to be true.
- [ ] **Test against `build/chrome-mv3-prod`, not `plasmo dev`.** The dev keepalive hides the
      entire class of service-worker lifetime bugs (see [[0001]]). Any pre-release smoke test
      must run on the production bundle.

Related: [[0006]] is the other hard launch gate — broad host permissions trigger a slower
review and a scary install prompt.
