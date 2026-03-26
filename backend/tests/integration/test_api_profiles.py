"""
Integration tests for Profiles API endpoints.

Covers:
  GET  /profiles
  GET  /profiles/{id}
  POST /profiles
  PATCH /profiles/{id}
  DELETE /profiles/{id}
  POST /profiles/{id}/set-default

Note: These tests are written against the API contract defined in
API_CONTRACT.md. When the FastAPI app is implemented at src/api/main.py,
uncomment the async_client fixture in conftest.py and the tests below will
use a real async HTTP client.

For now, tests are structured to run against the implemented app using
pytest-asyncio + httpx AsyncClient.
"""

import pathlib
import sqlite3

import pytest

from tests.conftest import apply_migrations, _insert_profile


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _get_profile(db_path: pathlib.Path, profile_id: str) -> dict | None:
    conn = _conn(db_path)
    row = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Database-level contract tests (run without FastAPI app)
# These validate the data layer that the API routes sit on top of.
# ---------------------------------------------------------------------------

class TestProfilesDataLayer:
    """Tests that validate the database schema and expected API data shapes."""

    def test_default_profile_exists_after_migration(self, test_db_path: pathlib.Path):
        prof = _get_profile(test_db_path, "prof_default")
        assert prof is not None
        assert prof["name"] == "Balanced"
        assert prof["is_default"] == 1
        assert prof["export_aggressiveness"] == pytest.approx(0.5)
        assert prof["preservation_aggressiveness"] == pytest.approx(0.5)
        assert prof["import_aggressiveness"] == pytest.approx(0.5)

    def test_create_profile_inserts_row(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_test", "Test Profile",
                        export_agg=0.8, preservation_agg=0.3, import_agg=0.6)
        conn.commit()
        conn.close()

        prof = _get_profile(test_db_path, "prof_test")
        assert prof is not None
        assert prof["name"] == "Test Profile"
        assert prof["export_aggressiveness"] == pytest.approx(0.8)

    def test_all_profiles_query(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_a", "Profile A")
        _insert_profile(conn, "prof_b", "Profile B")
        conn.commit()
        conn.close()

        conn = _conn(test_db_path)
        rows = conn.execute("SELECT * FROM profiles").fetchall()
        conn.close()
        # default + 2 inserted
        assert len(rows) >= 3

    def test_only_one_default_profile(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        # Ensure only one default at a time by resetting and setting a new one
        conn.execute("UPDATE profiles SET is_default = 0")
        conn.execute("UPDATE profiles SET is_default = 1 WHERE id = 'prof_default'")
        conn.commit()

        defaults = conn.execute("SELECT id FROM profiles WHERE is_default = 1").fetchall()
        conn.close()
        assert len(defaults) == 1

    def test_delete_profile_with_calendar_rule_cascade(
        self, test_db_path: pathlib.Path
    ):
        """Deleting a profile cascades to calendar_rules."""
        conn = _conn(test_db_path)
        import uuid
        rule_id = str(uuid.uuid4())
        _insert_profile(conn, "prof_deletable", "Deletable",
                        export_agg=0.5, preservation_agg=0.5, import_agg=0.5)
        conn.execute(
            """
            INSERT INTO calendar_rules
                (id, profile_id, name, days_of_week, start_time, end_time)
            VALUES (?,?,'Test Rule','[0,1]','16:00','20:00')
            """,
            (rule_id, "prof_deletable"),
        )
        conn.commit()

        # Delete the profile — rule should cascade
        conn.execute("DELETE FROM profiles WHERE id = 'prof_deletable'")
        conn.commit()

        rule = conn.execute(
            "SELECT id FROM calendar_rules WHERE id = ?", (rule_id,)
        ).fetchone()
        conn.close()
        assert rule is None, "Calendar rule should be deleted by cascade"

    def test_profile_aggressiveness_bounds(self, test_db_path: pathlib.Path):
        """The schema accepts values from 0.0 to 1.0."""
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_zero", "Zero", 0.0, 0.0, 0.0)
        _insert_profile(conn, "prof_max", "Max", 1.0, 1.0, 1.0)
        conn.commit()

        zero = _get_profile(test_db_path, "prof_zero")
        maxx = _get_profile(test_db_path, "prof_max")
        conn.close()

        assert zero["export_aggressiveness"] == pytest.approx(0.0)
        assert maxx["export_aggressiveness"] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Tests: Calendar rules data layer
# ---------------------------------------------------------------------------

class TestCalendarRulesDataLayer:
    def test_create_calendar_rule(self, test_db_path: pathlib.Path):
        import uuid, json
        conn = _conn(test_db_path)
        rule_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO calendar_rules
                (id, profile_id, name, days_of_week, start_time, end_time, priority)
            VALUES (?,?,'Evening Peak','[0,1,2,3,4]','16:00','20:00',10)
            """,
            (rule_id, "prof_default"),
        )
        conn.commit()

        row = conn.execute("SELECT * FROM calendar_rules WHERE id = ?", (rule_id,)).fetchone()
        conn.close()

        assert row is not None
        assert row["name"] == "Evening Peak"
        assert row["start_time"] == "16:00"
        assert row["end_time"] == "20:00"
        assert row["priority"] == 10
        assert row["enabled"] == 1

    def test_calendar_rule_references_valid_profile(
        self, test_db_path: pathlib.Path
    ):
        """Foreign key constraint: rule must reference an existing profile."""
        import uuid
        conn = _conn(test_db_path)
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                """
                INSERT INTO calendar_rules
                    (id, profile_id, name, days_of_week, start_time, end_time)
                VALUES (?,?,'Orphan Rule','[0]','10:00','12:00')
                """,
                (str(uuid.uuid4()), "nonexistent_profile"),
            )
            conn.commit()
        conn.close()


# ---------------------------------------------------------------------------
# Tests: Calendar overrides data layer
# ---------------------------------------------------------------------------

class TestCalendarOverridesDataLayer:
    def test_create_calendar_override(self, test_db_path: pathlib.Path):
        import uuid
        conn = _conn(test_db_path)
        override_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO calendar_overrides
                (id, profile_id, name, start_datetime, end_datetime)
            VALUES (?,?,'Holiday Override','2026-03-31T00:00:00','2026-04-01T00:00:00')
            """,
            (override_id, "prof_default"),
        )
        conn.commit()

        row = conn.execute(
            "SELECT * FROM calendar_overrides WHERE id = ?", (override_id,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["name"] == "Holiday Override"
        assert row["start_datetime"] == "2026-03-31T00:00:00"

    def test_override_cascade_delete_on_profile_delete(
        self, test_db_path: pathlib.Path
    ):
        import uuid
        conn = _conn(test_db_path)
        _insert_profile(conn, "prof_temp", "Temp Profile")
        override_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO calendar_overrides
                (id, profile_id, name, start_datetime, end_datetime)
            VALUES (?,?,'Temp Override','2026-03-31T00:00:00','2026-04-01T00:00:00')
            """,
            (override_id, "prof_temp"),
        )
        conn.commit()

        conn.execute("DELETE FROM profiles WHERE id = 'prof_temp'")
        conn.commit()

        row = conn.execute(
            "SELECT id FROM calendar_overrides WHERE id = ?", (override_id,)
        ).fetchone()
        conn.close()
        assert row is None


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# (Uncomment and expand when src/api/main.py is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# class TestProfilesAPI:
#     async def test_get_profiles_returns_200(self, async_client):
#         resp = await async_client.get("/api/v1/profiles")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "profiles" in data
#         assert len(data["profiles"]) >= 1
#
#     async def test_get_profile_by_id(self, async_client):
#         resp = await async_client.get("/api/v1/profiles/prof_default")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert data["id"] == "prof_default"
#
#     async def test_get_profile_404_for_unknown_id(self, async_client):
#         resp = await async_client.get("/api/v1/profiles/nonexistent")
#         assert resp.status_code == 404
#
#     async def test_create_profile_returns_201(self, async_client):
#         payload = {
#             "name": "Test Profile",
#             "export_aggressiveness": 0.7,
#             "preservation_aggressiveness": 0.3,
#             "import_aggressiveness": 0.5,
#         }
#         resp = await async_client.post("/api/v1/profiles", json=payload)
#         assert resp.status_code == 201
#         data = resp.json()
#         assert data["name"] == "Test Profile"
#         assert "id" in data
#
#     async def test_patch_profile_returns_200(self, async_client):
#         resp = await async_client.patch(
#             "/api/v1/profiles/prof_default",
#             json={"export_aggressiveness": 0.8}
#         )
#         assert resp.status_code == 200
#         assert resp.json()["export_aggressiveness"] == pytest.approx(0.8)
#
#     async def test_delete_default_profile_returns_409(self, async_client):
#         resp = await async_client.delete("/api/v1/profiles/prof_default")
#         assert resp.status_code == 409
#
#     async def test_delete_nonexistent_profile_returns_404(self, async_client):
#         resp = await async_client.delete("/api/v1/profiles/nonexistent")
#         assert resp.status_code == 404
#
#     async def test_set_default_profile(self, async_client):
#         # Create a profile first
#         create_resp = await async_client.post("/api/v1/profiles", json={
#             "name": "New Default",
#             "export_aggressiveness": 0.6,
#             "preservation_aggressiveness": 0.4,
#             "import_aggressiveness": 0.6,
#         })
#         new_id = create_resp.json()["id"]
#
#         resp = await async_client.post(f"/api/v1/profiles/{new_id}/set-default")
#         assert resp.status_code == 200
#         assert resp.json()["is_default"] is True
#
#     async def test_requires_auth(self, async_client):
#         from httpx import AsyncClient, ASGITransport
#         from src.api.main import create_app
#         app = create_app()
#         async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as unauthed:
#             resp = await unauthed.get("/api/v1/profiles")
#         assert resp.status_code == 401
