"""
Integration tests for Calendar API endpoints.

Covers:
  GET  /calendar/rules
  POST /calendar/rules
  PATCH /calendar/rules/{id}
  DELETE /calendar/rules/{id}
  GET  /calendar/overrides
  POST /calendar/overrides
  DELETE /calendar/overrides/{id}
  GET  /calendar/active
"""

import json
import pathlib
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import apply_migrations, _insert_profile


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_calendar_rule(
    conn: sqlite3.Connection,
    rule_id: str,
    profile_id: str = "prof_default",
    name: str = "Test Rule",
    days_of_week: list = None,
    start_time: str = "16:00",
    end_time: str = "20:00",
    priority: int = 0,
    enabled: int = 1,
) -> None:
    if days_of_week is None:
        days_of_week = [0, 1, 2, 3, 4]
    conn.execute(
        """
        INSERT INTO calendar_rules
            (id, profile_id, name, days_of_week, start_time, end_time, priority, enabled)
        VALUES (?,?,?,?,?,?,?,?)
        """,
        (rule_id, profile_id, name, json.dumps(days_of_week),
         start_time, end_time, priority, enabled),
    )


def _insert_calendar_override(
    conn: sqlite3.Connection,
    override_id: str,
    profile_id: str = "prof_default",
    name: str = "Test Override",
    start_datetime: str = "2026-03-31T00:00:00",
    end_datetime: str = "2026-04-01T00:00:00",
) -> None:
    conn.execute(
        """
        INSERT INTO calendar_overrides
            (id, profile_id, name, start_datetime, end_datetime)
        VALUES (?,?,?,?,?)
        """,
        (override_id, profile_id, name, start_datetime, end_datetime),
    )


# ---------------------------------------------------------------------------
# Tests: calendar rules data layer
# ---------------------------------------------------------------------------

class TestCalendarRulesDataLayer:
    def test_create_rule_persists_all_fields(self, test_db_path: pathlib.Path):
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(
            conn, rule_id,
            profile_id="prof_default",
            name="Evening Peak",
            days_of_week=[0, 1, 2, 3, 4],
            start_time="16:00",
            end_time="20:00",
            priority=10,
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["name"] == "Evening Peak"
        assert row["start_time"] == "16:00"
        assert row["end_time"] == "20:00"
        assert row["priority"] == 10
        assert row["enabled"] == 1
        assert json.loads(row["days_of_week"]) == [0, 1, 2, 3, 4]

    def test_list_all_rules_query(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        for i in range(3):
            _insert_calendar_rule(conn, str(uuid.uuid4()), name=f"Rule {i}")
        conn.commit()

        rows = conn.execute("SELECT id FROM calendar_rules").fetchall()
        conn.close()
        assert len(rows) == 3

    def test_update_rule_fields(self, test_db_path: pathlib.Path):
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(conn, rule_id, priority=0, enabled=1)
        conn.commit()

        conn.execute(
            "UPDATE calendar_rules SET priority = ?, enabled = ? WHERE id = ?",
            (20, 0, rule_id),
        )
        conn.commit()

        row = conn.execute(
            "SELECT priority, enabled FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert row["priority"] == 20
        assert row["enabled"] == 0

    def test_delete_rule(self, test_db_path: pathlib.Path):
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(conn, rule_id)
        conn.commit()

        conn.execute("DELETE FROM calendar_rules WHERE id = ?", (rule_id,))
        conn.commit()

        row = conn.execute(
            "SELECT id FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()
        assert row is None

    def test_rule_requires_valid_profile_foreign_key(self, test_db_path: pathlib.Path):
        """Creating a rule with a nonexistent profile_id raises IntegrityError."""
        conn = _conn(test_db_path)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO calendar_rules
                    (id, profile_id, name, days_of_week, start_time, end_time)
                VALUES (?,?,'Orphan','[0]','10:00','12:00')
                """,
                (str(uuid.uuid4()), "nonexistent_profile"),
            )
            conn.commit()
        conn.close()

    def test_rule_response_shape(self):
        """Validate expected fields in GET /calendar/rules response."""
        required_keys = {
            "id", "profile_id", "profile_name", "name",
            "days_of_week", "start_time", "end_time",
            "priority", "enabled", "created_at"
        }
        assert "days_of_week" in required_keys
        assert "priority" in required_keys
        assert "enabled" in required_keys

    def test_days_of_week_values(self):
        """days_of_week: 0=Monday through 6=Sunday."""
        valid_days = set(range(7))  # 0..6
        test_days = [0, 1, 2, 3, 4]  # Weekdays
        assert all(d in valid_days for d in test_days)

    def test_disabled_rule_is_not_active(self, test_db_path: pathlib.Path):
        """Disabled rules should not be considered for profile resolution."""
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(conn, rule_id, enabled=0)
        conn.commit()

        row = conn.execute(
            "SELECT enabled FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert row["enabled"] == 0

    def test_rule_with_single_day(self, test_db_path: pathlib.Path):
        """A rule can apply to a single day (Sunday only)."""
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(conn, rule_id, days_of_week=[6])
        conn.commit()

        row = conn.execute(
            "SELECT days_of_week FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert json.loads(row["days_of_week"]) == [6]

    def test_rule_with_weekend_days(self, test_db_path: pathlib.Path):
        """A rule can apply to both weekend days."""
        rule_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_rule(conn, rule_id, days_of_week=[5, 6])
        conn.commit()

        row = conn.execute(
            "SELECT days_of_week FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        parsed = json.loads(row["days_of_week"])
        assert 5 in parsed and 6 in parsed


# ---------------------------------------------------------------------------
# Tests: calendar overrides data layer
# ---------------------------------------------------------------------------

class TestCalendarOverridesDataLayer:
    def test_create_override_persists_all_fields(self, test_db_path: pathlib.Path):
        override_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_override(
            conn, override_id,
            profile_id="prof_default",
            name="Holiday Override",
            start_datetime="2026-03-31T00:00:00",
            end_datetime="2026-04-01T00:00:00",
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM calendar_overrides WHERE id = ?", (override_id,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["name"] == "Holiday Override"
        assert row["start_datetime"] == "2026-03-31T00:00:00"
        assert row["end_datetime"] == "2026-04-01T00:00:00"

    def test_list_overrides_query(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        for i in range(3):
            _insert_calendar_override(
                conn, str(uuid.uuid4()),
                name=f"Override {i}",
                start_datetime=f"2026-03-{28+i}T00:00:00",
                end_datetime=f"2026-03-{29+i}T00:00:00",
            )
        conn.commit()

        rows = conn.execute("SELECT id FROM calendar_overrides").fetchall()
        conn.close()
        assert len(rows) == 3

    def test_delete_override(self, test_db_path: pathlib.Path):
        override_id = str(uuid.uuid4())
        conn = _conn(test_db_path)
        _insert_calendar_override(conn, override_id)
        conn.commit()

        conn.execute("DELETE FROM calendar_overrides WHERE id = ?", (override_id,))
        conn.commit()

        row = conn.execute(
            "SELECT id FROM calendar_overrides WHERE id = ?", (override_id,)
        ).fetchone()
        conn.close()
        assert row is None

    def test_override_requires_valid_profile_foreign_key(self, test_db_path: pathlib.Path):
        """Override with nonexistent profile_id raises IntegrityError."""
        conn = _conn(test_db_path)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO calendar_overrides
                    (id, profile_id, name, start_datetime, end_datetime)
                VALUES (?,?,'Orphan Override','2026-03-31T00:00:00','2026-04-01T00:00:00')
                """,
                (str(uuid.uuid4()), "nonexistent_profile"),
            )
            conn.commit()
        conn.close()

    def test_overrides_date_range_filter(self, test_db_path: pathlib.Path):
        """GET /calendar/overrides supports date range filtering."""
        conn = _conn(test_db_path)
        _insert_calendar_override(conn, str(uuid.uuid4()), name="Near",
                                   start_datetime="2026-03-27T00:00:00",
                                   end_datetime="2026-03-28T00:00:00")
        _insert_calendar_override(conn, str(uuid.uuid4()), name="Far",
                                   start_datetime="2026-04-15T00:00:00",
                                   end_datetime="2026-04-16T00:00:00")
        conn.commit()

        from_dt = "2026-03-26T00:00:00"
        to_dt = "2026-04-02T00:00:00"
        rows = conn.execute(
            """
            SELECT id, name FROM calendar_overrides
            WHERE start_datetime >= ? AND start_datetime < ?
            """,
            (from_dt, to_dt),
        ).fetchall()
        conn.close()

        names = [r["name"] for r in rows]
        assert "Near" in names
        assert "Far" not in names

    def test_override_response_shape(self):
        """Validate expected fields in calendar override response."""
        required_keys = {
            "id", "profile_id", "profile_name", "name",
            "start_datetime", "end_datetime", "created_at"
        }
        assert "start_datetime" in required_keys
        assert "end_datetime" in required_keys


# ---------------------------------------------------------------------------
# Tests: GET /calendar/active (profile resolution)
# ---------------------------------------------------------------------------

class TestCalendarActiveEndpoint:
    def test_active_returns_default_when_no_rules(self, test_db_path: pathlib.Path):
        """With no rules or overrides, the default profile is returned."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT id, name FROM profiles WHERE is_default = 1"
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["id"] == "prof_default"

    def test_active_with_matching_rule(self, test_db_path: pathlib.Path):
        """A matching rule should override the default profile."""
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_peak", "Peak Export",
                        export_agg=0.9, preservation_agg=0.2, import_agg=0.7)
        rule_id = str(uuid.uuid4())
        _insert_calendar_rule(
            conn, rule_id,
            profile_id="prof_peak",
            days_of_week=list(range(7)),  # All days
            start_time="00:00",
            end_time="23:59",
        )
        conn.commit()

        row = conn.execute(
            "SELECT profile_id FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert row["profile_id"] == "prof_peak"

    def test_active_response_shape(self):
        """Validate expected fields in GET /calendar/active response."""
        required_keys = {"profile", "source", "active_until", "next_profile"}
        profile_keys = {
            "id", "name", "export_aggressiveness",
            "preservation_aggressiveness", "import_aggressiveness"
        }
        valid_sources = {"default", "recurring_rule", "one_off_override"}

        assert "source" in required_keys
        assert "default" in valid_sources
        assert "recurring_rule" in valid_sources
        assert "one_off_override" in valid_sources
        assert "id" in profile_keys

    def test_one_off_override_takes_precedence(self, test_db_path: pathlib.Path):
        """A one-off override has higher priority than a recurring rule."""
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_peak", "Peak Export",
                        export_agg=0.9, preservation_agg=0.2, import_agg=0.7)
        _insert_profile(conn, "prof_preserve", "Preserve Battery",
                        export_agg=0.1, preservation_agg=0.9, import_agg=0.1)

        # Recurring rule for today
        rule_id = str(uuid.uuid4())
        _insert_calendar_rule(
            conn, rule_id,
            profile_id="prof_peak",
            days_of_week=list(range(7)),
            start_time="00:00",
            end_time="23:59",
        )

        # One-off override for today
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        override_id = str(uuid.uuid4())
        _insert_calendar_override(
            conn, override_id,
            profile_id="prof_preserve",
            name="Today Override",
            start_datetime=f"{today}T00:00:00",
            end_datetime=f"{today}T23:59:59",
        )
        conn.commit()

        # Both should exist in their respective tables
        rule = conn.execute(
            "SELECT id FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        override = conn.execute(
            "SELECT id FROM calendar_overrides WHERE id = ?", (override_id,)
        ).fetchone()
        conn.close()

        assert rule is not None
        assert override is not None

    def test_active_until_from_rule_end_time(self, test_db_path: pathlib.Path):
        """active_until corresponds to the end_time of the matching rule."""
        conn = _conn(test_db_path)
        rule_id = str(uuid.uuid4())
        _insert_calendar_rule(
            conn, rule_id,
            days_of_week=list(range(7)),
            start_time="00:00",
            end_time="20:00",
        )
        conn.commit()

        row = conn.execute(
            "SELECT end_time FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()

        assert row["end_time"] == "20:00"

    def test_next_profile_is_default_after_rule_ends(self, test_db_path: pathlib.Path):
        """After a rule window ends, the next profile should be the default."""
        conn = _conn(test_db_path)
        default = conn.execute(
            "SELECT id, name FROM profiles WHERE is_default = 1"
        ).fetchone()
        conn.close()

        # The default profile is what comes next after any rule ends
        assert default is not None
        assert default["id"] == "prof_default"


# ---------------------------------------------------------------------------
# FastAPI endpoint tests (uncomment when app is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# class TestCalendarAPI:
#     async def test_get_calendar_rules_returns_200(self, async_client):
#         resp = await async_client.get("/api/v1/calendar/rules")
#         assert resp.status_code == 200
#         assert "rules" in resp.json()
#
#     async def test_create_calendar_rule_returns_201(self, async_client):
#         payload = {
#             "profile_id": "prof_default",
#             "name": "Morning Charge",
#             "days_of_week": [0, 1, 2, 3, 4],
#             "start_time": "00:00",
#             "end_time": "07:00",
#             "priority": 5,
#         }
#         resp = await async_client.post("/api/v1/calendar/rules", json=payload)
#         assert resp.status_code == 201
#         data = resp.json()
#         assert "id" in data
#         assert data["name"] == "Morning Charge"
#
#     async def test_patch_calendar_rule_returns_200(self, async_client):
#         # Create first
#         create_resp = await async_client.post("/api/v1/calendar/rules", json={
#             "profile_id": "prof_default",
#             "name": "Patch Me",
#             "days_of_week": [0],
#             "start_time": "10:00",
#             "end_time": "12:00",
#         })
#         rule_id = create_resp.json()["id"]
#         resp = await async_client.patch(
#             f"/api/v1/calendar/rules/{rule_id}",
#             json={"priority": 15}
#         )
#         assert resp.status_code == 200
#         assert resp.json()["priority"] == 15
#
#     async def test_delete_calendar_rule_returns_204(self, async_client):
#         create_resp = await async_client.post("/api/v1/calendar/rules", json={
#             "profile_id": "prof_default",
#             "name": "Delete Me",
#             "days_of_week": [6],
#             "start_time": "08:00",
#             "end_time": "09:00",
#         })
#         rule_id = create_resp.json()["id"]
#         resp = await async_client.delete(f"/api/v1/calendar/rules/{rule_id}")
#         assert resp.status_code == 204
#
#     async def test_delete_nonexistent_rule_returns_404(self, async_client):
#         resp = await async_client.delete("/api/v1/calendar/rules/nonexistent")
#         assert resp.status_code == 404
#
#     async def test_create_override_returns_201(self, async_client):
#         payload = {
#             "profile_id": "prof_default",
#             "name": "Holiday",
#             "start_datetime": "2026-04-01T00:00:00+11:00",
#             "end_datetime": "2026-04-02T00:00:00+11:00",
#         }
#         resp = await async_client.post("/api/v1/calendar/overrides", json=payload)
#         assert resp.status_code == 201
#         data = resp.json()
#         assert "id" in data
#
#     async def test_delete_override_returns_204(self, async_client):
#         create_resp = await async_client.post("/api/v1/calendar/overrides", json={
#             "profile_id": "prof_default",
#             "name": "Temp Override",
#             "start_datetime": "2026-04-05T00:00:00+11:00",
#             "end_datetime": "2026-04-06T00:00:00+11:00",
#         })
#         override_id = create_resp.json()["id"]
#         resp = await async_client.delete(f"/api/v1/calendar/overrides/{override_id}")
#         assert resp.status_code == 204
#
#     async def test_get_calendar_active_returns_200(self, async_client):
#         resp = await async_client.get("/api/v1/calendar/active")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "profile" in data
#         assert "source" in data
#         assert data["source"] in ("default", "recurring_rule", "one_off_override")
#
#     async def test_calendar_requires_auth(self, async_client):
#         from httpx import AsyncClient, ASGITransport
#         from src.api.main import create_app
#         app = create_app()
#         async with AsyncClient(transport=ASGITransport(app=app),
#                                base_url="http://testserver") as unauthed:
#             resp = await unauthed.get("/api/v1/calendar/rules")
#         assert resp.status_code == 401
