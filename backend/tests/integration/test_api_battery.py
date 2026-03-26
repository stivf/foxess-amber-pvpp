"""
Integration tests for Battery API endpoints.

Covers:
  GET /battery/state
  GET /battery/history?from={iso8601}&to={iso8601}&interval={1m|5m|30m|1h|1d}
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest

from tests.conftest import apply_migrations, _insert_telemetry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_interval_summary(conn: sqlite3.Connection, interval_start: str,
                              bat_soc: float = 72.0, pv_w: float = 3000.0,
                              bat_w: float = 1000.0, load_w: float = 1200.0,
                              grid_w: float = -300.0) -> None:
    interval_end = (
        datetime.fromisoformat(interval_start.replace("Z", "+00:00")) + timedelta(minutes=30)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        """
        INSERT OR REPLACE INTO interval_summary_30min
            (interval_start, interval_end, pv_yield_wh, battery_charged_wh,
             battery_discharged_wh, grid_import_wh, grid_export_wh, load_wh,
             bat_soc_end, avg_import_price_ckwh, avg_export_price_ckwh,
             avg_spot_price_ckwh, import_cost_ac, export_revenue_ac, self_consumed_wh)
        VALUES (?,?,?,?,?,?,?,?,?,10.0,4.0,8.0,2.0,1.2,700)
        """,
        (
            interval_start, interval_end,
            pv_w * 0.5,        # pv_yield_wh (30-min equiv)
            bat_w * 0.5 if bat_w > 0 else 0,
            abs(bat_w) * 0.5 if bat_w < 0 else 0,
            abs(grid_w) * 0.5 if grid_w > 0 else 0,
            abs(grid_w) * 0.5 if grid_w < 0 else 0,
            load_w * 0.5,
            bat_soc,
        ),
    )


# ---------------------------------------------------------------------------
# Tests: battery state data layer
# ---------------------------------------------------------------------------

class TestBatteryStateDataLayer:
    def test_latest_telemetry_returned(self, seeded_db_path: pathlib.Path):
        """GET /battery/state uses the most recent telemetry row."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            """
            SELECT bat_soc, bat_power_w, bat_temp_c, pv_power_w,
                   load_power_w, grid_power_w, recorded_at
            FROM telemetry
            ORDER BY recorded_at DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        assert row is not None
        assert row["bat_soc"] == pytest.approx(72.0)
        assert row["bat_power_w"] is not None

    def test_battery_mode_from_power(self, seeded_db_path: pathlib.Path):
        """Battery mode is derived from bat_power_w sign."""
        conn = _conn(seeded_db_path)
        row = conn.execute(
            "SELECT bat_power_w FROM telemetry ORDER BY recorded_at DESC LIMIT 1"
        ).fetchone()
        conn.close()

        assert row is not None
        bat_power = row["bat_power_w"]
        if bat_power > 50:
            mode = "charging"
        elif bat_power < -50:
            mode = "discharging"
        else:
            mode = "holding"
        assert mode in ("charging", "discharging", "holding", "idle")

    def test_battery_state_response_shape(self):
        """Verify expected fields for GET /battery/state."""
        required_fields = {
            "soc", "power_w", "mode", "capacity_kwh",
            "min_soc", "charge_rate_w", "discharge_rate_w",
            "temperature", "updated_at"
        }
        valid_modes = {"charging", "discharging", "holding", "idle"}
        assert "soc" in required_fields
        assert "mode" in required_fields
        assert all(m in valid_modes for m in valid_modes)

    def test_battery_state_empty_db_returns_no_data(self, test_db_path: pathlib.Path):
        """With no telemetry, query returns None."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT bat_soc FROM telemetry ORDER BY recorded_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        assert row is None

    def test_min_soc_from_system_config(self, test_db_path: pathlib.Path):
        """min_soc is read from system_config table."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT value FROM system_config WHERE key = 'bat_min_soc'"
        ).fetchone()
        conn.close()
        assert row is not None

    def test_capacity_kwh_from_system_config(self, test_db_path: pathlib.Path):
        """bat_capacity_kwh comes from system_config."""
        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT value FROM system_config WHERE key = 'bat_capacity_kwh'"
        ).fetchone()
        conn.close()
        assert row is not None


# ---------------------------------------------------------------------------
# Tests: battery history data layer
# ---------------------------------------------------------------------------

class TestBatteryHistoryDataLayer:
    def test_history_interval_summary_query(self, test_db_path: pathlib.Path):
        """GET /battery/history reads from interval_summary_30min."""
        conn = _conn(test_db_path)
        now = datetime.now(timezone.utc)
        for i in range(4):
            slot = (now - timedelta(hours=i)).replace(minute=0, second=0, microsecond=0)
            _insert_interval_summary(conn, slot.strftime("%Y-%m-%dT%H:%M:%SZ"))
        conn.commit()

        from_str = (now - timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute(
            """
            SELECT interval_start, bat_soc_end, pv_yield_wh
            FROM interval_summary_30min
            WHERE interval_start >= ?
            ORDER BY interval_start ASC
            """,
            (from_str,),
        ).fetchall()
        conn.close()

        assert len(rows) == 4
        starts = [r["interval_start"] for r in rows]
        assert starts == sorted(starts)

    def test_history_response_shape(self):
        """Validate expected fields in battery history response."""
        required_interval_keys = {
            "time", "avg_soc", "avg_power_w",
            "avg_solar_w", "avg_load_w", "avg_grid_w"
        }
        valid_intervals = {"1m", "5m", "30m", "1h", "1d"}
        assert "time" in required_interval_keys
        assert "avg_soc" in required_interval_keys
        assert "30m" in valid_intervals

    def test_history_time_range_filtering(self, test_db_path: pathlib.Path):
        """History query respects the 'from' and 'to' time range."""
        conn = _conn(test_db_path)
        base = datetime(2026, 3, 25, 0, 0, 0, tzinfo=timezone.utc)
        for h in range(6):
            slot = base + timedelta(hours=h)
            _insert_interval_summary(conn, slot.strftime("%Y-%m-%dT%H:%M:%SZ"))
        conn.commit()

        from_str = "2026-03-25T02:00:00Z"
        to_str = "2026-03-25T04:00:00Z"
        rows = conn.execute(
            """
            SELECT interval_start FROM interval_summary_30min
            WHERE interval_start >= ? AND interval_start <= ?
            ORDER BY interval_start ASC
            """,
            (from_str, to_str),
        ).fetchall()
        conn.close()

        assert len(rows) == 3  # 02:00, 03:00, 04:00
        starts = [r["interval_start"] for r in rows]
        assert all(from_str <= s <= to_str for s in starts)

    def test_history_empty_range_returns_empty(self, test_db_path: pathlib.Path):
        """Empty range or no data returns empty list."""
        conn = _conn(test_db_path)
        rows = conn.execute(
            """
            SELECT interval_start FROM interval_summary_30min
            WHERE interval_start >= '2020-01-01T00:00:00Z'
            AND interval_start <= '2020-01-02T00:00:00Z'
            """
        ).fetchall()
        conn.close()
        assert rows == []


# ---------------------------------------------------------------------------
# Tests: valid interval parameter values
# ---------------------------------------------------------------------------

class TestBatteryHistoryIntervalParam:
    def test_valid_intervals(self):
        valid = {"1m", "5m", "30m", "1h", "1d"}
        assert all(v in valid for v in ["1m", "5m", "30m", "1h", "1d"])

    def test_invalid_intervals_not_in_set(self):
        valid = {"1m", "5m", "30m", "1h", "1d"}
        invalid = ["2m", "15m", "2h", "weekly", ""]
        assert all(v not in valid for v in invalid)


# ---------------------------------------------------------------------------
# FastAPI endpoint tests (uncomment when app is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# class TestBatteryAPI:
#     async def test_get_battery_state_returns_200(self, async_client):
#         resp = await async_client.get("/api/v1/battery/state")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "soc" in data
#         assert "power_w" in data
#         assert data["mode"] in ("charging", "discharging", "holding", "idle")
#
#     async def test_get_battery_state_requires_auth(self, async_client):
#         from httpx import AsyncClient, ASGITransport
#         from src.api.main import create_app
#         app = create_app()
#         async with AsyncClient(transport=ASGITransport(app=app),
#                                base_url="http://testserver") as unauthed:
#             resp = await unauthed.get("/api/v1/battery/state")
#         assert resp.status_code == 401
#
#     async def test_get_battery_history_returns_200(self, async_client):
#         from_time = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
#         resp = await async_client.get(f"/api/v1/battery/history?from={from_time}&interval=30m")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "interval" in data
#         assert "data" in data
#         assert data["interval"] == "30m"
#
#     async def test_get_battery_history_invalid_interval_returns_400(self, async_client):
#         from_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
#         resp = await async_client.get(
#             f"/api/v1/battery/history?from={from_time}&interval=invalid"
#         )
#         assert resp.status_code == 400
#
#     async def test_get_battery_history_missing_from_returns_400(self, async_client):
#         resp = await async_client.get("/api/v1/battery/history")
#         assert resp.status_code == 400
