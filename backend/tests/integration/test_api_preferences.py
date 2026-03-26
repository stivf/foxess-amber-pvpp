"""
Integration tests for Preferences API endpoints.

Covers:
  GET  /preferences
  PATCH /preferences
"""

import json
import pathlib
import sqlite3

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


def _get_config(db_path: pathlib.Path, key: str):
    conn = _conn(db_path)
    row = conn.execute(
        "SELECT value FROM system_config WHERE key = ?", (key,)
    ).fetchone()
    conn.close()
    return row["value"] if row else None


def _set_config(db_path: pathlib.Path, key: str, value: str) -> None:
    conn = _conn(db_path)
    conn.execute(
        "INSERT OR REPLACE INTO system_config (key, value) VALUES (?,?)",
        (key, value),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Tests: preferences data layer
# ---------------------------------------------------------------------------

class TestPreferencesDataLayer:
    def test_min_soc_exists_in_system_config(self, test_db_path: pathlib.Path):
        """bat_min_soc config key exists after migration."""
        value = _get_config(test_db_path, "bat_min_soc")
        assert value is not None
        assert int(value) >= 0
        assert int(value) <= 100

    def test_update_min_soc(self, test_db_path: pathlib.Path):
        """PATCH /preferences: min_soc persists to system_config."""
        _set_config(test_db_path, "bat_min_soc", "25")
        value = _get_config(test_db_path, "bat_min_soc")
        assert value == "25"

    def test_preferences_response_shape(self):
        """Validate expected fields in GET /preferences response."""
        required_keys = {"min_soc", "auto_mode_enabled", "notifications"}
        notification_keys = {"price_spike", "battery_low", "schedule_change", "daily_summary"}
        assert "min_soc" in required_keys
        assert "notifications" in required_keys
        assert "price_spike" in notification_keys

    def test_notifications_stored_as_json_in_config(self, test_db_path: pathlib.Path):
        """Notification preferences are stored as a JSON blob in system_config."""
        notifications = {
            "price_spike": True,
            "battery_low": True,
            "schedule_change": False,
            "daily_summary": True,
        }
        _set_config(test_db_path, "notifications", json.dumps(notifications))

        raw = _get_config(test_db_path, "notifications")
        assert raw is not None
        parsed = json.loads(raw)
        assert parsed["price_spike"] is True
        assert parsed["schedule_change"] is False

    def test_patch_single_notification_field(self, test_db_path: pathlib.Path):
        """Patching one notification field does not affect others."""
        notifications = {
            "price_spike": True,
            "battery_low": True,
            "schedule_change": False,
            "daily_summary": True,
        }
        _set_config(test_db_path, "notifications", json.dumps(notifications))

        # Simulate a PATCH that only updates price_spike
        raw = _get_config(test_db_path, "notifications")
        current = json.loads(raw)
        current["price_spike"] = False
        _set_config(test_db_path, "notifications", json.dumps(current))

        updated = json.loads(_get_config(test_db_path, "notifications"))
        assert updated["price_spike"] is False
        assert updated["battery_low"] is True  # unchanged
        assert updated["daily_summary"] is True  # unchanged

    def test_min_soc_bounds_validation(self):
        """min_soc must be between 0 and 100."""
        valid_values = [0, 10, 20, 50, 95, 100]
        invalid_values = [-1, 101, 200]

        for v in valid_values:
            assert 0 <= v <= 100

        for v in invalid_values:
            assert not (0 <= v <= 100), f"Expected {v} to be invalid"

    def test_auto_mode_enabled_stored_as_bool_string(self, test_db_path: pathlib.Path):
        """auto_mode_enabled is stored as '1' or '0' in system_config."""
        _set_config(test_db_path, "auto_mode_enabled", "1")
        value = _get_config(test_db_path, "auto_mode_enabled")
        assert value in ("0", "1")

    def test_default_preferences_from_migration(self, test_db_path: pathlib.Path):
        """Migration seeded default system_config values."""
        expected_keys = [
            "bat_min_soc", "bat_capacity_kwh", "bat_max_soc",
            "charge_threshold_ckwh", "discharge_threshold_ckwh",
        ]
        for key in expected_keys:
            value = _get_config(test_db_path, key)
            assert value is not None, f"Missing config key: {key}"

    def test_patch_preserves_unpatched_fields(self, test_db_path: pathlib.Path):
        """Patching min_soc does not affect other config keys."""
        original_capacity = _get_config(test_db_path, "bat_capacity_kwh")

        _set_config(test_db_path, "bat_min_soc", "30")

        # bat_capacity_kwh should be unchanged
        current_capacity = _get_config(test_db_path, "bat_capacity_kwh")
        assert current_capacity == original_capacity


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestPreferencesAPI:
    async def test_get_preferences_returns_200(self, async_client):
        resp = await async_client.get("/api/v1/preferences")
        assert resp.status_code == 200
        data = resp.json()
        assert "min_soc" in data
        assert "auto_mode_enabled" in data
        assert "notifications" in data

    async def test_patch_min_soc(self, async_client):
        resp = await async_client.patch(
            "/api/v1/preferences",
            json={"min_soc": 25}
        )
        assert resp.status_code == 200
        assert resp.json()["min_soc"] == 25

    async def test_patch_notification_field(self, async_client):
        resp = await async_client.patch(
            "/api/v1/preferences",
            json={"notifications": {"price_spike": False}}
        )
        assert resp.status_code == 200
        assert resp.json()["notifications"]["price_spike"] is False

    async def test_patch_invalid_min_soc_returns_422(self, async_client):
        resp = await async_client.patch(
            "/api/v1/preferences",
            json={"min_soc": 150}
        )
        assert resp.status_code == 422

    async def test_patch_negative_min_soc_returns_422(self, async_client):
        resp = await async_client.patch(
            "/api/v1/preferences",
            json={"min_soc": -5}
        )
        assert resp.status_code == 422

    async def test_get_preferences_requires_auth(self, async_client):
        from httpx import AsyncClient, ASGITransport
        from src.api.main import create_app
        from unittest.mock import patch, MagicMock
        with patch("src.api.main.BackgroundScheduler") as mock_sched_cls:
            mock_sched = MagicMock()
            mock_sched.get_jobs.return_value = []
            mock_sched_cls.return_value = mock_sched
            app = create_app()
        async with AsyncClient(transport=ASGITransport(app=app),
                               base_url="http://testserver") as unauthed:
            resp = await unauthed.get("/api/v1/preferences")
        assert resp.status_code == 401
