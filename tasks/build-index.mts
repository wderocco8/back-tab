#!/usr/bin/env node
/**
 * Regenerates INDEX.md from the frontmatter of every file in tasks/items/.
 *
 * INDEX.md is derived - never edit it by hand. Task files are the source of truth.
 * Also validates: filename/id agreement, known status/priority, resolvable
 * `depends_on` and `[[wikilink]]` targets. Exits non-zero on any problem so it
 * can be wired into CI.
 *
 *   node tasks/build-index.mts           regenerate
 *   node tasks/build-index.mts --check   validate + fail if INDEX.md is stale
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = dirname(fileURLToPath(import.meta.url))
const ITEMS = join(ROOT, "items")
const INDEX = join(ROOT, "INDEX.md")

const STATUSES = ["active", "backlog", "done", "wont-do"] as const
const PRIORITIES = ["critical", "high", "medium", "low"] as const

type Status = (typeof STATUSES)[number]
type Priority = (typeof PRIORITIES)[number]

/** A task file that has passed validation. Everything upstream is `RawFields`. */
interface Task {
  id: string
  title: string
  status: Status
  priority: Priority
  area: string
  tags: string[]
  depends_on: string[]
  completed?: string
  file: string
  body: string
}

/** Frontmatter as parsed - every field still unverified. */
type RawFields = Record<string, string | string[] | undefined>

const STATUS_LABEL: Record<Status, string> = {
  active: "In progress",
  backlog: "Backlog",
  done: "Done",
  "wont-do": "Won't do"
}

const errors: string[] = []

/** Minimal frontmatter reader: scalars and inline `[a, b]` arrays only. */
function parseFrontmatter(
  raw: string,
  file: string
): (RawFields & { body: string }) | null {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(raw)
  if (!match) {
    errors.push(`${file}: missing frontmatter block`)
    return null
  }
  const fields: RawFields = {}
  for (const line of match[1].split("\n")) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const [, key, rawValue] = kv
    const value = rawValue.trim()
    fields[key] =
      value.startsWith("[") && value.endsWith("]")
        ? value
            .slice(1, -1)
            .split(",")
            .map((v) => v.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean)
        : value.replace(/^["']|["']$/g, "")
  }
  return { ...fields, body: raw.slice(match[0].length) }
}

const str = (v: string | string[] | undefined): string =>
  typeof v === "string" ? v : ""
const list = (v: string | string[] | undefined): string[] =>
  Array.isArray(v) ? v : []

/** Narrows `RawFields` to `Task`, recording every reason it failed to. */
function toTask(
  fields: RawFields & { body: string },
  file: string
): Task | null {
  const id = str(fields.id)
  const title = str(fields.title)
  const status = str(fields.status)
  const priority = str(fields.priority)
  const before = errors.length

  const idFromName = file.slice(0, 4)
  if (id !== idFromName)
    errors.push(
      `${file}: frontmatter id "${id}" != filename prefix "${idFromName}"`
    )
  if (!title) errors.push(`${file}: missing title`)
  if (!STATUSES.includes(status as Status))
    errors.push(`${file}: unknown status "${status}"`)
  if (!PRIORITIES.includes(priority as Priority))
    errors.push(`${file}: unknown priority "${priority}"`)
  if (status === "done" && !str(fields.completed))
    errors.push(`${file}: status done without a completed date`)
  if (list(fields.depends_on).includes(id))
    errors.push(`${file}: depends on itself`)

  if (errors.length > before) return null

  return {
    id,
    title,
    status: status as Status,
    priority: priority as Priority,
    area: str(fields.area) || "—",
    tags: list(fields.tags),
    depends_on: list(fields.depends_on),
    completed: str(fields.completed) || undefined,
    file,
    body: fields.body
  }
}

const files = readdirSync(ITEMS)
  .filter((f) => f.endsWith(".md"))
  .sort()

const tasks: Task[] = []
for (const file of files) {
  const fields = parseFrontmatter(readFileSync(join(ITEMS, file), "utf8"), file)
  if (!fields) continue
  const task = toTask(fields, file)
  if (task) tasks.push(task)
}

const byId = new Map(tasks.map((t) => [t.id, t]))

for (const task of tasks) {
  for (const dep of task.depends_on) {
    if (!byId.has(dep))
      errors.push(`${task.file}: depends_on "${dep}" does not exist`)
  }
  // Cross-references are real relative links, so they must resolve AND the id in
  // the link text must name the file it points at - a slug rename that updates
  // only one half is exactly what this catches.
  for (const [, text, target] of task.body.matchAll(
    /\[(\d{4})\]\((\d{4}-[a-z0-9-]+\.md)\)/g
  )) {
    const referenced = byId.get(text)
    if (!referenced) {
      errors.push(`${task.file}: link [${text}] does not exist`)
    } else if (referenced.file !== target) {
      errors.push(
        `${task.file}: link [${text}](${target}) should point at ${referenced.file}`
      )
    }
  }
  for (const [, ref] of task.body.matchAll(/\[\[(\d{4})\]\]/g)) {
    errors.push(
      `${task.file}: [[${ref}]] is not a link - write [${ref}](${byId.get(ref)?.file ?? `${ref}-<slug>.md`})`
    )
  }
}

if (errors.length) {
  console.error(
    "tasks: validation failed\n" + errors.map((e) => `  - ${e}`).join("\n")
  )
  process.exit(1)
}

const open = (t: Task): boolean =>
  t.status === "backlog" || t.status === "active"
const link = (t: Task): string => `[${t.id}](items/${t.file})`
const ready = (t: Task): boolean =>
  open(t) && t.depends_on.every((d) => byId.get(d)?.status === "done")

const rows = (items: Task[]): string =>
  items
    .map((t) => {
      const deps = t.depends_on.length
        ? t.depends_on.map((d) => `\`${d}\``).join(" ")
        : "—"
      return `| ${link(t)} | ${t.title} | ${t.priority} | ${t.area} | ${deps} |`
    })
    .join("\n")

const section = (heading: string, note: string, items: Task[]): string =>
  items.length
    ? `## ${heading} (${items.length})\n\n${note ? note + "\n\n" : ""}| id | task | priority | area | blocked by |\n| --- | --- | --- | --- | --- |\n${rows(items)}\n`
    : ""

const order = (t: Task): number =>
  PRIORITIES.indexOf(t.priority) * 10000 + Number(t.id)
const sorted = (fn: (t: Task) => boolean): Task[] =>
  tasks.filter(fn).sort((a, b) => order(a) - order(b))
const pick = (status: Status): Task[] => sorted((t) => t.status === status)

// Only tasks that participate in a dependency edge are worth drawing.
const edges = tasks
  .filter((t) => t.status !== "wont-do")
  .flatMap((t) => t.depends_on.map((d) => `  ${d} --> ${t.id}`))
const connected = new Set(edges.flatMap((e) => e.trim().split(" --> ")))

const out =
  `<!-- Generated by tasks/build-index.mts - do not edit. Run \`pnpm tasks\` after changing any item. -->

# Task index

${tasks.filter(open).length} open · ${pick("done").length} done · updated ${new Date().toISOString().slice(0, 10)}

${section(STATUS_LABEL.active, "", pick("active"))}
${section(
  "Ready",
  "No unfinished dependencies - pick from the top.",
  sorted((t) => t.status === "backlog" && ready(t))
)}
${section(
  "Blocked",
  "Waiting on the dependency in the last column.",
  sorted((t) => t.status === "backlog" && !ready(t))
)}
${section(STATUS_LABEL.done, "", pick("done"))}
${section(STATUS_LABEL["wont-do"], "", pick("wont-do"))}
## Dependency graph

\`\`\`mermaid
graph LR
${[...connected]
  .sort()
  .map((id) => `  ${id}["${id} ${byId.get(id)!.title.replace(/"/g, "'")}"]`)
  .join("\n")}
${edges.join("\n")}
\`\`\`
`.replace(/\n{3,}/g, "\n\n")

if (process.argv.includes("--check")) {
  let current = ""
  try {
    current = readFileSync(INDEX, "utf8")
  } catch {
    current = ""
  }
  // Ignore the generated-on date so --check doesn't fail purely on the clock.
  const strip = (s: string): string =>
    s.replace(/updated \d{4}-\d{2}-\d{2}/, "")
  if (strip(current) !== strip(out)) {
    console.error("tasks: INDEX.md is stale - run `pnpm tasks`")
    process.exit(1)
  }
  console.log(`tasks: ${tasks.length} items valid, INDEX.md up to date`)
} else {
  writeFileSync(INDEX, out)
  console.log(
    `tasks: wrote INDEX.md (${tasks.length} items, ${tasks.filter(open).length} open)`
  )
}
