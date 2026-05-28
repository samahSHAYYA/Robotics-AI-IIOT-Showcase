# UI-UX Guidelines

## 1. Purpose

This document defines the visual and interaction system for the Industrial
Humanoid Robotics Smart Factory showcase. It is intended for UI/UX designers,
graphic designers, and frontend engineers working on consistent, high-
credibility industrial interfaces.

## 2. Core Design Principles

Clarity over decoration: every visual element must support comprehension.
Operational credibility: interfaces should feel like real industrial control
  software.
Semantic consistency: state colors and interaction patterns must mean the same
  thing everywhere.
Data-first hierarchy: metrics, alerts, and actions are primary.
Low cognitive load: avoid visual noise, reduce eye tension, and keep scanning
  effortless.

## 3. Color System

### Base palette

Deep background navy: `#091A2A` <span style="display:inline-
  block;width:14px;height:14px;background:#091A2A;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Surface blue: `#12314C` <span style="display:inline-
  block;width:14px;height:14px;background:#12314C;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Elevated card blue: `#184161` <span style="display:inline-
  block;width:14px;height:14px;background:#184161;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Border steel blue: `#4D7EA8` <span style="display:inline-
  block;width:14px;height:14px;background:#4D7EA8;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Primary data blue: `#3AA7FF` <span style="display:inline-
  block;width:14px;height:14px;background:#3AA7FF;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Secondary data cyan: `#44E0D0` <span style="display:inline-
  block;width:14px;height:14px;background:#44E0D0;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Primary text: `#EAF3FF` <span style="display:inline-
  block;width:14px;height:14px;background:#EAF3FF;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Secondary text: `#B7D0E6` <span style="display:inline-
  block;width:14px;height:14px;background:#B7D0E6;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>

### Semantic colors

Success and healthy: `#22C55E` <span style="display:inline-
  block;width:14px;height:14px;background:#22C55E;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Warning and maintenance: `#F5A623` <span style="display:inline-
  block;width:14px;height:14px;background:#F5A623;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>
Critical and stop: `#FF4D4F` <span style="display:inline-
  block;width:14px;height:14px;background:#FF4D4F;border:1px solid
  #666;vertical-align:middle;margin-left:6px;"></span>

Rules:
Never use red or orange for decoration only.
Reserve semantic colors for real state information.
Pair color with explicit label text (`Critical`, `Warning`, `Healthy`).

## 4. Typography

Primary family: `Segoe UI, Arial, sans-serif`
Technical and command text: `Consolas, monospace`

Recommended scale:
Hero H1: 44 to 56 px, weight 700
Section heading: 22 to 30 px, weight 700
Card title: 16 to 20 px, weight 600 to 700
Body and labels: 14 to 17 px, weight 600
Dense metadata: 12 to 14 px, weight 600

## 5. Spacing, Geometry, and Layout

Base spacing unit: 8 px
Standard spacing: 16, 24, 32 px
Shell corner radius: 14 to 20 px
Card corner radius: 10 to 14 px
Control corner radius: 6 to 10 px
Border thickness: 1 to 2 px with `#4D7EA8`

Preferred composition for key screens:
Context zone (robot/process)
Data zone (KPI, trends, telemetry)
Action zone (alerts, controls, commands)

## 6. Text Fit and Overflow Safety (Mandatory)

Text must stay inside its visual container at target canvas size.
Do not place long single-line text in narrow controls.
For command or technical strings inside compact fields:
use 12 to 13 px monospace,
or shorten labels,
or increase container width.
For long KPI or policy text:
shorten wording,
split into multiple lines,
or move details to adjacent detail panel.
Before delivery, manually inspect each SVG at 100% zoom for clipping and
  overlap.

## 7. Data Visualization

Primary trend line: `#3AA7FF`
Secondary trend line: `#22C55E` or `#44E0D0`
Include at least one baseline/grid cue for context.
Keep chart labels short and state-oriented.

## 8. Industrial UI Component Set

Minimum required components on operations views:
KPI cards with value and state
Alert board with critical/warning/healthy buckets
Device/fleet status list
Command console with explicit action affordances
Safety control card with stop/resume and status

## 9. UX Recommendations

Prioritize critical actions near eye path (upper-right or right action rail).
Separate monitoring from control actions to reduce accidental operations.
Use progressive disclosure for advanced diagnostics.
Keep destructive actions visually distinct and confirmation-protected.
Display system state first, then trend, then action.
Ensure keyboard and screen-reader friendly structure when implemented in real
  UI.

## 10. Accessibility and Eye Comfort

Keep high contrast between text and background.
Avoid low-contrast muted text for actionable content.
Use consistent heading hierarchy for fast scanning.
Avoid dense paragraphs inside cards; keep concise lines.
Limit simultaneous high-saturation accents to avoid eye fatigue.

## 11. Motion Guidance (UI implementation)

Motion must clarify transitions, not decorate.
Suggested timings:
micro interactions: 120 to 180 ms
panel transitions: 220 to 320 ms
Prefer subtle ease-out transitions over bouncy motion.

## 12. Quality Checklist Before Handoff

Color usage follows semantic rules.
Text is readable and fits all containers.
No overlapping text with charts/cards/buttons.
Alert and safety information is visible within one quick scan.
Layout and typography are consistent across all screens.
SVG/XML validity is preserved (escaped special characters where needed).

## 13. Handoff Protocol

Start every new screen from this token set and hierarchy.
Reuse existing component patterns before creating new variants.
Document any new token (color, spacing, component) before adoption.
Validate text fit and semantics as final QA step before merge.
