# Tasks

Self-contained task tracker for this repo. One file per task, plain Markdown, no service, no
account. The repo is the single source of truth — a local coding agent reads and edits these
files with the same tools it uses for `src/`.

## Layout

| path | what it is |
| --- | --- |
| `items/NNNN-slug.md` | one task, frontmatter + freeform body. **The source of truth.** |
| `INDEX.md` | generated board view. Never edit by hand. |
| `_template.md` | copy this to start a new task |
| `build-index.mts` | regenerates and validates `INDEX.md` |

```bash
pnpm tasks           # regenerate INDEX.md
pnpm tasks:check     # validate only; fails if INDEX.md is stale (CI)
```

## Frontmatter

```yaml
---
id: 0007                  # 4 digits, must match the filename prefix
title: Short imperative or symptom
status: backlog           # backlog | active | done | wont-do
priority: high            # critical | high | medium | low
area: background          # background | graph | popup | manifest | release | architecture | product
tags: [bug, mv3]          # free-form, optional
depends_on: [0006]        # ids that must be done first; [] if none
created: 2026-09-15
updated: 2026-09-15
completed: 2026-09-12     # required when status is done
---
```

`blocks` is **not** a field — the generator derives reverse edges from `depends_on`. Record
each dependency exactly once.

## Conventions

- **Status lives in frontmatter, not in a directory.** Files never move, so links, git
  history and `git blame` stay intact for the whole life of a task.
- **Ids are permanent.** Never renumber, never reuse. New task = next free number. A
  filename slug may be reworded; the `NNNN` prefix may not.
- **Cross-reference with `[[0006]]`.** The generator fails the build on a link to a
  nonexistent id, so refactors can't silently orphan a reference. Prefer a link over prose
  like "the task above" — there is no "above" once tasks are separate files.
- **Bodies are freeform.** Keep the analysis: the reason these files are worth more than
  Linear tickets is that they carry the evidence — code snippets, file paths, the trace that
  proves the bug, and what was deliberately ruled out. Write for the agent that picks this up
  cold in three weeks.
- **Record decisions in the task, not in chat.** "Explicitly out of scope" and "decide now,
  not later" sections are load-bearing; they stop the same debate reopening.
- **Split rather than bucket.** A "quick fixes" list hides work from the index and from
  dependency tracking. Four one-paragraph files beat one four-bullet file.

## Workflow

1. **New task** — `cp _template.md items/0023-my-task.md`, fill in frontmatter, write the body.
2. **Start work** — set `status: active`, bump `updated`. Keep at most one or two active.
3. **Finish** — set `status: done`, add `completed:`, and edit the body into a record of what
   actually shipped and why (see `items/0022-*` for the shape). Do not delete it; the archive
   is the project's memory.
4. **Abandon** — `status: wont-do` with a line on why, so it is not re-proposed.
5. `pnpm tasks` before committing.

Every step ends with regenerating the index. Commit `INDEX.md` along with the item change.

## Why local files and not Linear / Plane / GitHub Issues

Deliberate trade. Issue trackers win on notifications, multi-person assignment and reporting;
none of which a solo project needs. Local files win on the thing that matters here: an agent
can read the whole board, follow a dependency chain, and open the exact source file a task
names, in one tool call with no auth. Tasks version alongside the code they describe, so a
branch can carry both the fix and the task edit.

Revisit if outside contributors or users start filing bugs — at that point mirror this
directory out to GitHub Issues (frontmatter maps cleanly onto title/labels/state), but keep
these files as the source of truth.
