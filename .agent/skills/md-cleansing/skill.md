# Markdown Cleansing Skill

## Description

Applies the project's Markdown formatting conventions to any `.md` file. It
ensures consistent wrapping, punctuation, spacing, and list formatting per the
rules below.

## When to invoke

- After writing or editing any `.md` file.
- After merging changes from multiple sources into one `.md` file.
- During the Reviewer role's convention checks.
- During the Developer role's self-check before handoff.

## Rules

| # | Rule | Applies to |
|---|------|------------|
| 1 | Wrap at **79 chars max**. Break at any word boundary. | Prose paragraphs |
| 2 | Don't break before 79 except in **lists, tables, code blocks, blockquotes**. | All |
| 3 | Every sentence ends with **valid punctuation** (`.` / `?` / `!`). | Prose |
| 4 | **No trailing whitespace** on any line. | All |
| 5 | Files end with **exactly one newline** (no extra blank lines). | All |
| 6 | **Blank line after headers** (`##`, `###`, etc.). | All |
| 7 | Fill lines to **~70–79 chars** — don't break early at 55. | Prose paragraphs |
| 8 | Break at **natural boundaries** (commas, conjunctions, prepositions, sentence ends). | Prose paragraphs |
| 9 | Use **`-` bullets** for item lists — not plain text. | Lists |
| 10 | **2-space indent** for bullet continuation lines. | Lists |
| 11 | **Exactly one blank line** between paragraphs. | Prose |
| 12 | **Tables, code blocks, blockquotes** — never rewrapped. | Structural |
| 13 | Keep naming and terminology exactly as requested. | All |

## Scripts

The `scripts/` folder ships automation that implements this procedure:

### `cleanse-md.py`

**Usage:**

``` text
py .agent/skills/md-cleansing/scripts/cleanse-md.py <file.md>
```

**What it does:**

- Rewraps prose paragraphs to 70–79 chars
- Breaks at natural boundaries (sentence ends, commas, conjunctions)
- Removes trailing whitespace on every line
- Ensures exactly one newline at end of file
- Deduplicates consecutive blank lines
- Adds blank line after headers if missing
- Converts plain bullet lists to `-` style
- Leaves tables, code blocks, and blockquotes untouched
- Preserves naming and terminology (never rewords)

**Exit codes:**

- `0` — file was already clean
- `1` — file was modified
- `2` — error (file not found, etc.)

## Procedure

1. Read the target `.md` file.
2. For each section (separated by blank lines), determine if it is:
   - **Prose paragraph** — apply rules 1, 3, 7, 8, 11.
   - **List** — apply rules 2, 9, 10. Each item gets a `-`. Continuation
     lines get 2-space indent.
   - **Table / code block / blockquote** — apply rules 2, 4, 5, 12.
     Do not rewrap content inside.
   - **Header line** — apply rules 4, 5, 6.
3. After all sections are processed, verify:
   - Each line is ≤79 chars (excluding table cells when unavoidable).
   - No trailing whitespace exists.
   - File ends with exactly one newline.
   - No consecutive blank lines (max one between elements).
4. If the file has a `docs/` copy, sync it after editing the source.
5. When running the script, the script handles steps 1–3 automatically.
   Manually verify the final diff if the output looks unexpected.

## Verification checklist

- [ ] All lines ≤79 chars (exempt: table cells, code blocks).
- [ ] No trailing whitespace.
- [ ] File ends with one newline.
- [ ] Every sentence ends with `.`, `?`, or `!`.
- [ ] One blank line after headers.
- [ ] One blank line between paragraphs (never two).
- [ ] Bullet lists use `-` with 2-space continuations.
- [ ] Tables and code blocks untouched.
- [ ] Naming and terminology preserved (no reworded content).

## Role applicability

- **Developer:** Run during self-check before handoff.
- **Reviewer:** Run as the first pass of convention review.
- **QA:** Verify during acceptance criteria check if formatting was part of the
  task.
