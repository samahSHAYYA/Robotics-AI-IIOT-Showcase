# Coding Guidelines

## Purpose

This document defines our coding agreement for architecture, implementation,
review, and maintenance across languages.

## Stack Priority for This Project

- **Primary languages:** Python, C, and C++.
- **Primary domains:** ROS2, AI/ML, industrial automation, and IIoT.
- **Secondary language:** TypeScript when web/UI or tooling needs justify it.
  Java is optional and only used when explicitly selected for a module.
- **Python baseline:** 3.12 by default; use 3.11 only when a dependency or
  platform constraint requires it.
- **ROS2 baseline:** Jazzy Jalisco (LTS).
- **Default implementation preference:** modern C++ for
  control/runtime-critical paths when relevant and performant. Python is
  allowed by exception for AI/ML workflows or when no practical C++ alternative
  exists.

## Core Engineering Rules

- Optimize for readability, correctness, and long-term maintainability.
- Prefer simple designs before complex abstractions.
- Keep modules cohesive and interfaces explicit.
- Write code that is easy to test and easy to debug.
- Avoid premature optimization; optimize based on measured bottlenecks.
- Prefer self-explanatory code over clever or complex solutions.
- Favor clarity and performance before architectural novelty.

## Design Principles (Mandatory)

- Apply SOLID principles where relevant.
- Avoid duplication by default (DRY).
- Keep solutions as simple as possible (KISS).

## Code Quality Baseline

- Use clear naming for variables, functions, classes, and files.
- Avoid trailing underscore naming style in identifiers and include guards.
- Keep functions focused; one responsibility per function.
- Limit side effects and hidden state.
- Handle errors explicitly and consistently.
- Remove dead code and commented-out logic.
- Add concise comments only where intent is not obvious from code.
- Keep line length manageable: hard limit 120 characters, prefer shorter lines
  (around 80 to 100) where practical for readability.
- Ensure every text/code file ends with exactly one trailing newline at
  end-of-file.

## Project Structure and Architecture

- Separate domain logic from infrastructure and UI layers.
- Centralize shared utilities; avoid duplicate logic.
- Keep configuration externalized and environment-aware.
- Use dependency boundaries that support testing and replacement.
- Under `src/`, each solution or service must have its own dedicated folder.
- Do not place multi-service implementation files directly at `src/` root.
- Each `src/<service>` must be independently runnable with a clear local
  startup path.
- For C/C++ files, use lowercase snake_case filenames (for example
  `temperature_sensor.hpp`, `temperature_sensor.cpp`).

## Testing and Validation

- Add or update tests for every meaningful behavior change.
- Prefer deterministic tests over timing-sensitive tests.
- Cover normal flow, edge cases, and failure cases.
- Validate integration points (APIs, files, queues, devices) explicitly.

## Security and Reliability

- Validate all external input.
- Never hardcode secrets or credentials.
- Apply least-privilege access principles.
- Fail safely with clear, actionable errors.
- Add logging with enough context for diagnosis.

## Performance and Observability

- Measure before and after optimization work.
- Track latency, throughput, and error rates for critical paths.
- Use structured logs and consistent severity levels.
- Add metrics around device, network, and pipeline health when applicable.

## Git and Review Practices

- Keep commits focused and logically scoped.
- Write clear commit messages explaining intent.
- Prefer small, reviewable pull requests.
- Include impact, risk, and test notes in reviews.

## Delivery Self-Review (Mandatory)

Before marking work complete, validate:
- Correctness.
- Clarity.
- Ease of maintenance.
- Performance.
- Compliance with SOLID, DRY, and KISS.

## Language-Specific Guidelines

### C and C++

- Favor modern C++ features when using C++ (RAII, smart pointers,STL).
- Minimize manual memory management and raw ownership.
- Use `const` correctness and explicit types for clarity.
- Avoid undefined behavior and unchecked pointer arithmetic.
- For embedded/robotics code, document timing and hardware assumptions.
- For control-loop, orchestration, and safety-critical runtime paths, prefer
  modern C++ as the primary implementation language.
- Prefer include guards over `#pragma once` for conservative portability in
  this project.
- Prefer class-per-file organization: each concrete class in its own `.hpp` +
  `.cpp` pair, keep umbrella headers (for example `types.hpp`) as aggregation
  and shared-model entry points.
- Keep implementation out of headers where possible; use declarations in
  `.hpp` and definitions in `.cpp`.
- **Exception:** template classes and template methods stay in headers (or
  require explicit instantiation strategy).
- Template formatting style: use `template<typename ...>` (no
  space before `<`).
- For sensor modeling, prefer a class-based design with: sensor name and
  unique identifier, SI-unit canonical storage, explicit conversion methods to
  allowed operational/display units.
- For sensor telemetry metadata: set UTC timestamp automatically at
  initialization and on every measurement update, expose zoned timestamp
  formatting through a dedicated API (timezone input explicit).
- Background mock generation is allowed for simulation sensors, but: thread
  ownership must be explicit, lifecycle must be deterministic (`start`/`stop`
  and clean shutdown), avoid hidden copying for thread-owning runtime objects.
- Keep conversion scope practical: implement only units required by current
  workflows.

### Python

- Follow PEP 8 and keep modules small and focused.
- For this project style, format keyword arguments with spaces around `=`:
  preferred: `f(a = b)` not preferred: `f(a=b)`
- Use type hints for public functions and data models.
- Use `-> None` on functions that return None explicitly; all functions must
  have a return type annotation.
- Prefer single-quoted strings (`'text'`) over double-quoted strings (`"text"`)
  for all Python string literals.
- Prefer single return when it keeps the function simple. If avoiding early
  returns causes deep nesting, early returns are the better choice.
- Balance readability over purity.
- When single return fits, use the walrus operator pattern `if ok := (expr):`
  to combine assignment and condition into a single-exit flow.
- Use Python 3.10+ `match` / `case` instead of `if` / `elif` chains when
  dispatching on a single scalar value.
- Prefer `try` / `except` / `else` over early return for import guards and
  resource availability checks.
- Organise imports in three groups separated by blank lines:
  1. **Builtins** — `import X` first, blank line, then `from X import Y`.
  2. **Third-party** — same `import`-then-`from` pattern.
  3. **Project** — same pattern, ordered most distant to closest
     (`from parent.child import ...` before `from child import ...`).
- Include a module-level docstring on every entry-point script with `@author`,
  `@date`, and `@description` tags.
- Use `"""` (triple double-quotes) for all Python docstrings.
- Use `@return <name>: <description>` in docstrings to annotate return values.
  Omit `@return` entirely when the function returns `None`.
- When `@return <name>` is used, assign the return value to a variable bearing
  the same name before returning (e.g., `header = ...` then `return header`).
- If a function raises an exception, document it with
  `@raises ExceptionType: Description of when it occurs.`
- In function docstrings, start with a plain sentence using a verb
  (`Validates...`, `Formats...`, `Assembles...`) instead of `@description:`.
  Use `@param` and `@return` for structured parameter/return documentation.
- Use exactly one blank line between top-level function definitions.
- Group all non-public (`_`-prefixed) functions at the end of the module,
  preceded by a `# Protected methods.` comment.
- Prefer clarity over cleverness. For functions returning multi-line strings,
  build the result incrementally with concatenation rather than deeply nested
  return expressions. Optimise for readability, not brevity.
- Prefer virtual environments and pinned dependency versions.
- Use exceptions intentionally; avoid silent `except` blocks.
- Keep scripts reproducible and avoid implicit global state.
- Target the specified Python version while keeping code ready for future
  upgrades.
- Do not use deprecated or soon-to-be-deprecated APIs. If deprecation risk
  exists, notify and provide a safer alternative.
- Prefer language/library features with stable forward-compatibility to reduce
  upgrade friction.
- Use Python mainly for AI/ML workflows, tooling, and non-control support paths
  unless there is a strong justification.
- For runtime control/orchestration logic, use Python only when modern C++ is
  not a viable option.
- For packages management, use uv with pyproject.toml
  dependency groups.

### Java

- Use clear package boundaries and layered architecture.
- Prefer composition over inheritance unless inheritance is justified.
- Use immutable objects for shared/state-sensitive data when feasible.
- Handle nullability explicitly and avoid ambiguous APIs.
- Keep Spring or framework annotations controlled and readable.

### JavaScript and TypeScript

- Prefer TypeScript for non-trivial application logic.
- Enforce strict typing and avoid `any` unless justified.
- Keep components/functions small and predictable.
- Validate API contracts at boundaries.
- Separate presentation logic from business logic.

### SQL and Data

- Design schemas for integrity first, then performance.
- Use explicit migrations; never rely on ad-hoc manual drift.
- Index based on query patterns and verify with explain plans.
- Use transactions for multi-step state changes.
- Keep destructive data operations protected and auditable.

### Robotics, AI/ML, and IIoT Notes

- Keep control-loop logic deterministic and latency-aware.
- Separate online inference paths from offline training pipelines.
- Version datasets, models, and feature definitions.
- Track model performance drift and retraining triggers.
- Design for intermittent connectivity in edge/IIoT systems.
- Make safety states explicit (safe stop, degraded mode, recovery).

## Dependency and Library Policy

- Prefer in-house implementation when the problem is simple and low-risk.
- Do not introduce heavy libraries when lightweight options are sufficient.
- When a library is needed, prioritize: reliability and active maintenance,
  credibility and adoption quality, security posture and known vulnerabilities,
  compatibility with our stack and long-term maintainability.
- Flag dependency risks explicitly before adoption when risk is non-trivial.

## Done Criteria for Code Changes

- Code compiles/runs and follows these guidelines.
- Tests relevant to the change are updated and passing.
- Error handling and logging are adequate.
- Documentation is updated when behavior/config changes.
- No unresolved TODOs are left without explicit agreement.

## Markdown conventions

- Every sentence ends with a period. No exceptions. Wrap at 79 chars max —
  break at part of the sentence (any word). Do not break lines before 79 except
  in list items, table cells, code blocks, or blockquotes where readability
  demands it.

## Living Update Rule

- Update this document as we align on new standards.
- Keep rules actionable and unambiguous.
- Preserve consistency with `communication.md`.
