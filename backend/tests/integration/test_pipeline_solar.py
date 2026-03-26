"""
Integration tests for the SolarForecastCollector data pipeline.

Uses a real in-memory SQLite DB and mocked httpx.get() for Open-Meteo.
Tests Bronze/Silver write paths, PV yield computation, and error handling.
"""

import json
import sqlite3
import pathlib
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.pipeline.solar_forecast_collector import SolarForecastCollector
from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_open_meteo_response(n_slots: int = 48) -> dict:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    times = [(now + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(n_slots)]
    return {
        "hourly": {
            "time": times,
            "shortwave_radiation": [500.0] * n_slots,
            "direct_normal_irradiance": [400.0] * n_slots,
            "diffuse_radiation": [100.0] * n_slots,
            "temperature_2m": [25.0] * n_slots,
            "cloudcover": [10.0] * n_slots,
        }
    }


def _mock_httpx_response(data: dict) -> MagicMock:
    mock_resp = MagicMock()
    mock_resp.json.return_value = data
    mock_resp.raise_for_status = MagicMock()
    return mock_resp


def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSolarForecastCollectorRunOnce:
    def test_successful_run_inserts_bronze_and_silver(
        self, test_db_path: pathlib.Path
    ):
        response_data = _make_open_meteo_response(48)
        mock_resp = _mock_httpx_response(response_data)

        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            result = collector.run_once()

        assert result["status"] == "success"
        assert result["rows_ingested"] == 48

        conn = _conn(test_db_path)
        bronze = conn.execute("SELECT COUNT(*) FROM raw_solar_forecasts").fetchone()[0]
        silver = conn.execute("SELECT COUNT(*) FROM solar_forecasts").fetchone()[0]
        conn.close()

        assert bronze == 48
        assert silver == 48

    def test_pv_yield_is_computed_correctly(self, test_db_path: pathlib.Path):
        """est_pv_yield_wh = GHI * (capacity/1000) * efficiency * 1.0h."""
        response_data = _make_open_meteo_response(1)
        response_data["hourly"]["shortwave_radiation"] = [1000.0]  # STC conditions

        mock_resp = _mock_httpx_response(response_data)
        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02,
                                               panel_capacity_w=6600.0,
                                               system_efficiency=0.80,
                                               db_path=test_db_path)
            slots = collector.fetch_forecast()

        assert len(slots) == 1
        # At STC: 1000 * (6600/1000) * 0.80 * 1.0 = 5280 Wh
        assert slots[0]["est_pv_yield_wh"] == pytest.approx(5280.0)

    def test_zero_ghi_produces_zero_yield(self, test_db_path: pathlib.Path):
        response_data = _make_open_meteo_response(1)
        response_data["hourly"]["shortwave_radiation"] = [0.0]

        mock_resp = _mock_httpx_response(response_data)
        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            slots = collector.fetch_forecast()

        assert slots[0]["est_pv_yield_wh"] == 0.0

    def test_upsert_silver_updates_on_re_run(self, test_db_path: pathlib.Path):
        """Running twice for same time slot should update, not duplicate."""
        response_data = _make_open_meteo_response(2)

        mock_resp = _mock_httpx_response(response_data)
        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            collector.run_once()
            collector.run_once()

        conn = _conn(test_db_path)
        count = conn.execute("SELECT COUNT(*) FROM solar_forecasts").fetchone()[0]
        conn.close()
        # Should have 2 rows (not 4), because the second run upserts
        assert count == 2

    def test_pipeline_run_logged_on_success(self, test_db_path: pathlib.Path):
        mock_resp = _mock_httpx_response(_make_open_meteo_response(1))
        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            collector.run_once()

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT status FROM pipeline_runs WHERE pipeline = 'solar_forecast' "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        assert row["status"] == "success"

    def test_run_once_handles_http_error_gracefully(self, test_db_path: pathlib.Path):
        with patch("src.pipeline.solar_forecast_collector.httpx.get",
                   side_effect=Exception("Connection timeout")):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            result = collector.run_once()

        assert result["status"] == "failed"
        assert "Connection timeout" in result["error"]

    def test_pipeline_run_logged_on_failure(self, test_db_path: pathlib.Path):
        with patch("src.pipeline.solar_forecast_collector.httpx.get",
                   side_effect=Exception("DNS failure")):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            collector.run_once()

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT status, error_message FROM pipeline_runs WHERE pipeline = 'solar_forecast' "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        assert row["status"] == "failed"

    def test_slot_start_format_ends_with_z(self, test_db_path: pathlib.Path):
        """All slot_start values stored in Silver must be UTC ISO8601 with Z suffix."""
        mock_resp = _mock_httpx_response(_make_open_meteo_response(3))
        with patch("src.pipeline.solar_forecast_collector.httpx.get", return_value=mock_resp):
            collector = SolarForecastCollector(-27.47, 153.02, db_path=test_db_path)
            collector.run_once()

        conn = _conn(test_db_path)
        rows = conn.execute("SELECT slot_start FROM solar_forecasts").fetchall()
        conn.close()
        for row in rows:
            assert row["slot_start"].endswith("Z"), f"slot_start should end with Z: {row['slot_start']}"
