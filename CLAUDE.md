# CLAUDE.md

Chrome MV3 extension (Plasmo + React + TypeScript) that records browsing history as an
append-only tree instead of a linear stack, and lets you jump back to branches the back
button has discarded.

## Start here

**Work is tracked in [`tasks/`](tasks/), one Markdown file per task.** Read
[`tasks/INDEX.md`](tasks/INDEX.md) first — it is the board, grouped into In progress /
Ready / Blocked, with a dependency graph. [`tasks/README.md`](tasks/README.md) has the
conventions.

Task bodies carry the reasoning, not just the ask: the trace that proves the bug, the
approach already chosen, and what was explicitly ruled out. Read the whole task file before
starting one — most design questions are already answered in it.

- `INDEX.md` is **generated**. Never edit it. Run `pnpm tasks` after changing any item.
- Adding or finishing a task means editing frontmatter in `tasks/items/NNNN-*.md`, then
  regenerating. Commit the item and the index together.
- Ids are permanent. Cross-reference between tasks with a relative link —
  `[0006](0006-permission-diet.md)`, siblings in `tasks/items/`. `pnpm tasks:check` fails on a
  dangling link, a dependency that doesn't exist, or a link whose id and filename disagree.

Architecture, the data model, and the non-obvious design decisions are in
[README.md](README.md). Per-context logging and dev-mode gotchas are in
[CONTRIBUTING.md](CONTRIBUTING.md). Don't duplicate either here.

## Commands

```bash
pnpm dev          # plasmo dev → build/chrome-mv3-dev
pnpm build        # production bundle → build/chrome-mv3-prod
pnpm typecheck    # tsc --noEmit
pnpm tasks        # regenerate tasks/INDEX.md
pnpm tasks:check  # validate tasks + fail if INDEX.md is stale
```

## Traps

NOTE: I think this is inaccurate (stemmed from using Arc browser previously). 
**`plasmo dev` makes the service worker immortal.** The dev bundle injects a 24s
`getPlatformInfo` keepalive (`setInterval` ×2 in
`build/chrome-mv3-dev/static/background/index.js`; zero in the prod bundle). Any `chrome.*`
call resets MV3's idle timer, so the worker never dies in development and dies constantly
for real users. **Every worker-lifetime or persistence claim must be verified against
`build/chrome-mv3-prod`, loaded unpacked.** This is the root of task
[`0001`](tasks/items/0001-persist-graph-state.md), and it silently invalidates dev testing
for a whole class of bugs.

**`pnpm typecheck` is already failing.** `src/components/ui/button.tsx:51`, a Radix
`asChild`/`LegacyRef` mismatch, pre-existing and unrelated to the graph code. Don't chase it
unless that is the task; do check that you haven't _added_ errors.

**Plasmo generates manifest entries from file presence.** Creating `src/options.tsx` or
`src/newtab.tsx` silently adds `options_ui` / `chrome_url_overrides.newtab` to the built
manifest — a newtab override triggers a Chrome keep-or-revert prompt and a stricter Web
Store review category. Three such scaffold files once shipped this way; see
[`0022`](tasks/items/0022-remove-plasmo-boilerplate.md).

**Permissions are being actively reduced, not added.** The manifest currently asks for
`host_permissions: ["https://*/*"]`, which reads as _"Read and change all your data on all
websites"_ at install. Task [`0006`](tasks/items/0006-permission-diet.md) is a deliberate
push to zero host permissions. Do not add a permission to make something easier without
saying so explicitly and checking it against that task.

## Conventions

- `pnpm` only. Prettier with `@ianvs/prettier-plugin-sort-imports` — run it on files you
  touch; don't reformat files you didn't.
- Node tooling scripts are `.mts`, run natively by Node ≥22.6 with no build step.
  `tsconfig.json` includes `./**/*.mts` so they are covered by `pnpm typecheck`.
- `src/types/messages.ts` is the single source for the cross-context message contract.
  Listeners take `unknown` and narrow through `parseMessage` — annotating a listener
  parameter as a message type is an unchecked assertion about IPC data.
- Comments explain _why_, at the density already in `src/graph/index.ts` and
  `src/background.ts`. Match it; don't narrate what the code says.
