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

## Updating this manifest

Changes to `access-permissions.json` itself require approval (the file matches
its own `require_approval` pattern).
