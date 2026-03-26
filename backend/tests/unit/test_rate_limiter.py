"""
Unit tests for the FoxESS API rate limiter / budget tracker.

Tests the expected behaviour of the FoxESSBudget class (to be implemented
in src/engine/rate_limiter.py or src/engine/executor.py).

ADR-008 specification:
  - 1,440 calls/day hard limit
  - 200 calls reserved for commands
  - can_poll() returns False when calls_used >= daily_limit - command_reserve (1240)
  - Adaptive polling: normal=180s, warning (>80%)=300s, critical (>95%)=suspended
  - Budget persisted to SQLite foxess_api_budget table — survives restarts
  - Resets at UTC midnight
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, date
from unittest.mock import patch, MagicMock

import pytest

from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Reference FoxESSBudget implementation for tests to validate against.
# When src/engine/rate_limiter.py is written, replace this import.
# ---------------------------------------------------------------------------

class FoxESSBudget:
    """
    Tracks daily FoxESS API call budget.

    Persists to the foxess_api_budget table in SQLite.
    """

    DAILY_LIMIT = 1440
    COMMAND_RESERVE = 200
    WARNING_THRESHOLD = 0.80
    CRITICAL_THRESHOLD = 0.95

    # Adaptive polling intervals (seconds)
    POLL_INTERVAL_NORMAL = 180
    POLL_INTERVAL_WARNING = 300
    POLL_INTERVAL_CRITICAL = None  # suspended

    def __init__(self, db_path: pathlib.Path):
        self.db_path = db_path
        self._today: str = self._utc_date()

    def _utc_date(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _ensure_today_row(self, conn: sqlite3.Connection) -> None:
        today = self._utc_date()
        conn.execute(
            "INSERT OR IGNORE INTO foxess_api_budget (date) VALUES (?)", (today,)
        )
        conn.commit()

    def _get_today_calls(self, conn: sqlite3.Connection) -> int:
        today = self._utc_date()
        row = conn.execute(
            "SELECT calls_used FROM foxess_api_budget WHERE date = ?", (today,)
        ).fetchone()
        return row["calls_used"] if row else 0

    def can_poll(self) -> bool:
        """Return True if a telemetry poll is within budget (not exhausting command reserve)."""
        conn = self._get_conn()
        try:
            self._ensure_today_row(conn)
            calls = self._get_today_calls(conn)
            remaining = self.DAILY_LIMIT - calls
            return remaining > self.COMMAND_RESERVE
        finally:
            conn.close()

    def record_call(self, call_type: str) -> None:
        """Record an API call. call_type: 'poll' | 'cmd'."""
        assert call_type in ("poll", "cmd"), f"Unknown call_type: {call_type}"
        conn = self._get_conn()
        today = self._utc_date()
        try:
            self._ensure_today_row(conn)
            if call_type == "poll":
                conn.execute(
                    """
                    UPDATE foxess_api_budget
                    SET calls_used = calls_used + 1,
                        calls_poll = calls_poll + 1,
                        last_call  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                    WHERE date = ?
                    """,
                    (today,),
                )
            else:
                conn.execute(
                    """
                    UPDATE foxess_api_budget
                    SET calls_used = calls_used + 1,
                        calls_cmd  = calls_cmd + 1,
                        last_call  = strftime('%Y-%m-%dT%H:%M:%SZ','now')
                    WHERE date = ?
                    """,
                    (today,),
                )
            conn.commit()
        finally:
            conn.close()

    def get_usage_fraction(self) -> float:
        """Return fraction of daily limit used (0.0 to 1.0+)."""
        conn = self._get_conn()
        try:
            self._ensure_today_row(conn)
            calls = self._get_today_calls(conn)
            return calls / self.DAILY_LIMIT
        finally:
            conn.close()

    def recommended_poll_interval(self) -> int | None:
        """
        Return recommended poll interval in seconds based on budget usage.
        Returns None if polling should be suspended.
        """
        fraction = self.get_usage_fraction()
        if fraction >= self.CRITICAL_THRESHOLD:
            return None
        if fraction >= self.WARNING_THRESHOLD:
            return self.POLL_INTERVAL_WARNING
        return self.POLL_INTERVAL_NORMAL


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def budget(test_db_path: pathlib.Path) -> FoxESSBudget:
    return FoxESSBudget(db_path=test_db_path)


def _set_calls_used(db_path: pathlib.Path, calls: int) -> None:
    """Helper to directly set calls_used for today."""
    conn = sqlite3.connect(str(db_path))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    conn.execute("INSERT OR REPLACE INTO foxess_api_budget (date, calls_used) VALUES (?,?)",
                 (today, calls))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Tests: can_poll()
# ---------------------------------------------------------------------------

class TestCanPoll:
    def test_can_poll_returns_true_when_budget_fresh(self, budget: FoxESSBudget):
        assert budget.can_poll() is True

    def test_can_poll_returns_false_when_command_reserve_would_be_breached(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        # Set calls_used to exactly at the threshold: 1440 - 200 = 1240
        _set_calls_used(test_db_path, 1240)
        assert budget.can_poll() is False

    def test_can_poll_returns_false_when_over_limit(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        _set_calls_used(test_db_path, 1350)
        assert budget.can_poll() is False

    def test_can_poll_returns_true_just_below_reserve_boundary(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        # 1239 calls used — 1 below the command reserve boundary
        _set_calls_used(test_db_path, 1239)
        assert budget.can_poll() is True


# ---------------------------------------------------------------------------
# Tests: record_call()
# ---------------------------------------------------------------------------

class TestRecordCall:
    def test_record_poll_increments_calls_used_and_calls_poll(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        budget.record_call("poll")
        conn = sqlite3.connect(str(test_db_path))
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT calls_used, calls_poll, calls_cmd FROM foxess_api_budget WHERE date = ?",
            (today,),
        ).fetchone()
        conn.close()
        assert row[0] == 1  # calls_used
        assert row[1] == 1  # calls_poll
        assert row[2] == 0  # calls_cmd

    def test_record_cmd_increments_calls_used_and_calls_cmd(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        budget.record_call("cmd")
        conn = sqlite3.connect(str(test_db_path))
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT calls_used, calls_poll, calls_cmd FROM foxess_api_budget WHERE date = ?",
            (today,),
        ).fetchone()
        conn.close()
        assert row[0] == 1  # calls_used
        assert row[1] == 0  # calls_poll
        assert row[2] == 1  # calls_cmd

    def test_multiple_calls_accumulate_correctly(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        for _ in range(5):
            budget.record_call("poll")
        budget.record_call("cmd")
        conn = sqlite3.connect(str(test_db_path))
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT calls_used, calls_poll, calls_cmd FROM foxess_api_budget WHERE date = ?",
            (today,),
        ).fetchone()
        conn.close()
        assert row[0] == 6
        assert row[1] == 5
        assert row[2] == 1

    def test_record_call_persists_across_new_instance(
        self, test_db_path: pathlib.Path
    ):
        """Simulates process restart: create a new FoxESSBudget on the same DB."""
        b1 = FoxESSBudget(db_path=test_db_path)
        for _ in range(10):
            b1.record_call("poll")

        b2 = FoxESSBudget(db_path=test_db_path)
        fraction = b2.get_usage_fraction()
        assert fraction == pytest.approx(10 / 1440)

    def test_invalid_call_type_raises(self, budget: FoxESSBudget):
        with pytest.raises(AssertionError):
            budget.record_call("unknown")


# ---------------------------------------------------------------------------
# Tests: adaptive polling intervals
# ---------------------------------------------------------------------------

class TestAdaptivePollingIntervals:
    def test_normal_budget_returns_normal_interval(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        _set_calls_used(test_db_path, 0)
        assert budget.recommended_poll_interval() == FoxESSBudget.POLL_INTERVAL_NORMAL

    def test_warning_threshold_returns_warning_interval(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        # 80% of 1440 = 1152 calls
        _set_calls_used(test_db_path, 1152)
        assert budget.recommended_poll_interval() == FoxESSBudget.POLL_INTERVAL_WARNING

    def test_critical_threshold_suspends_polling(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        # 95% of 1440 = 1368 calls
        _set_calls_used(test_db_path, 1368)
        assert budget.recommended_poll_interval() is None

    def test_just_below_warning_threshold_returns_normal(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        # 79.9% — just below warning
        _set_calls_used(test_db_path, 1150)  # < 1152
        assert budget.recommended_poll_interval() == FoxESSBudget.POLL_INTERVAL_NORMAL


# ---------------------------------------------------------------------------
# Tests: daily budget reset
# ---------------------------------------------------------------------------

class TestBudgetReset:
    def test_yesterday_calls_do_not_count_today(
        self, budget: FoxESSBudget, test_db_path: pathlib.Path
    ):
        """Calls from yesterday should not affect today's can_poll()."""
        yesterday = (datetime.now(timezone.utc).replace(hour=0, minute=0, second=0)
                     .strftime("%Y-%m-%d"))
        # Manually insert yesterday with 1440 calls
        conn = sqlite3.connect(str(test_db_path))
        conn.execute(
            "INSERT OR REPLACE INTO foxess_api_budget (date, calls_used) VALUES (?,?)",
            ("2026-03-24", 1440),
        )
        conn.commit()
        conn.close()

        # Today's budget should still be clean
        assert budget.can_poll() is True
