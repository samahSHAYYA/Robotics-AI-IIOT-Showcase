# Python Formatting Skill

## Description

Applies all project Python conventions to `.py` files. The companion script
auto-fixes what it can and reports what needs manual attention.

## When to invoke

- After writing or editing any `.py` file.
- Before committing Python code.
- During the Developer role's self-check before handoff.
- During the Reviewer role's convention checks.

## Rules

### Auto-fixed

| # | Rule | Fix |
|---|------|-----|
| 1 | **Kwarg spacing**: `f(a = b)` (not `f(a=b)`) | Adds spaces around `=` in keyword arguments per the project style |
| 2 | **Trailing whitespace**: no whitespace at line end | Strips trailing whitespace |
| 3 | **Newline at EOF**: file ends with exactly one newline | Ensures trailing newline, deduplicates extra blank lines |

### Checked (must fix manually)

| # | Rule |
|---|------|
| 4 | **Module docstring**: every script starts with `"""` docstring containing `@author`, `@date`, `@description` |
| 5 | **Single-quoted strings**: prefer `'text'` over `"text"` for all Python string literals |
| 6 | **Docstring quotes**: use `"""..."""` (not `'''...'''`) |
| 7 | **Return type annotation**: all functions must have `-> <type>` (use `-> None` for void) |
| 9 | **`@return <name>:`** in docstring with same-name variable (omit if returns `None`) |
| 10 | **`@raises ExceptionType: ...`** in docstring when function raises |
| 11 | **Import groups**: three groups — builtins, third-party, project — separated by blank lines; `import X` before `from X import Y` within each group; project imports ordered most distant to closest |
| 12 | **Protected methods grouped** at module end under `# Protected methods.` |
| 13 | **No trailing underscores** in identifiers (`foo_` not allowed) |
| 14 | **`match` / `case`**: prefer over `if` / `elif` chains dispatching on a scalar |
| 15 | **Walrus `if ok :=`**: prefer for single-exit flow combining assignment + condition |
| 16 | **`try` / `except` / `else`**: prefer over early return for import guards |
| 17 | **`msg` variable**: use for long `raise` strings |
| 18 | **Line length**: hard limit 120 chars, prefer 80–100 |
| 19 | **File ending**: exactly one trailing newline, no trailing blank lines |

## Scripts

### `format-python.py`

**Usage:**

``` text
py .agent/skills/python-fmt/scripts/format-python.py [--check] <file.py> [<file.py> ...]
```

- Without `--check`: auto-fixes rules 1–5, prints report.
- With `--check`: only reports violations (exit 1 if any found).

**Exit codes:**

- `0` — all rules satisfied.
- `1` — violations found (auto-fixed in write mode, reported in check mode).
- `2` — error (file not found, parse error).

## Procedure

1. Run on your modified `.py` files:
   `py .agent/skills/python-fmt/scripts/format-python.py <path>.py`
2. Review the auto-fix diff.
3. Fix remaining violations flagged under "must fix manually".
4. Re-run with `--check` until clean.
5. If the file has a `docs/` or `doc-site/` mirror, sync after editing.

## Verification checklist

- [ ] Auto-fixed rules pass (1–5).
- [ ] All manual-check rules pass (6–19).
- [ ] `format-python.py --check` exits 0 on final version.
- [ ] No functional changes introduced by formatting.

## Role applicability

- **Developer:** Run during self-check before handoff.
- **Reviewer:** Run as the first pass of convention review.
- **QA:** Verify during acceptance criteria check if formatting was part of the
  task.
