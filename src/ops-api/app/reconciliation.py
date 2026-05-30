"""
@author: generated
@date: 30-May-2026

@description: Digital Twin State Reconciliation engine (Feature 44).
Provides compute_diff, resolve_conflicts, version vector tracking, and
state snapshot generation.
"""

import copy
import logging

from datetime import datetime, timezone
from typing import Any

logger: logging.Logger = logging.getLogger(__name__)

# ── Version vector ──────────────────────────────────────────────────────────
_version: int = 0


def current_version() -> int:
    """Return the current version number."""
    return _version


def bump_version() -> int:
    """Increment and return the new version number."""
    global _version  # noqa: PLW0603
    _version += 1
    return _version


# ── State snapshot ──────────────────────────────────────────────────────────

def build_snapshot(store_snapshot: dict[str, Any]) -> dict[str, Any]:
    """
    Build a digital twin state snapshot from the live telemetry store.

    @param store_snapshot: The current telemetry store snapshot.

    @return snapshot: Dict with version, timestamp, robots, alerts, sensors.
    """
    global _version  # noqa: PLW0603
    _version += 1

    robots = copy.deepcopy(store_snapshot.get('robots', []))
    alerts = copy.deepcopy(store_snapshot.get('alerts', []))
    sensors = {
        'throughput': store_snapshot.get('throughput', 0),
        'defect_rate_pct': store_snapshot.get('defect_rate_pct', 0.0),
        'robot_uptime_pct': store_snapshot.get('robot_uptime_pct', 0.0),
    }

    return {
        'version': _version,
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'robots': robots,
        'alerts': alerts,
        'sensors': sensors,
    }


# ── Diff computation ────────────────────────────────────────────────────────

def _entity_key(entity: dict[str, Any]) -> str:
    """
    Derive a unique key for an entity dict.
    Uses robot_id for robots, or a hash of the message for alerts.
    """
    if 'robot_id' in entity:
        return f"robot:{entity['robot_id']}"
    if 'message' in entity and 'severity' in entity:
        return f"alert:{entity['severity']}:{entity.get('message', '')}"
    # Fallback: use a stable hash of the dict contents
    return str(hash(frozenset(entity.items())))


def _entities_index(entities: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Build a key-indexed dict from a list of entity dicts."""
    return {_entity_key(e): e for e in entities}


def compute_diff(
    local_state: dict[str, Any],
    remote_state: dict[str, Any],
) -> dict[str, Any]:
    """
    Compare local state with a remote state and return a structured diff.

    Diffs are computed for: robots, alerts, and sensors.

    @param local_state: The local digital twin state.
    @param remote_state: A remote/submitted state to compare against.

    @return diff: Dict with added, removed, changed, and conflicts lists.
    """
    added: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    changed: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    # ── Robots diff ──
    local_robots = _entities_index(local_state.get('robots', []))
    remote_robots = _entities_index(remote_state.get('robots', []))

    local_robot_keys = set(local_robots.keys())
    remote_robot_keys = set(remote_robots.keys())

    for key in remote_robot_keys - local_robot_keys:
        added.append({'type': 'robot', 'entity': remote_robots[key]})

    for key in local_robot_keys - remote_robot_keys:
        removed.append({'type': 'robot', 'entity': local_robots[key]})

    for key in local_robot_keys & remote_robot_keys:
        lr = local_robots[key]
        rr = remote_robots[key]
        if lr != rr:
            changed.append({
                'type': 'robot',
                'key': key,
                'local': lr,
                'remote': rr,
            })

    # ── Alerts diff ──
    local_alerts = _entities_index(local_state.get('alerts', []))
    remote_alerts = _entities_index(remote_state.get('alerts', []))

    local_alert_keys = set(local_alerts.keys())
    remote_alert_keys = set(remote_alerts.keys())

    for key in remote_alert_keys - local_alert_keys:
        added.append({'type': 'alert', 'entity': remote_alerts[key]})

    for key in local_alert_keys - remote_alert_keys:
        removed.append({'type': 'alert', 'entity': local_alerts[key]})

    # ── Sensors diff ──
    local_sensors = local_state.get('sensors', {})
    remote_sensors = remote_state.get('sensors', {})

    all_sensor_keys = set(local_sensors.keys()) | set(remote_sensors.keys())
    for key in all_sensor_keys:
        lv = local_sensors.get(key)
        rv = remote_sensors.get(key)
        if lv != rv:
            if key not in local_sensors:
                added.append({'type': 'sensor', 'key': key, 'value': rv})
            elif key not in remote_sensors:
                removed.append({'type': 'sensor', 'key': key, 'value': lv})
            else:
                changed.append({
                    'type': 'sensor',
                    'key': key,
                    'local': lv,
                    'remote': rv,
                })

    # ── Version conflict detection ──
    local_ver = local_state.get('version', 0)
    remote_ver = remote_state.get('version', 0)

    if remote_ver > local_ver + 1:
        # Remote is more than 1 ahead — possible divergence
        conflicts.append({
            'type': 'version',
            'local_version': local_ver,
            'remote_version': remote_ver,
            'detail': f'Remote version {remote_ver} is more than 1 ahead of '
                      f'local version {local_ver}. Possible concurrent edits.',
        })

    return {
        'added': added,
        'removed': removed,
        'changed': changed,
        'conflicts': conflicts,
    }


# ── Conflict resolution ─────────────────────────────────────────────────────

def resolve_conflicts(
    conflicts: list[dict[str, Any]],
    strategy: str,
    local_state: dict[str, Any] | None = None,
    remote_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Resolve a list of conflicts using the specified strategy.

    @param conflicts: List of conflict descriptors (from compute_diff).
    @param strategy: Resolution strategy — 'local', 'remote', or 'merge'.
    @param local_state: The local state (needed for 'merge' strategy).
    @param remote_state: The remote state (needed for 'merge' strategy).

    @return resolved: Dict with resolution summary.
    """
    resolved: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    for conflict in conflicts:
        ctype = conflict.get('type', 'unknown')
        detail = conflict.get('detail', '')

        if strategy == 'local':
            resolved.append({
                'conflict': conflict,
                'resolution': 'accepted_local',
                'detail': 'Kept local version (local strategy).',
            })
        elif strategy == 'remote':
            resolved.append({
                'conflict': conflict,
                'resolution': 'accepted_remote',
                'detail': 'Accepted remote version (remote strategy).',
            })
        elif strategy == 'merge':
            if ctype == 'version':
                # For version conflicts, take the max version
                local_ver = conflict.get('local_version', 0)
                remote_ver = conflict.get('remote_version', 0)
                chosen_ver = max(local_ver, remote_ver)
                resolved.append({
                    'conflict': conflict,
                    'resolution': 'merged',
                    'detail': f'Merged version: took max({local_ver}, '
                              f'{remote_ver}) = {chosen_ver}.',
                })
            else:
                # For data conflicts, take the later timestamp
                local_ts = _safe_timestamp(local_state) if local_state else ''
                remote_ts = _safe_timestamp(remote_state) if remote_state else ''
                if remote_ts >= local_ts:
                    resolved.append({
                        'conflict': conflict,
                        'resolution': 'accepted_remote',
                        'detail': 'Remote state has newer or equal timestamp, '
                                  'accepted remote.',
                    })
                else:
                    resolved.append({
                        'conflict': conflict,
                        'resolution': 'accepted_local',
                        'detail': 'Local state has newer timestamp, '
                                  'kept local.',
                    })
        else:
            unresolved.append({
                'conflict': conflict,
                'detail': f'Unknown strategy "{strategy}".',
            })

    return {
        'resolved': resolved,
        'unresolved': unresolved,
        'strategy': strategy,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }


def _safe_timestamp(state: dict[str, Any] | None) -> str:
    """Extract timestamp string from a state dict safely."""
    if state is None:
        return ''
    return state.get('timestamp', '') or ''
