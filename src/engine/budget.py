"""
FoxESS API daily call budget tracker (ADR-008).

Persists call counts to SQLite so they survive process restarts.
Provides adaptive polling intervals based on budget consumption.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone

import structlog

from src.shared.models import FoxESSBudgetState

log = structlog.get_logger(__name__)

DAILY_LIMIT = 1440
COMMAND_RESERVE = 200
WARNING_THRESHOLD = 0.80
CRITICAL_THRESHOLD = 0.95


class FoxESSBudget:
    """
    Tracks FoxESS API calls against the 1,440/day hard limit.

    Priority tiers (ADR-008):
    1. Commands (charge/discharge/hold) — always allowed until hard limit
    2. Telemetry polling — allowed until (DAILY_LIMIT - COMMAND_RESERVE) consumed
    3. Burst polling — only if budget > 50% remaining
    """

    def __init__(self, db_path: str):
        self._db_path = db_path

    def _today_utc(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    def _ensure_row(self, conn: sqlite3.Connection, date: str) -> None:
        conn.execute(
            "INSERT OR IGNORE INTO foxess_api_budget (date) VALUES (?)",
            (date,),
        )
        conn.commit()

    def get_usage(self) -> dict:
        """Return today's budget usage summary."""
        date = self._today_utc()
        conn = self._get_conn()
        try:
            self._ensure_row(conn, date)
            row = conn.execute(
                "SELECT calls_used, calls_poll, calls_cmd FROM foxess_api_budget WHERE date = ?",
                (date,),
            ).fetchone()
            calls_used = row["calls_used"] if row else 0
            calls_poll = row["calls_poll"] if row else 0
            calls_cmd = row["calls_cmd"] if row else 0
        finally:
            conn.close()

        fraction = calls_used / DAILY_LIMIT
        if calls_used >= DAILY_LIMIT:
            state = FoxESSBudgetState.EXHAUSTED
        elif fraction >= CRITICAL_THRESHOLD:
            state = FoxESSBudgetState.CRITICAL
        elif fraction >= WARNING_THRESHOLD:
            state = FoxESSBudgetState.WARNING
        else:
            state = FoxESSBudgetState.NORMAL

        return {
            "date": date,
            "calls_used": calls_used,
            "calls_poll": calls_poll,
            "calls_cmd": calls_cmd,
            "calls_remaining": max(0, DAILY_LIMIT - calls_used),
            "daily_limit": DAILY_LIMIT,
            "command_reserve": COMMAND_RESERVE,
            "fraction_used": round(fraction, 4),
            "state": state.value,
        }

    def can_poll(self) -> bool:
        """Return True if a telemetry poll call is within budget."""
        usage = self.get_usage()
        # Reserve COMMAND_RESERVE calls for commands; telemetry stops before that
        return usage["calls_used"] < (DAILY_LIMIT - COMMAND_RESERVE)

    def can_command(self) -> bool:
        """Return True if a command call is allowed (until the absolute hard limit)."""
        usage = self.get_usage()
        return usage["calls_used"] < DAILY_LIMIT

    def can_burst_poll(self) -> bool:
        """Return True if burst polling (90s during spikes) is allowed (>50% budget remaining)."""
        usage = self.get_usage()
        return usage["fraction_used"] < 0.50

    def record_call(self, call_type: str) -> None:
        """
        Increment the call counter. call_type must be 'poll' or 'cmd'.
        Persisted immediately so counts survive crashes.
        """
        date = self._today_utc()
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        assert call_type in ("poll", "cmd"), f"Unknown call_type: {call_type!r}"

        conn = self._get_conn()
        try:
            self._ensure_row(conn, date)
            if call_type == "poll":
                conn.execute(
                    """
                    UPDATE foxess_api_budget
                    SET calls_used = calls_used + 1,
                        calls_poll = calls_poll + 1,
                        last_call = ?
                    WHERE date = ?
                    """,
                    (now_iso, date),
                )
            else:
                conn.execute(
                    """
                    UPDATE foxess_api_budget
                    SET calls_used = calls_used + 1,
                        calls_cmd = calls_cmd + 1,
                        last_call = ?
                    WHERE date = ?
                    """,
                    (now_iso, date),
                )
            conn.commit()
        finally:
            conn.close()

    def adaptive_poll_interval(self, base_interval_sec: int, is_spike: bool = False) -> int:
        """
        Return the poll interval to use given current budget state.

        ADR-008 adaptive polling:
          - Normal (<80%):  base_interval (default 180s)
          - Spike active:   90s (if burst allowed)
          - Warning (80-95%): 300s (5 min)
          - Critical (>95%): None — suspended (returns 0 to signal skip)
        """
        usage = self.get_usage()
        state = FoxESSBudgetState(usage["state"])

        if state == FoxESSBudgetState.EXHAUSTED or state == FoxESSBudgetState.CRITICAL:
            return 0  # Suspended

        if state == FoxESSBudgetState.WARNING:
            return 300

        if is_spike and self.can_burst_poll():
            return 90

        return base_interval_sec
