"""
Integration tests for the FoxESSCollector data pipeline.

Uses a real in-memory SQLite DB and mocked foxesscloud SDK.
Tests Bronze/Silver write paths, budget integration, and error handling.
"""

import sqlite3
import pathlib
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from src.pipeline.foxess_collector import FoxESSCollector
from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DEVICE_DATA = {
    "pvPower": 3200.0,
    "batChargePower": 1500.0,
    "batDischargePower": 0.0,
    "gridConsumptionPower": 0.0,
    "feedinPower": 500.0,
    "loadsPower": 1200.0,
    "epsPower": 0.0,
    "SoC": 72.0,
    "batTemperature": 28.5,
    "batVolt": 51.2,
    "batCurrent": 29.3,
    "ambientTemperation": 35.0,
    "gridVoltage": 230.5,
    "gridFrequency": 50.0,
    "workMode": "Self Use",
    "todayYield": 12.5,
    "chargeEnergyToday": 8.0,
    "dischargeEnergyToday": 3.0,
    "gridConsumptionEnergyToday": 1.5,
    "feedinEnergyToday": 5.0,
    "time": "2026-03-25T10:06:00Z",
}


def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Tests: run_once() without budget
# ---------------------------------------------------------------------------

class TestFoxESSCollectorRunOnce:
    def test_successful_run_inserts_bronze_and_silver(
        self, test_db_path: pathlib.Path
    ):
        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            result = collector.run_once()

        assert result["status"] == "success"

        conn = _conn(test_db_path)
        bronze = conn.execute("SELECT COUNT(*) FROM raw_foxess_telemetry").fetchone()[0]
        silver = conn.execute("SELECT COUNT(*) FROM telemetry").fetchone()[0]
        conn.close()

        assert bronze == 1
        assert silver == 1

    def test_telemetry_values_are_normalised_correctly(
        self, test_db_path: pathlib.Path
    ):
        """bat_power_w = batChargePower - batDischargePower (positive = charging)."""
        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            t = collector.fetch_realtime()

        assert t["pv_power_w"] == pytest.approx(3200.0)
        # bat_power_w = 1500 (charge) - 0 (discharge) = 1500
        assert t["bat_power_w"] == pytest.approx(1500.0)
        # grid_power_w = 0 (import) - 500 (feedin/export) = -500
        assert t["grid_power_w"] == pytest.approx(-500.0)
        assert t["bat_soc"] == pytest.approx(72.0)

    def test_discharging_produces_negative_bat_power(
        self, test_db_path: pathlib.Path
    ):
        """When battery is discharging: bat_power_w should be negative."""
        discharging = dict(DEVICE_DATA)
        discharging["batChargePower"] = 0.0
        discharging["batDischargePower"] = 2000.0

        with patch("src.pipeline.foxess_collector.f.get_real", return_value=discharging):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            t = collector.fetch_realtime()

        assert t["bat_power_w"] == pytest.approx(-2000.0)

    def test_none_sdk_response_raises_runtime_error(self, test_db_path: pathlib.Path):
        with patch("src.pipeline.foxess_collector.f.get_real", return_value=None):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            with pytest.raises(RuntimeError, match="foxesscloud SDK returned None"):
                collector.fetch_realtime()

    def test_run_once_handles_sdk_exception_gracefully(
        self, test_db_path: pathlib.Path
    ):
        with patch("src.pipeline.foxess_collector.f.get_real", side_effect=Exception("Connection refused")):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            result = collector.run_once()

        assert result["status"] == "failed"
        assert "Connection refused" in result["error"]

    def test_pipeline_run_logged_on_success(self, test_db_path: pathlib.Path):
        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            collector.run_once()

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT status FROM pipeline_runs WHERE pipeline = 'foxess_telemetry' "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        assert row["status"] == "success"

    def test_pipeline_run_logged_on_failure(self, test_db_path: pathlib.Path):
        with patch("src.pipeline.foxess_collector.f.get_real", side_effect=Exception("Timeout")):
            collector = FoxESSCollector("key", "token", "SN001", db_path=test_db_path)
            collector.run_once()

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT status, error_message FROM pipeline_runs WHERE pipeline = 'foxess_telemetry' "
            "ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        assert row["status"] == "failed"
        assert "Timeout" in row["error_message"]


# ---------------------------------------------------------------------------
# Tests: budget integration
# ---------------------------------------------------------------------------

class TestFoxESSCollectorBudget:
    def test_run_once_skips_poll_when_budget_exhausted(
        self, test_db_path: pathlib.Path
    ):
        mock_budget = MagicMock()
        mock_budget.can_poll.return_value = False

        with patch("src.pipeline.foxess_collector.f.get_real") as mock_get:
            collector = FoxESSCollector("key", "token", "SN001",
                                         db_path=test_db_path, budget=mock_budget)
            result = collector.run_once()

            # SDK should NOT be called when budget is exhausted
            mock_get.assert_not_called()

        assert result["status"] == "budget_skip"

    def test_run_once_calls_sdk_when_budget_allows(
        self, test_db_path: pathlib.Path
    ):
        mock_budget = MagicMock()
        mock_budget.can_poll.return_value = True

        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA):
            collector = FoxESSCollector("key", "token", "SN001",
                                         db_path=test_db_path, budget=mock_budget)
            result = collector.run_once()

        assert result["status"] == "success"

    def test_budget_record_call_invoked_on_successful_poll(
        self, test_db_path: pathlib.Path
    ):
        mock_budget = MagicMock()
        mock_budget.can_poll.return_value = True

        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA):
            collector = FoxESSCollector("key", "token", "SN001",
                                         db_path=test_db_path, budget=mock_budget)
            collector.run_once()

        mock_budget.record_call.assert_called_once_with("poll")

    def test_budget_record_call_not_invoked_on_sdk_failure(
        self, test_db_path: pathlib.Path
    ):
        """record_call should NOT be called if the SDK raises an error."""
        mock_budget = MagicMock()
        mock_budget.can_poll.return_value = True

        with patch("src.pipeline.foxess_collector.f.get_real", side_effect=Exception("Error")):
            collector = FoxESSCollector("key", "token", "SN001",
                                         db_path=test_db_path, budget=mock_budget)
            collector.run_once()

        mock_budget.record_call.assert_not_called()

    def test_no_budget_polls_freely(self, test_db_path: pathlib.Path):
        """Without a budget object, the collector should always poll."""
        with patch("src.pipeline.foxess_collector.f.get_real", return_value=DEVICE_DATA) as mock_sdk:
            collector = FoxESSCollector("key", "token", "SN001",
                                         db_path=test_db_path, budget=None)
            result = collector.run_once()

        assert result["status"] == "success"
        mock_sdk.assert_called_once()
