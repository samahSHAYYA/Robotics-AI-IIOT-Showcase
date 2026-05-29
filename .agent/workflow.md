# Workflow

## Pipeline

Every task flows through these stages:

```
User Request
     │
     ▼
┌─────────────┐
│ Orchestrator │  Analyze, plan, assign
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Developer   │  Implement + self-check
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     QA      │  Review conventions, security + run tests, validate criteria
└──────┬──────┘
       │ pass
       ▼
┌─────────────┐
│ Orchestrator │  Final review → deliver to user
└─────────────┘
```

## Rejection paths

- **QA fail (review)** → back to Developer with review notes.
- **QA fail (tests)** → back to Orchestrator. Orchestrator decides:
  return to Developer with bug report, or adjust criteria.
- **Double reject** (QA rejects the same task twice) → escalate
  to user with options.

## Handoff summary format

Every handoff between roles must include a summary. Format:

```markdown
## Handoff: {role} → {next role}

**Task**: {short description}

**Status**: {pass | fail | blocked}

**Details**:
- {change summary / findings}
- {any open questions or decisions needed}

**Time**: {round-trip count if applicable}
```

## Parallel work

If a task has independent sub-tasks, Orchestrator may split them and run
Developer in parallel for each sub-task. QA always runs on the merged result.

## Emergencies

- For urgent hotfixes (production-blocking issues only), Orchestrator may
  fast-track:

  ```
  Developer → QA (expedited) → Orchestrator
  ```

- QA still checks — just prioritised. Never skip QA entirely.
