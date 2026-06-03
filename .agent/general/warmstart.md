# WarmStart.md Update Rule

Keep `WarmStart.md` (root) in sync with the project state. It is the
single-entry cold-start reference for every agent session. If it is stale,
agents waste time rediscovering the project.

## First-time creation

If `WarmStart.md` does not exist at the project root (fresh clone), create it
before any task work. Build the initial version by reading:

1. `AGENTS.md` — project identity, structure, essential commands.
2. `.agent/general/communication.md` — tone, quality bar.
3. `.agent/general/coding.md` — language rules, conventions.
4. `.agent/general/error-handling.md` — error taxonomy.
5. `.agent/local/` (all files) — UI-UX, logging, deploy, file-access.
6. `.agent/workflow.md` — pipeline, handoffs, rejection paths.
7. `.agent/knowledge/architecture.md` — architecture summary.
8. `.agent/tasks.json` — current sprint and task state.

Synthesise these into the 12-section structure that `WarmStart.md` follows.
This is a one-time bootstrap — subsequent sessions update it incrementally
per the checklist below.

## Trigger

Update `WarmStart.md` **immediately after** every task completion, right
before the final handoff to the user.

"Task completion" means:
- A feature/fix is implemented, tested, reviewed, accepted, committed, and
  pushed.
- A sprint is closed.
- Project structure, architecture, or conventions change.

## Checklist

Each update touches the relevant sections below. Skip sections that haven't
changed.

### Section 8 — Current Sprint & Tasks

Always update after every task:

- `**Sprint X completed**: {summary of what was done}`
- If new tasks remain, list the next pending one.
- `**Recent work**:` — add a bullet for each significant change. Keep the
  list trimmed to ~5 most relevant entries. Archive older entries into a
  `**Earlier work**:` note or remove them once they're no longer fresh
  context.
- `**Current branch**:` — update if changed.
- `**Open bugs**:` — update if new bugs registered or old ones fixed.

### Section 2 — Quick File Navigation (must-read table)

If a new `.agent/general/*.md` or `.agent/local/*.md` rule file was created,
add it to the must-read table with a one-line purpose.

### Section 4 — Implementation Status

- New real implementations → move from "Mock" to "Real" or add to "Real".
- New mock implementations → add to "Mock".
- Completed pending features → move from "Pending" to "Real".
- Only update when a task changes the implementation status of a service or
  feature.

### Section 5 — Key Conventions

Only update if a task introduced or changed a language rule, error class,
logging schema, event taxonomy, UI priority, or semantic color.

### Section 10 — Project Structure Map

Only update if a task added, removed, or renamed a top-level directory or
service.

### Section 11 — Where to Find Things Fast

Only update if a task created a new significant directory or module that
agents commonly need to locate.

## Format rules

- Every sentence ends with a period.
- Wrap at 79 characters.
- Remove stale entries; don't accumulate clutter.
- Keep bullet items concise — one line, one fact.
- Cross-reference new rule files by their path (e.g.
  `.agent/general/warmstart.md`), not by title alone.

## Guardrails

- This rule IS in `.agent/general/` — it is itself subject to the same
  process. If this rule changes, WarmStart.md section 2 must be updated to
  reference it.
- Do NOT update WarmStart.md mid-task — only at task completion, so the
  file reflects a consistent checkpoint.
- If a task spans multiple commits, update WarmStart.md once at the end
  covering the full scope.
