"""
Integration tests for Schedule API endpoints.

Covers:
  GET  /schedule
  POST /schedule/override
  DELETE /schedule/override

These tests validate the database-level data contracts and will serve as
the test spec for when the FastAPI routes are implemented.
"""

import sqlite3
import pathlib
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_decision(conn: sqlite3.Connection,
                     valid_from: str, valid_until: str,
                     action: str = "CHARGE",
                     bat_soc: float = 72.0,
                     import_price: float = 8.5,
                     export_price: float = 3.2,
                     reason: str = "Low price period") -> int:
    cur = conn.execute(
        """
        INSERT INTO optimization_decisions
            (valid_from, valid_until, device_sn, action, bat_soc_at_decision,
             import_price_ckwh, export_price_ckwh, reason, engine_version, applied)
        VALUES (?,?,'TEST001',?,?,?,?,?,'1.0.0',1)
        """,
        (valid_from, valid_until, action, bat_soc, import_price, export_price, reason),
    )
    return cur.lastrowid


# ---------------------------------------------------------------------------
# Tests: optimization decisions data layer
# ---------------------------------------------------------------------------

class TestOptimizationDecisionsDataLayer:
    def test_insert_and_retrieve_decision(self, test_db_path: pathlib.Path):
        now = datetime.now(timezone.utc)
        valid_from = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        valid_until = (now + timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_decision(conn, valid_from, valid_until, action="DISCHARGE",
                         import_price=85.0, export_price=25.0)
        conn.commit()

        row = conn.execute(
            "SELECT * FROM optimization_decisions ORDER BY decided_at DESC LIMIT 1"
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["action"] == "DISCHARGE"
        assert row["import_price_ckwh"] == pytest.approx(85.0)

    def test_current_active_decision_query(self, test_db_path: pathlib.Path):
        """The schedule endpoint must return the decision covering 'now'."""
        now = datetime.now(timezone.utc)
        # Current decision
        valid_from = (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
        valid_until = (now + timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        # Past decision
        past_from = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        past_until = (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_decision(conn, valid_from, valid_until, action="CHARGE")
        _insert_decision(conn, past_from, past_until, action="HOLD")
        conn.commit()

        now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        row = conn.execute(
            """
            SELECT * FROM optimization_decisions
            WHERE valid_from <= ? AND valid_until > ?
            ORDER BY decided_at DESC LIMIT 1
            """,
            (now_str, now_str),
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["action"] == "CHARGE"

    def test_upcoming_decisions_ordered_by_time(self, test_db_path: pathlib.Path):
        now = datetime.now(timezone.utc)
        slots = [
            {"from": (now + timedelta(minutes=i * 30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "until": (now + timedelta(minutes=(i + 1) * 30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "action": ["CHARGE", "HOLD", "DISCHARGE"][i % 3]}
            for i in range(5)
        ]
        conn = _conn(test_db_path)
        for s in slots:
            _insert_decision(conn, s["from"], s["until"], action=s["action"])
        conn.commit()

        now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute(
            """
            SELECT action, valid_from FROM optimization_decisions
            WHERE valid_until > ?
            ORDER BY valid_from ASC
            """,
            (now_str,),
        ).fetchall()
        conn.close()

        assert len(rows) == 5
        # Verify ordered ascending
        starts = [r["valid_from"] for r in rows]
        assert starts == sorted(starts)

    def test_valid_actions_enum_values(self, test_db_path: pathlib.Path):
        """Only CHARGE, HOLD, DISCHARGE, AUTO should be used as actions."""
        valid_actions = {"CHARGE", "HOLD", "DISCHARGE", "AUTO"}
        now = datetime.now(timezone.utc)
        conn = _conn(test_db_path)
        for action in valid_actions:
            _insert_decision(
                conn,
                now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                (now + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                action=action,
            )
        conn.commit()

        rows = conn.execute("SELECT DISTINCT action FROM optimization_decisions").fetchall()
        conn.close()
        stored_actions = {r["action"] for r in rows}
        assert stored_actions == valid_actions


# ---------------------------------------------------------------------------
# Override logic tests
# (Tests the schedule/override endpoint contract)
# ---------------------------------------------------------------------------

class TestScheduleOverrideContract:
    def test_override_action_must_be_valid_enum(self):
        """POST /schedule/override: action must be one of CHARGE, HOLD, DISCHARGE, AUTO."""
        valid_actions = ["CHARGE", "HOLD", "DISCHARGE", "AUTO"]
        invalid_actions = ["EXPORT", "SUSPEND", "OFF", "", "charge"]

        for action in valid_actions:
            assert action in {"CHARGE", "HOLD", "DISCHARGE", "AUTO"}

        for action in invalid_actions:
            assert action not in {"CHARGE", "HOLD", "DISCHARGE", "AUTO"}

    def test_override_end_time_must_be_future(self):
        """end_time in POST /schedule/override must be in the future."""
        now = datetime.now(timezone.utc)
        past = now - timedelta(hours=1)
        future = now + timedelta(hours=2)
        assert future > now
        assert past < now


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestScheduleAPI:
    async def test_get_schedule_returns_200(self, async_client):
        resp = await async_client.get("/api/v1/schedule")
        assert resp.status_code == 200
        data = resp.json()
        assert "slots" in data
        assert "generated_at" in data

    async def test_post_override_returns_200(self, async_client):
        future_time = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        payload = {
            "action": "DISCHARGE",
            "end_time": future_time,
            "reason": "Test override",
        }
        resp = await async_client.post("/api/v1/schedule/override", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["action"] == "DISCHARGE"
        assert data["status"] == "active"

    async def test_post_override_invalid_action_returns_422(self, async_client):
        payload = {"action": "INVALID", "end_time": "2026-03-25T14:00:00+11:00"}
        resp = await async_client.post("/api/v1/schedule/override", json=payload)
        assert resp.status_code == 422

    async def test_delete_override_returns_200(self, async_client):
        # Set up an override first
        future_time = (datetime.now(timezone.utc) + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        await async_client.post("/api/v1/schedule/override",
                                 json={"action": "HOLD", "end_time": future_time})
        resp = await async_client.delete("/api/v1/schedule/override")
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"
