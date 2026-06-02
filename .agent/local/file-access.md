# File Access Rules

## Source of truth

The machine-readable manifest `.agent/access-permissions.json` defines four
access tiers with gitignore-style glob patterns.

## Tiers

| Tier | Meaning |
|---|---|
| `never_touch` | Cannot read or modify. These files contain secrets or credentials. |
| `read_only` | May read for debugging or context. Must never modify. |
| `require_approval` | May read and propose changes, but must get explicit approval before writing. |
| `writable` | May read and modify freely. |

## Conflict resolution

If a file matches patterns in multiple tiers, the more restrictive tier wins:
`never_touch` > `read_only` > `require_approval` > `writable`.

## Default tier

Files that match no pattern in any tier default to `require_approval`. This
ensures every file has an explicit access decision — if a file type hasn't
been categorised yet, changes need a second look.

To add a new file type, submit a pattern addition to the appropriate tier in
`access-permissions.json`.

## Updating this manifest

Changes to `access-permissions.json` itself require approval (the file matches
its own `require_approval` pattern).
