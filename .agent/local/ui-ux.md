# UI-UX Guidelines

## Purpose

This document defines the UI/UX working rules I must follow when handling
design, SVG, frontend layout, and visual content tasks in this project.

## Priority Order (Mandatory)

- Clarity and ease of use.
- Visual relief and reduced mental load.
- Aesthetics.

If tradeoffs occur, decisions must follow this order. High-priority
information must be visible first, understood quickly, and never buried
by decorative elements.

## Core UX Principles

- Surface critical information first.
- Keep interaction and layout predictable.
- Minimize cognitive friction and scanning effort.
- Prefer explicit labels over ambiguous icons.
- Keep UI behavior consistent across screens.

## Readability and Visual Comfort

- Use high text-to-background contrast for all important content.
- Avoid dense blocks of text inside small cards.
- Use concise wording and clear hierarchy.
- Ensure comfortable spacing between key elements.
- Avoid aggressive saturation and visual noise.

## Information Hierarchy

- Primary: status, safety, alerts, key KPIs, and current system state.
- Secondary: trends, supporting telemetry, diagnostics.
- Tertiary: advanced details and historical context.

Rules:

- Primary information must be visible in one quick scan.
- Secondary information must not compete visually with primary information.
- Tertiary information should be progressively disclosed.

## Layout and Spacing Discipline

- Keep balanced and intentional composition.
- Maintain equal or optically equal horizontal padding where required.
- Keep consistent spacing rhythm using a base unit system.
- Align related elements to common guides.
- Avoid crowded layouts; preserve breathing room.

## Text Fit and Overflow Safety (Non-Negotiable)

- No text may overflow outside its container (button, card, chip, chart area,
  label box).
- No text may overlap other elements unless intentionally designed and still
  readable.
- If content is long, shorten copy, wrap lines, or resize container.
- Validate at practical viewing scale before completion.

## Color and Semantics

Use semantic colors intentionally and consistently:

- Green: healthy, success, resume.
- Orange: warning, maintenance, caution.
- Red: critical, stop, fault.
- Blue tones: information, neutral data context.
- Do not use semantic danger/warning colors as decoration.
- Pair state color with explicit text labels.

## Industrial Context Rules

- Maintain operational realism for robotics, automation, and IIoT scenes.
- Show states and controls as if used in real operations.
- Keep safety elements visible and visually distinct.
- Favor practical dashboard language over marketing language.

## Interaction and Control Clarity

- Keep destructive actions clearly separated from routine actions.
- Use obvious labels for control actions (`Stop`, `Resume`, `Acknowledge`,
  `Reset`).
- Place high-risk actions in protected positions and styles.
- Reduce accidental action risk through visual separation.

## SVG and Frontend Execution Rules

- Preserve clean structure and valid markup.
- Keep typography, spacing, and component styling consistent.
- Reuse established visual patterns before introducing new ones.
- Ensure responsive behavior when applicable (desktop/mobile).
- Maintain consistency with project palettes and component language.

## Delivery QA Checklist (Always Include)

- Correctness: UI content and states are accurate.
- Clarity: critical information is immediately understandable.
- Maintainability: structure and style are easy to update.
- Performance: visuals are not unnecessarily heavy or complex.
- Simplicity: design follows KISS and avoids avoidable complexity.
- Overflow: no text escapes any visual container.
- Overlap: no unintended collisions between elements.

## Delivery Format Preference

For each UI/UX delivery:

- Very brief summary.
- Checklist results.
- Warnings or future considerations.

## Living Update Rule

- Update this file as your preferences evolve.
- Add rules in clear, testable language.
- New explicit preference supersedes older conflicting guidance.
