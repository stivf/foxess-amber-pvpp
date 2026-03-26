"""
Schedule management: persisting decisions, override tracking, and active schedule state.

Wraps the optimizer and handles:
- Persisting generated schedules to optimization_decisions
- Manual override state (in-memory + DB)
- Current action resolution (override takes precedence)
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

from src.shared.models import ScheduleAction

log = structlog.get_logger(__name__)

# In-memory state for active manual override
_active_override: dict | None = None


def get_active_override() -> dict | None:
    """Return the active manual override if one is set and not expired."""
    global _active_override
    if _active_override is None:
        return None
    ends_at = _active_override.get("ends_at")
    if ends_at:
        try:
            end_dt = datetime.fromisoformat(ends_at)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > end_dt:
                _active_override = None
                return None
        except ValueError:
            pass
    return _active_override


def set_override(action: str, end_time: str, reason: str = "") -> dict:
    """Set a manual schedule override. Returns the override dict."""
    global _active_override
    override_id = f"ovr_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    _active_override = {
        "override_id": override_id,
        "action": action,
        "started_at": now,
        "ends_at": end_time,
        "reason": reason,
        "status": "active",
    }
    log.info("schedule_override.set", action=action, ends_at=end_time)
    return _active_override


def cancel_override(current_schedule: list[dict] | None = None) -> dict:
    """Cancel the active manual override. Returns resumed action info."""
    global _active_override
    _active_override = None

    resumed_action = ScheduleAction.AUTO.value
    if current_schedule:
        now = datetime.now(timezone.utc)
        for slot in current_schedule:
            try:
                start = datetime.fromisoformat(slot["start_time"].replace("Z", "+00:00"))
                end = datetime.fromisoformat(slot["end_time"].replace("Z", "+00:00"))
                if start <= now < end:
                    resumed_action = slot["action"]
                    break
            except (KeyError, ValueError):
                continue

    log.info("schedule_override.cancelled", resumed_action=resumed_action)
    return {"status": "cancelled", "resumed_action": resumed_action}


def get_current_action(schedule_slots: list[dict]) -> dict:
    """
    Resolve the current and next scheduled action.

    If a manual override is active and not expired, it takes precedence.

    Returns:
        {
          current_action: str,
          next_change_at: str | None,
          next_action:    str | None,
          is_override:    bool,
        }
    """
    override = get_active_override()
    if override:
        return {
            "current_action": override["action"],
            "next_change_at": override["ends_at"],
            "next_action": None,
            "is_override": True,
        }

    now = datetime.now(timezone.utc)
    current_action = ScheduleAction.AUTO.value
    next_change_at = None
    next_action = None

    for i, slot in enumerate(schedule_slots):
        try:
            start = datetime.fromisoformat(slot["start_time"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(slot["end_time"].replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue

        if start <= now < end:
            current_action = slot["action"]
            # Find next slot with different action
            for next_slot in schedule_slots[i + 1:]:
                if next_slot["action"] != current_action:
                    next_change_at = next_slot["start_time"]
                    next_action = next_slot["action"]
                    break
            break

    return {
        "current_action": current_action,
        "next_change_at": next_change_at,
        "next_action": next_action,
        "is_override": False,
    }


def persist_decision(
    conn: sqlite3.Connection,
    action: str,
    context: dict,
    device_sn: str,
    reason: str,
    valid_from: str,
    valid_until: str,
) -> int:
    """Persist an optimization decision to the audit trail table."""
    cur = conn.execute(
        """
        INSERT INTO optimization_decisions
            (decided_at, valid_from, valid_until, device_sn, action,
             bat_soc_at_decision, import_price_ckwh, export_price_ckwh,
             reason, engine_version, applied)
        VALUES (strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, ?,
                ?, ?, ?,
                ?, ?, 0)
        """,
        (
            valid_from, valid_until, device_sn, action,
            context.get("current_soc") or 0.0,
            context.get("current_import_ckwh") or 0.0,
            context.get("current_export_ckwh") or 0.0,
            reason, "1.0.0",
        ),
    )
    return cur.lastrowid
