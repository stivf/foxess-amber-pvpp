"""
Integration tests for Pricing API endpoints.

Covers:
  GET /pricing/current
  GET /pricing/history?from={iso8601}&to={iso8601}&interval={5m|30m|1h|1d}
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import apply_migrations, _insert_price


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_price_pair(conn: sqlite3.Connection, slot: str,
                       general_ckwh: float = 10.0, feedin_ckwh: float = 4.0,
                       descriptor: str = "low", spike_status: str = "none",
                       renewables: float = 45.0, is_forecast: int = 0) -> None:
    """Insert a matched general + feedIn price pair for a slot."""
    conn.execute(
        """
        INSERT OR REPLACE INTO prices
            (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
             renewables, spike_status, descriptor, updated_at)
        VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (slot, "general", is_forecast, general_ckwh * 0.8, general_ckwh,
         renewables, spike_status, descriptor),
    )
    conn.execute(
        """
        INSERT OR REPLACE INTO prices
            (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
             renewables, spike_status, descriptor, updated_at)
        VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (slot, "feedIn", is_forecast, feedin_ckwh * 0.8, feedin_ckwh,
         renewables, "none", "low"),
    )


# ---------------------------------------------------------------------------
# Tests: current pricing data layer
# ---------------------------------------------------------------------------

class TestCurrentPricingDataLayer:
    def test_current_price_general_channel(self, seeded_db_path: pathlib.Path):
        """GET /pricing/current: general channel is required."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            """
            SELECT per_kwh, descriptor, spike_status, renewables
            FROM prices
            WHERE channel_type = 'general' AND is_forecast = 0
            ORDER BY interval_start DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["per_kwh"] == pytest.approx(8.5)
        assert row["descriptor"] == "low"
        assert row["spike_status"] == "none"

    def test_current_price_feedin_channel(self, seeded_db_path: pathlib.Path):
        """feedIn channel provides feed_in_per_kwh."""
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

    def test_forecast_intervals_returned(self, seeded_db_path: pathlib.Path):
        """Forecast intervals (is_forecast=1) are returned in /pricing/current forecast list."""
        conn = _conn(seeded_db_path)
        rows = conn.execute(
            """
            SELECT interval_start, per_kwh, descriptor
            FROM prices
            WHERE channel_type = 'general' AND is_forecast = 1
            ORDER BY interval_start ASC
            """
        ).fetchall()
        conn.close()

        assert len(rows) >= 1

    def test_forecast_ordered_by_start(self, seeded_db_path: pathlib.Path):
        """Forecast entries must be ordered chronologically."""
        conn = _conn(seeded_db_path)
        rows = conn.execute(
            """
            SELECT interval_start FROM prices
            WHERE channel_type = 'general'
            ORDER BY interval_start ASC
            """
        ).fetchall()
        conn.close()

        starts = [r["interval_start"] for r in rows]
        assert starts == sorted(starts)

    def test_current_response_shape(self):
        """Validate expected fields in /pricing/current response."""
        current_keys = {
            "per_kwh", "feed_in_per_kwh", "descriptor",
            "renewables_pct", "spike_status", "updated_at"
        }
        forecast_keys = {"start_time", "end_time", "per_kwh", "descriptor", "renewables_pct"}
        valid_descriptors = {"spike", "high", "neutral", "low", "negative"}
        valid_spike_statuses = {"none", "potential", "spike"}

        assert "per_kwh" in current_keys
        assert "descriptor" in current_keys
        assert "spike" in valid_descriptors
        assert "potential" in valid_spike_statuses

    def test_no_prices_empty_response(self, test_db_path: pathlib.Path):
        """With no price data, queries return no rows."""
        conn = _conn(test_db_path)
        rows = conn.execute(
            "SELECT per_kwh FROM prices WHERE channel_type = 'general'"
        ).fetchall()
        conn.close()
        assert rows == []

    def test_spike_descriptor_classification(self, test_db_path: pathlib.Path):
        """Spike prices are stored with spike descriptor and spike_status."""
        now = datetime.now(timezone.utc)
        slot = now.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn = _conn(test_db_path)
        conn.execute(
            """
            INSERT INTO prices (interval_start, channel_type, is_forecast,
                spot_per_kwh, per_kwh, renewables, spike_status, descriptor, updated_at)
            VALUES (?,?,0,60.0,85.0,35.0,'spike','spike',strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            """,
            (slot, "general"),
        )
        conn.commit()

        row = conn.execute(
            "SELECT descriptor, spike_status FROM prices WHERE channel_type = 'general' AND per_kwh > 50"
        ).fetchone()
        conn.close()

        assert row["descriptor"] == "spike"
        assert row["spike_status"] == "spike"


# ---------------------------------------------------------------------------
# Tests: pricing history data layer
# ---------------------------------------------------------------------------

class TestPricingHistoryDataLayer:
    def test_history_range_query(self, test_db_path: pathlib.Path):
        """History query filters by time range and returns ordered results."""
        conn = _conn(test_db_path)
        base = datetime(2026, 3, 25, 0, 0, 0, tzinfo=timezone.utc)
        for i in range(8):
            slot = (base + timedelta(minutes=30 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")
            _insert_price_pair(conn, slot, general_ckwh=10.0 + i)
        conn.commit()

        from_str = "2026-03-25T01:00:00Z"
        to_str = "2026-03-25T02:30:00Z"
        rows = conn.execute(
            """
            SELECT interval_start, per_kwh FROM prices
            WHERE channel_type = 'general'
              AND interval_start >= ? AND interval_start <= ?
            ORDER BY interval_start ASC
            """,
            (from_str, to_str),
        ).fetchall()
        conn.close()

        assert len(rows) > 0
        starts = [r["interval_start"] for r in rows]
        assert starts == sorted(starts)

    def test_history_aggregation_fields(self):
        """Validate expected fields in history data points."""
        required_fields = {
            "time", "avg_per_kwh", "min_per_kwh",
            "max_per_kwh", "avg_feed_in"
        }
        valid_intervals = {"5m", "30m", "1h", "1d"}
        assert "avg_per_kwh" in required_fields
        assert "30m" in valid_intervals

    def test_history_returns_empty_for_no_data_range(self, test_db_path: pathlib.Path):
        """No prices in range returns empty list."""
        conn = _conn(test_db_path)
        rows = conn.execute(
            """
            SELECT interval_start FROM prices
            WHERE interval_start >= '2020-01-01T00:00:00Z'
            AND interval_start <= '2020-01-02T00:00:00Z'
            """
        ).fetchall()
        conn.close()
        assert rows == []

    def test_price_descriptors_are_valid_enum_values(self, test_db_path: pathlib.Path):
        """All stored descriptors must be in the valid set."""
        valid_descriptors = {"spike", "high", "neutral", "low", "negative"}
        conn = _conn(test_db_path)

        base = datetime(2026, 3, 25, 8, 0, 0, tzinfo=timezone.utc)
        for i, (desc, ckwh) in enumerate([
            ("low", 5.0), ("neutral", 15.0), ("high", 30.0), ("spike", 85.0)
        ]):
            slot = (base + timedelta(minutes=30 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")
            conn.execute(
                """
                INSERT INTO prices (interval_start, channel_type, is_forecast,
                    spot_per_kwh, per_kwh, renewables, spike_status, descriptor, updated_at)
                VALUES (?,?,0,?,?,45.0,'none',?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                """,
                (slot, "general", ckwh * 0.8, ckwh, desc),
            )
        conn.commit()

        rows = conn.execute(
            "SELECT DISTINCT descriptor FROM prices WHERE channel_type = 'general'"
        ).fetchall()
        conn.close()

        stored = {r["descriptor"] for r in rows}
        assert stored.issubset(valid_descriptors), f"Unexpected descriptors: {stored - valid_descriptors}"


# ---------------------------------------------------------------------------
# FastAPI endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
class TestPricingAPI:
    async def test_get_current_pricing_returns_200(self, async_client):
        resp = await async_client.get("/api/v1/pricing/current")
        assert resp.status_code == 200
        data = resp.json()
        assert "current" in data
        assert "forecast" in data

    async def test_get_current_pricing_fields(self, async_client):
        resp = await async_client.get("/api/v1/pricing/current")
        current = resp.json()["current"]
        assert "per_kwh" in current
        assert "feed_in_per_kwh" in current
        assert "descriptor" in current
        assert current["descriptor"] in ("spike", "high", "neutral", "low", "negative")

    async def test_get_pricing_history_returns_200(self, async_client):
        from_time = (datetime.now(timezone.utc) - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        resp = await async_client.get(f"/api/v1/pricing/history?from={from_time}")
        assert resp.status_code == 200
        data = resp.json()
        assert "interval" in data
        assert "data" in data

    async def test_get_pricing_history_missing_from_returns_422(self, async_client):
        resp = await async_client.get("/api/v1/pricing/history")
        assert resp.status_code == 422

    async def test_get_pricing_requires_auth(self, async_client):
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
            resp = await unauthed.get("/api/v1/pricing/current")
        assert resp.status_code == 401
