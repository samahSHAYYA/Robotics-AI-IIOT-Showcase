"""
@author: generated
@date: 30-May-2026

@description: REST endpoints for Digital Twin State Reconciliation (Feature 44).
Provides state retrieval, diff computation, and conflict resolution.
"""

import logging

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.deps import require_role
from app.db import User
from app.reconciliation import (
    build_snapshot,
    compute_diff,
    resolve_conflicts,
)
from app.store import store

router: APIRouter = APIRouter(prefix='/api/v1/reconcile')
logger: logging.Logger = logging.getLogger(__name__)


class DiffRequest(BaseModel):
    """Request body for computing a diff against current state."""
    state: dict[str, Any]
    version: int


class ResolveRequest(BaseModel):
    """Request body for resolving conflicts."""
    conflicts: list[dict[str, Any]]
    resolution: str  # 'local', 'remote', or 'merge'
    local_state: dict[str, Any] | None = None
    remote_state: dict[str, Any] | None = None


@router.get('/state')
async def get_reconcile_state(user: User = Depends(require_role('admin', 'operator'))):
    """
    Return the current digital twin state snapshot with version vector.

    @return snapshot: Dict with version, timestamp, robots, alerts, sensors.
    """
    snapshot = store.get_snapshot()
    state = build_snapshot(snapshot)
    logger.info('Reconciliation state requested (version=%d)', state['version'])
    return state


@router.post('/diff')
async def get_diff(body: DiffRequest,
                   user: User = Depends(require_role('admin', 'operator'))):
    """
    Compare the current digital twin state with a submitted state.

    @param body: Contains the remote state dict and its version number.

    @return diff: Structured diff with added, removed, changed, conflicts.
    """
    local_snapshot = store.get_snapshot()
    local_state = build_snapshot(local_snapshot)

    # Override version with our actual version for accurate comparison
    local_state['version'] = local_state.get('version', 0)
    remote_state = body.state
    remote_state['version'] = body.version

    diff = compute_diff(local_state, remote_state)
    logger.info(
        'Diff computed: added=%d, removed=%d, changed=%d, conflicts=%d',
        len(diff['added']),
        len(diff['removed']),
        len(diff['changed']),
        len(diff['conflicts']),
    )
    return diff


@router.post('/resolve')
async def resolve(body: ResolveRequest,
                  user: User = Depends(require_role('admin', 'operator'))):
    """
    Resolve conflicts using the specified strategy (local, remote, or merge).

    @param body: Contains conflicts list, resolution strategy, and optional
                 local/remote states for merge strategy.

    @return result: Resolution result with resolved and unresolved lists.
    """
    valid_strategies = {'local', 'remote', 'merge'}
    if body.resolution not in valid_strategies:
        return {
            'error': f'Invalid resolution strategy "{body.resolution}". '
                     f'Must be one of: {", ".join(sorted(valid_strategies))}',
            'resolved': [],
            'unresolved': body.conflicts,
            'strategy': body.resolution,
        }

    result = resolve_conflicts(
        conflicts=body.conflicts,
        strategy=body.resolution,
        local_state=body.local_state,
        remote_state=body.remote_state,
    )
    logger.info(
        'Conflicts resolved: %d resolved, %d unresolved (strategy=%s)',
        len(result['resolved']),
        len(result['unresolved']),
        body.resolution,
    )
    return result
