# Clean Build Skill

## Description

Removes all CMake build artifacts and Python bytecode caches from the
project, restoring a clean state for a fresh build.

## When to invoke

- Before a clean rebuild (`cmake -B build && cmake --build build`).
- When build outputs are stale or corrupted.
- After switching branches or merging changes with CMake structure
  modifications.
- During the Developer role's pre-build preparation.
- During the Reviewer role's reproducibility checks.

## Build artifacts removed

| Artifact | Location | Reason |
|----------|----------|--------|
| CMake build output | `src/core-platform/cpp/build/` | Full binary, obj, generated dir |
| Python bytecode | `**/__pycache__/` anywhere | Stale bytecode caches |
| Python compiled | `**/*.pyc` anywhere | Stale compiled modules |

## Scripts

### `clean-build.py`

**Usage:**

``` text
py .agent/skills/clean-build/scripts/clean-build.py
```

**What it does:**

- Removes `src/core-platform/cpp/build/` entirely (full binary + config).
- Removes all `**/__pycache__/` directories recursively.
- Removes all `**/*.pyc` files recursively.

**Exit codes:**

- `0` — all artifacts cleaned.
- `1` — error occurred during deletion.

## Procedure

1. Navigate to project root.
2. Run the script: `py .agent/skills/clean-build/scripts/clean-build.py`
3. Confirm that `src/core-platform/cpp/build/` no longer exists.
4. Confirm that no `__pycache__` directories remain.
5. Proceed with fresh `cmake -B build && cmake --build build`.

## Verification checklist

- [ ] `src/core-platform/cpp/build/` directory is gone.
- [ ] No `__pycache__` directories remain.
- [ ] No `.pyc` files remain.
- [ ] Exit code is `0`.

## Role applicability

- **Developer:** Run before clean rebuilds and after branch switches.
- **Reviewer:** Run to verify build reproducibility.
- **QA:** Run during environment setup validation.
