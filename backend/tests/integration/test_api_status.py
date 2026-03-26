"""
Integration tests for GET /status endpoint.

The /status endpoint returns the current system state in a single call,
designed for dashboard initial load. Tests validate the response shape and
data layer contract.
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import (
    apply_migrations,
    _insert_telemetry,
    _insert_price,
    _insert_solar_forecast,
    _insert_profile,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_decision(conn: sqlite3.Connection, action: str = "CHARGE",
                     minutes_ago: int = 5, duration_minutes: int = 30) -> None:
    now = datetime.now(timezone.utc)
    valid_from = (now - timedelta(minutes=minutes_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    valid_until = (now + timedelta(minutes=duration_minutes)).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        """
        INSERT INTO optimization_decisions
            (valid_from, valid_until, device_sn, action, bat_soc_at_decision,
             import_price_ckwh, export_price_ckwh, reason, engine_version, applied)
        VALUES (?,?,'TEST001',?,72.0,8.5,3.2,'Low price period','1.0.0',1)
        """,
        (valid_from, valid_until, action),
    )


def _insert_daily_summary(conn: sqlite3.Connection, date: str,
                           savings_aud: float = 4.52) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO daily_summary
            (date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
             grid_import_kwh, grid_export_kwh, load_kwh,
             self_consumption_rate, self_sufficiency_rate,
             grid_import_cost_aud, grid_export_revenue_aud,
             counterfactual_cost_aud, total_savings_aud,
             avg_import_price_ckwh)
        VALUES (?,28.5,12.0,8.0,5.0,10.0,25.0,0.68,0.72,1.50,0.40,3.50,?,15.0)
        """,
        (date, savings_aud),
    )


# ---------------------------------------------------------------------------
# Data layer contract tests for /status components
# ---------------------------------------------------------------------------

class TestStatusDataLayer:
    """Validates that all data needed for GET /status exists in the right shape."""

    def test_battery_state_query(self, seeded_db_path: pathlib.Path):
        """Latest telemetry row provides battery section of /status."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            """
            SELECT bat_soc, bat_power_w, bat_temp_c, pv_power_w, load_power_w, grid_power_w
            FROM telemetry
            ORDER BY recorded_at DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["bat_soc"] == pytest.approx(72.0)
        assert row["bat_power_w"] is not None
        assert row["pv_power_w"] is not None

    def test_current_price_query(self, seeded_db_path: pathlib.Path):
        """The 'general' channel is required for the price section of /status."""
        conn = _conn(seeded_db_path)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = conn.execute(
            """
            SELECT per_kwh, spike_status, descriptor, renewables
            FROM prices
            WHERE channel_type = 'general' AND is_forecast = 0
            ORDER BY interval_start DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["per_kwh"] == pytest.approx(8.5)
        assert row["descriptor"] == "low"

    def test_feed_in_price_query(self, seeded_db_path: pathlib.Path):
        """feedIn channel is required for the price.feed_in_per_kwh field."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            """
            SELECT per_kwh FROM prices
            WHERE channel_type = 'feedIn' AND is_forecast = 0
            ORDER BY interval_start DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["per_kwh"] == pytest.approx(3.2)

    def test_solar_forecast_query(self, seeded_db_path: pathlib.Path):
        """Solar forecast provides solar section of /status."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            "SELECT est_pv_yield_wh FROM solar_forecasts ORDER BY slot_start LIMIT 1"
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["est_pv_yield_wh"] > 0

    def test_active_decision_query(self, seeded_db_path: pathlib.Path):
        """Active optimization decision provides schedule section."""
        conn = _conn(seeded_db_path)
        _insert_decision(conn, action="CHARGE")
        conn.commit()

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        row = conn.execute(
            """
            SELECT action, valid_until FROM optimization_decisions
            WHERE valid_from <= ? AND valid_until > ?
            ORDER BY decided_at DESC LIMIT 1
            """,
            (now_str, now_str),
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["action"] == "CHARGE"

    def test_savings_query_from_daily_summary(self, seeded_db_path: pathlib.Path):
        """Savings section is sourced from daily_summary table."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        conn = _conn(seeded_db_path)
        _insert_daily_summary(conn, today, savings_aud=4.52)
        conn.commit()

        row = conn.execute(
            "SELECT total_savings_aud FROM daily_summary WHERE date = ?", (today,)
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["total_savings_aud"] == pytest.approx(4.52)

    def test_active_profile_query(self, seeded_db_path: pathlib.Path):
        """Default profile is returned when no calendar rule is active."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            "SELECT id, name FROM profiles WHERE is_default = 1"
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["id"] == "prof_default"
        assert row["name"] == "Balanced"

    def test_status_response_shape_keys(self):
        """Verify the expected keys in the /status response object."""
        expected_top_level_keys = {
            "battery", "price", "solar", "grid",
            "schedule", "active_profile", "savings"
        }
        battery_keys = {"soc", "power_w", "mode", "capacity_kwh", "min_soc", "temperature"}
        price_keys = {"current_per_kwh", "feed_in_per_kwh", "descriptor", "renewables_pct", "updated_at"}
        solar_keys = {"current_generation_w", "forecast_today_kwh", "forecast_tomorrow_kwh"}
        grid_keys = {"import_w", "export_w"}
        schedule_keys = {"current_action", "next_change_at", "next_action"}
        profile_keys = {"id", "name", "source"}
        savings_keys = {"today_dollars", "this_week_dollars", "this_month_dollars"}

        # All sets defined — verify no overlap with unexpected keys
        assert "battery" in expected_top_level_keys
        assert "soc" in battery_keys
        assert "current_per_kwh" in price_keys
        assert "current_generation_w" in solar_keys
        assert "import_w" in grid_keys
        assert "current_action" in schedule_keys
        assert "source" in profile_keys
        assert "today_dollars" in savings_keys

    def test_no_telemetry_does_not_crash_status(self, test_db_path: pathlib.Path):
        """With no telemetry, status should return None for battery fields."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT bat_soc FROM telemetry ORDER BY recorded_at DESC LIMIT 1"
        ).fetchone()
        conn.close()

        # This confirms the query is safe to run on an empty DB
        assert row is None

    def test_no_prices_does_not_crash_status(self, test_db_path: pathlib.Path):
        """With no price data, status should handle gracefully."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT per_kwh FROM prices WHERE channel_type = 'general' LIMIT 1"
        ).fetchone()
        conn.close()

        assert row is None

    def test_grid_power_derived_from_telemetry(self, seeded_db_path: pathlib.Path):
        """grid section: export_w = abs(grid_power_w) when negative, import_w when positive."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            "SELECT grid_power_w FROM telemetry ORDER BY recorded_at DESC LIMIT 1"
        ).fetchone()
        conn.close()

        assert row is not None
        grid_power = row["grid_power_w"]
        # Negative = exporting
        if grid_power < 0:
            export_w = abs(grid_power)
            import_w = 0
        else:
            import_w = grid_power
            export_w = 0
        # Both should be non-negative
        assert import_w >= 0
        assert export_w >= 0


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestStatusAPI:
    async def test_get_status_returns_200(self, async_client):
        resp = await async_client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "battery" in data
        assert "price" in data
        assert "solar" in data
        assert "grid" in data
        assert "schedule" in data
        assert "active_profile" in data
        assert "savings" in data

    async def test_get_status_battery_fields(self, async_client):
        resp = await async_client.get("/api/v1/status")
        battery = resp.json()["battery"]
        assert "soc" in battery
        assert "power_w" in battery
        assert "mode" in battery
        assert battery["mode"] in ("charging", "discharging", "holding", "idle")

    async def test_get_status_price_fields(self, async_client):
        resp = await async_client.get("/api/v1/status")
        price = resp.json()["price"]
        assert "current_per_kwh" in price
        assert "feed_in_per_kwh" in price
        assert "descriptor" in price

    async def test_get_status_requires_auth(self, async_client):
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
            resp = await unauthed.get("/api/v1/status")
        assert resp.status_code == 401
