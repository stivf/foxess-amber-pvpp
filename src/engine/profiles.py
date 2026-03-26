"""
Aggressiveness profile CRUD and calendar resolution logic.

Calendar priority (ARCHITECTURE.md §4.4.1):
  1. One-off overrides (exact datetime match)
  2. Recurring rules (day-of-week + time range, highest priority wins ties)
  3. Default profile fallback
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Profile CRUD
# ─────────────────────────────────────────────────────────────────────────────

def get_all_profiles(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, name, export_aggressiveness, preservation_aggressiveness,
               import_aggressiveness, is_default, created_at, updated_at
        FROM profiles
        ORDER BY is_default DESC, name ASC
        """
    ).fetchall()
    return [dict(r) for r in rows]


def get_profile(conn: sqlite3.Connection, profile_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT id, name, export_aggressiveness, preservation_aggressiveness,
               import_aggressiveness, is_default, created_at, updated_at
        FROM profiles WHERE id = ?
        """,
        (profile_id,),
    ).fetchone()
    return dict(row) if row else None


def get_default_profile(conn: sqlite3.Connection) -> dict | None:
    row = conn.execute(
        """
        SELECT id, name, export_aggressiveness, preservation_aggressiveness,
               import_aggressiveness, is_default, created_at, updated_at
        FROM profiles WHERE is_default = 1
        """
    ).fetchone()
    return dict(row) if row else None


def create_profile(
    conn: sqlite3.Connection,
    name: str,
    export_aggressiveness: float = 0.5,
    preservation_aggressiveness: float = 0.5,
    import_aggressiveness: float = 0.5,
) -> dict:
    profile_id = f"prof_{uuid.uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO profiles (id, name, export_aggressiveness, preservation_aggressiveness,
                              import_aggressiveness, is_default)
        VALUES (?, ?, ?, ?, ?, 0)
        """,
        (profile_id, name, export_aggressiveness, preservation_aggressiveness, import_aggressiveness),
    )
    conn.commit()
    return get_profile(conn, profile_id)


def update_profile(conn: sqlite3.Connection, profile_id: str, updates: dict) -> dict | None:
    allowed = {"name", "export_aggressiveness", "preservation_aggressiveness", "import_aggressiveness"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return get_profile(conn, profile_id)

    set_clauses = ", ".join(f"{k} = ?" for k in filtered)
    set_clauses += ", updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')"
    values = list(filtered.values()) + [profile_id]
    conn.execute(f"UPDATE profiles SET {set_clauses} WHERE id = ?", values)
    conn.commit()
    return get_profile(conn, profile_id)


def set_default_profile(conn: sqlite3.Connection, profile_id: str) -> dict | None:
    """Atomically set a profile as default and clear all others."""
    conn.execute("UPDATE profiles SET is_default = 0")
    conn.execute(
        "UPDATE profiles SET is_default = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
        (profile_id,),
    )
    conn.commit()
    return get_profile(conn, profile_id)


def delete_profile(conn: sqlite3.Connection, profile_id: str) -> dict:
    """
    Delete a profile.

    Returns:
        {"ok": True} on success
        {"error": "is_default"} if the profile is the default
        {"error": "has_rules"} if active calendar rules reference it
        {"error": "not_found"} if the profile doesn't exist
    """
    profile = get_profile(conn, profile_id)
    if not profile:
        return {"error": "not_found"}
    if profile["is_default"]:
        return {"error": "is_default"}

    # Check for active calendar rules
    rule_count = conn.execute(
        "SELECT COUNT(*) FROM calendar_rules WHERE profile_id = ? AND enabled = 1",
        (profile_id,),
    ).fetchone()[0]
    if rule_count > 0:
        return {"error": "has_rules"}

    conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    conn.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Calendar Rules CRUD
# ─────────────────────────────────────────────────────────────────────────────

def get_all_rules(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT r.id, r.profile_id, p.name AS profile_name, r.name,
               r.days_of_week, r.start_time, r.end_time,
               r.priority, r.enabled, r.created_at
        FROM calendar_rules r
        JOIN profiles p ON r.profile_id = p.id
        ORDER BY r.priority DESC, r.name ASC
        """
    ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["days_of_week"] = json.loads(d["days_of_week"])
        d["enabled"] = bool(d["enabled"])
        result.append(d)
    return result


def get_rule(conn: sqlite3.Connection, rule_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT r.id, r.profile_id, p.name AS profile_name, r.name,
               r.days_of_week, r.start_time, r.end_time,
               r.priority, r.enabled, r.created_at
        FROM calendar_rules r
        JOIN profiles p ON r.profile_id = p.id
        WHERE r.id = ?
        """,
        (rule_id,),
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["days_of_week"] = json.loads(d["days_of_week"])
    d["enabled"] = bool(d["enabled"])
    return d


def create_rule(
    conn: sqlite3.Connection,
    profile_id: str,
    name: str,
    days_of_week: list[int],
    start_time: str,
    end_time: str,
    priority: int = 0,
) -> dict:
    rule_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO calendar_rules (id, profile_id, name, days_of_week, start_time, end_time, priority)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (rule_id, profile_id, name, json.dumps(days_of_week), start_time, end_time, priority),
    )
    conn.commit()
    return get_rule(conn, rule_id)


def update_rule(conn: sqlite3.Connection, rule_id: str, updates: dict) -> dict | None:
    allowed = {"name", "days_of_week", "start_time", "end_time", "priority", "enabled"}
    filtered = {}
    for k, v in updates.items():
        if k not in allowed:
            continue
        if k == "days_of_week":
            filtered[k] = json.dumps(v)
        elif k == "enabled":
            filtered[k] = 1 if v else 0
        else:
            filtered[k] = v

    if not filtered:
        return get_rule(conn, rule_id)

    set_clauses = ", ".join(f"{k} = ?" for k in filtered)
    values = list(filtered.values()) + [rule_id]
    conn.execute(f"UPDATE calendar_rules SET {set_clauses} WHERE id = ?", values)
    conn.commit()
    return get_rule(conn, rule_id)


def delete_rule(conn: sqlite3.Connection, rule_id: str) -> bool:
    result = conn.execute("DELETE FROM calendar_rules WHERE id = ?", (rule_id,))
    conn.commit()
    return result.rowcount > 0


# ─────────────────────────────────────────────────────────────────────────────
# Calendar Overrides CRUD
# ─────────────────────────────────────────────────────────────────────────────

def get_overrides(
    conn: sqlite3.Connection,
    from_dt: str | None = None,
    to_dt: str | None = None,
) -> list[dict]:
    now = datetime.now(timezone.utc)
    if from_dt is None:
        from_dt = now.strftime("%Y-%m-%dT%H:%M:%S")
    if to_dt is None:
        from datetime import timedelta
        to_dt = (now + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S")

    rows = conn.execute(
        """
        SELECT o.id, o.profile_id, p.name AS profile_name, o.name,
               o.start_datetime, o.end_datetime, o.created_at
        FROM calendar_overrides o
        JOIN profiles p ON o.profile_id = p.id
        WHERE o.end_datetime >= ? AND o.start_datetime <= ?
        ORDER BY o.start_datetime ASC
        """,
        (from_dt, to_dt),
    ).fetchall()
    return [dict(r) for r in rows]


def get_override(conn: sqlite3.Connection, override_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT o.id, o.profile_id, p.name AS profile_name, o.name,
               o.start_datetime, o.end_datetime, o.created_at
        FROM calendar_overrides o
        JOIN profiles p ON o.profile_id = p.id
        WHERE o.id = ?
        """,
        (override_id,),
    ).fetchone()
    return dict(row) if row else None


def create_override(
    conn: sqlite3.Connection,
    profile_id: str,
    name: str,
    start_datetime: str,
    end_datetime: str,
) -> dict:
    override_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO calendar_overrides (id, profile_id, name, start_datetime, end_datetime)
        VALUES (?, ?, ?, ?, ?)
        """,
        (override_id, profile_id, name, start_datetime, end_datetime),
    )
    conn.commit()
    return get_override(conn, override_id)


def delete_override(conn: sqlite3.Connection, override_id: str) -> bool:
    result = conn.execute("DELETE FROM calendar_overrides WHERE id = ?", (override_id,))
    conn.commit()
    return result.rowcount > 0


# ─────────────────────────────────────────────────────────────────────────────
# Calendar Resolution
# ─────────────────────────────────────────────────────────────────────────────

def resolve_active_profile(
    conn: sqlite3.Connection,
    at: datetime | None = None,
) -> dict:
    """
    Resolve the active profile at a given datetime using calendar priority.

    Priority (ARCHITECTURE.md §4.4.1):
    1. One-off overrides — highest priority
    2. Recurring rules — sorted by priority desc, then narrowest time range
    3. Default profile

    Args:
        conn: SQLite connection
        at:   Datetime to resolve for (defaults to now)

    Returns dict with:
        profile:      Full profile dict
        source:       "default" | "recurring_rule" | "one_off_override"
        rule_id:      (optional) rule ID if source is recurring_rule
        rule_name:    (optional) rule name
        override_id:  (optional) override ID if source is one_off_override
        active_until: (optional) ISO8601 when this profile stops being active
    """
    from src.shared.models import ProfileSource

    if at is None:
        at = datetime.now(timezone.utc)

    # Normalize to naive local-like string for comparison with DB values
    # The DB stores local-time datetimes in calendar_overrides
    at_local_str = at.strftime("%Y-%m-%dT%H:%M:%S")
    at_time_str = at.strftime("%H:%M")
    # Python weekday: Monday=0, Sunday=6 — matches our schema
    at_dow = at.weekday()

    # ── Step 1: Check one-off overrides ──────────────────────────────────────
    overrides = conn.execute(
        """
        SELECT o.id, o.profile_id, o.name, o.start_datetime, o.end_datetime,
               p.name AS profile_name, p.export_aggressiveness,
               p.preservation_aggressiveness, p.import_aggressiveness
        FROM calendar_overrides o
        JOIN profiles p ON o.profile_id = p.id
        WHERE o.start_datetime <= ? AND o.end_datetime >= ?
        ORDER BY o.start_datetime DESC
        LIMIT 1
        """,
        (at_local_str, at_local_str),
    ).fetchone()

    if overrides:
        profile = get_profile(conn, overrides["profile_id"])
        return {
            "profile": profile,
            "source": ProfileSource.ONE_OFF_OVERRIDE.value,
            "override_id": overrides["id"],
            "rule_id": None,
            "rule_name": None,
            "active_until": overrides["end_datetime"],
        }

    # ── Step 2: Check recurring rules ─────────────────────────────────────────
    all_rules = conn.execute(
        """
        SELECT r.id, r.profile_id, r.name, r.days_of_week,
               r.start_time, r.end_time, r.priority
        FROM calendar_rules r
        WHERE r.enabled = 1
        ORDER BY r.priority DESC
        """
    ).fetchall()

    best_rule = None
    best_duration_min = None

    for row in all_rules:
        days = json.loads(row["days_of_week"])
        if at_dow not in days:
            continue

        start = row["start_time"]  # HH:MM
        end = row["end_time"]      # HH:MM

        # Handle time comparison — simple string comparison works for HH:MM
        if start <= end:
            # Normal window (e.g., 16:00 to 20:00)
            match = start <= at_time_str < end
        else:
            # Overnight window (e.g., 22:00 to 06:00)
            match = at_time_str >= start or at_time_str < end

        if not match:
            continue

        # Compute duration in minutes for tie-breaking (narrowest window wins)
        start_h, start_m = map(int, start.split(":"))
        end_h, end_m = map(int, end.split(":"))
        start_total = start_h * 60 + start_m
        end_total = end_h * 60 + end_m
        if end_total <= start_total:
            end_total += 24 * 60
        duration = end_total - start_total

        # Priority already sorted DESC; within same priority, narrowest window wins
        if best_rule is None:
            best_rule = row
            best_duration_min = duration
        elif row["priority"] > best_rule["priority"]:
            best_rule = row
            best_duration_min = duration
        elif row["priority"] == best_rule["priority"] and duration < best_duration_min:
            best_rule = row
            best_duration_min = duration

    if best_rule:
        profile = get_profile(conn, best_rule["profile_id"])
        # active_until = end_time today
        end_h, end_m = map(int, best_rule["end_time"].split(":"))
        active_until = at.replace(hour=end_h, minute=end_m, second=0, microsecond=0)
        return {
            "profile": profile,
            "source": ProfileSource.RECURRING_RULE.value,
            "rule_id": best_rule["id"],
            "rule_name": best_rule["name"],
            "override_id": None,
            "active_until": active_until.strftime("%Y-%m-%dT%H:%M:%S"),
        }

    # ── Step 3: Fall back to default profile ──────────────────────────────────
    default = get_default_profile(conn)
    if default is None:
        # Shouldn't happen due to migration seed, but be defensive
        log.warning("No default profile found — returning empty profile")
        default = {
            "id": "prof_default",
            "name": "Balanced",
            "export_aggressiveness": 0.5,
            "preservation_aggressiveness": 0.5,
            "import_aggressiveness": 0.5,
            "is_default": True,
        }

    return {
        "profile": default,
        "source": ProfileSource.DEFAULT.value,
        "rule_id": None,
        "rule_name": None,
        "override_id": None,
        "active_until": None,
    }
