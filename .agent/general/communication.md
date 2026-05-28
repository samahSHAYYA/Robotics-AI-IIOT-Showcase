# General Guidelines

## Contract Intent

This document is our working contract for collaboration in this project. It
defines how we communicate, execute, review, and refine outputs.

## Shared Working Model

- Work in fast iteration cycles with concrete improvements each round.
- Execute directly when the request is actionable.
- Keep updates short, clear, and result-focused.
- Treat quality as progressive: refine until production-grade.
- If output quality is not final, continue improving without waiting to be
  reminded.
- Avoid repeating fixed mistakes once identified.

## Communication Agreement

- Use direct, professional language with no fluff.
- Confirm understanding through actions, not long explanations.
- Raise risks or blockers early with practical options.
- Keep recommendations specific and prioritized.
- Continuously learn and model the user's decision style, quality bar, and
  priorities.
- Act as a translation layer from user intent to team-ready guidance.
- Communicate user intent to team members at a higher professional level
  without losing original priorities.
- When the user corrects a fact, assumption, or abbreviation, treat it as
  authoritative and apply it immediately across affected files and future
  outputs.

## Quality Bar

- Default output level is showcase/portfolio grade.
- Prioritize clarity, consistency, and credibility.
- Every deliverable must be reviewable and maintainable.
- Avoid placeholders unless explicitly requested.
- Self-check before handing work back.
- For simulation architecture, prefer explicit runtime entities over ambiguous
  aggregates when realism is required.

## Mandatory reading

Before any task, the agent must read and follow:

- `AGENTS.md` — project entry point, conventions, essential commands, quality
  contract
- `.agent/general/communication.md` — this file. Working contract,
  communication rules, execution model
- `.agent/general/coding.md` — language-specific rules, naming, architecture
  constraints
- `.agent/general/error-handling.md` — error taxonomy, retry policy, graceful
  degradation, recovery
- `.agent/local/logging.md` — structured event schema, Redis Streams, trace
  propagation
- `.agent/local/ui-ux.md` — design system, palette, SVG rules
- `.agent/local/file-access.md` — file tier definitions
- `.agent/local/deployment.md` — Docker Compose, env config, container build,
  networking
- `.agent/skills/` — reusable skills invoked via the skill tool
- `.agent/knowledge/` — architecture decisions, domain concepts, glossary
  (read-only reference)
- `access-permissions.json` — machine-readable access rules

These files define the project's boundary. The agent must not make assumptions
that contradict them. If a rule is ambiguous, ask before acting.

`DEVELOPER.md` is for human developers. The agent may read it for context but
must not modify it.

## Updating preferences

- New preferences or precedents discovered during a session must be added to
  the relevant `.agent/` file before the task is marked complete. Addition
  requires explicit approval from the user. Silent adoption without
  documentation is not allowed.
- Do not add or modify `.agent/` rules during the task itself unless the user
  explicitly instructs it. Collect the new preference, complete the task, then
  propose the update.

## Priority Order

- Clarity and ease of use with reduced mental load.
- Aesthetics.

High-priority information must be immediately visible and easy to understand
before decorative or secondary elements.

## Visual and UX Preferences

- Maintain strong spacing, hierarchy, and alignment.
- Preserve balanced layouts with equal visual padding when requested.
- Prevent overlap and text overflow in all UI/SVG entities.
- Keep high readability and low eye strain.
- Apply semantic colors consistently (success, warning, danger, info).
- Favor industrial realism and polished aesthetics over generic templates.

## Documentation Preferences

- Use relative instructions (project-root context) in docs.
- Avoid machine-specific absolute paths in guidance.
- Keep docs concise, actionable, and implementation-oriented.
- Keep a blank line after Markdown headers.
- Maintain naming exactly as requested.
- Keep line length readable (prefer <= 120 chars; tighter where practical).
- For coding style specifics (naming, guards, Python call spacing), follow
  `coding.md` as the source of truth.
- For C++ layout decisions, default to: class-per-file (`*.hpp` + `*.cpp`) with
  umbrella headers for grouped domains.

## Execution Rules

- Perform requested changes directly when scope is clear.
- Validate outputs after edits (visual correctness, consistency, references).
- Do proactive QA: check beyond the explicitly highlighted issue.
- Do not revert user changes unless explicitly asked.
- For non-critical changes, proceed autonomously without waiting for approval.
- For critical, security-related, or potentially fatal-impact changes, request
  approval first.
- When approval is needed, present pros vs cons in a very simple format.

## Code Stack Roadmap

- Primary stack: Python and C/C++.
- Core technical focus: ROS2, AI/ML, automation, and IIoT systems.
- Likely secondary stack: TypeScript where appropriate.
- Java is optional and not a default choice unless explicitly confirmed later.
- Python baseline: 3.12 unless a specific compatibility constraint requires
  3.11.
- ROS2 baseline: Jazzy Jalisco (latest LTS stable) unless project constraints
  require otherwise.

## Definition of Done (All Work Types)

A task is done only when all conditions are met:

- It supplies what is needed by the request.
- The result is clear and easy to use.
- The result is easy to maintain and extend.
- The result performs well for its intended use.
- The implementation follows agreed best practices.

## Delivery Review Checklist (Always Apply)

For each delivery, self-check and report against:

- Correctness.
- Clarity.
- Ease of maintenance.
- Performance.
- Simplicity over unnecessary complexity.

Delivery format preference:

- Very brief summary.
- Checklist.
- Warnings or future considerations (if any).

## Living Update Rule

- Revisit this contract before major changes.
- Add new preferences as soon as they become explicit.
- Keep rules specific, testable, and easy to follow.
- If a new rule conflicts with an old one, note the superseding rule clearly.
