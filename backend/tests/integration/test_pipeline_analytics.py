"""
Integration tests for analytics query functions.

Tests all query functions in src/pipeline/analytics.py against a seeded
test database. Verifies return shapes, value correctness, and edge cases.
"""

import sqlite3
import pathlib
from datetime import datetime, timezone, timedelta

import pytest

from src.pipeline import analytics
from tests.conftest import (
    apply_migrations, _insert_price, _insert_telemetry,
    _insert_solar_forecast, _insert_profile,
)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ---------------------------------------------------------------------------
# Tests: get_current_state
# ---------------------------------------------------------------------------

class TestGetCurrentState:
    def test_returns_telemetry_and_prices_when_data_exists(
        self, seeded_db_path: pathlib.Path
    ):
        result = analytics.get_current_state(db_path=seeded_db_path)

        assert result["telemetry"] is not None
        assert "bat_soc" in result["telemetry"]
        assert result["telemetry"]["bat_soc"] == pytest.approx(72.0)
        assert "prices" in result
        assert "updated_at" in result

    def test_returns_none_telemetry_when_no_data(self, test_db_path: pathlib.Path):
        result = analytics.get_current_state(db_path=test_db_path)
        assert result["telemetry"] is None

    def test_prices_keyed_by_channel_type(self, seeded_db_path: pathlib.Path):
        result = analytics.get_current_state(db_path=seeded_db_path)
        prices = result["prices"]
        # Should have at least 'general' channel
        assert "general" in prices
        assert "per_kwh" in prices["general"]


# ---------------------------------------------------------------------------
# Tests: get_price_feed
# ---------------------------------------------------------------------------

class TestGetPriceFeed:
    def test_returns_list_of_price_intervals(self, seeded_db_path: pathlib.Path):
        result = analytics.get_price_feed(hours_ahead=24, db_path=seeded_db_path)
        assert isinstance(result, list)
        assert len(result) > 0
        first = result[0]
        assert "interval_start" in first
        assert "channel_type" in first
        assert "per_kwh" in first

    def test_returns_empty_list_when_no_prices(self, test_db_path: pathlib.Path):
        result = analytics.get_price_feed(db_path=test_db_path)
        assert result == []

    def test_intervals_ordered_by_start_time(self, seeded_db_path: pathlib.Path):
        result = analytics.get_price_feed(db_path=seeded_db_path)
        starts = [r["interval_start"] for r in result]
        assert starts == sorted(starts)


# ---------------------------------------------------------------------------
# Tests: get_solar_forecast
# ---------------------------------------------------------------------------

class TestGetSolarForecast:
    def test_returns_solar_slots(self, seeded_db_path: pathlib.Path):
        result = analytics.get_solar_forecast(db_path=seeded_db_path)
        assert isinstance(result, list)
        if result:
            assert "slot_start" in result[0]
            assert "est_pv_yield_wh" in result[0]

    def test_returns_empty_list_when_no_forecast(self, test_db_path: pathlib.Path):
        result = analytics.get_solar_forecast(db_path=test_db_path)
        assert result == []


# ---------------------------------------------------------------------------
# Tests: get_energy_flow
# ---------------------------------------------------------------------------

class TestGetEnergyFlow:
    def _insert_interval_summary(self, conn, interval_start: str) -> None:
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
            VALUES (?,?,1000,500,0,200,300,800,72.0,10.0,4.0,8.0,2.0,1.2,700)
            """,
            (interval_start, interval_end),
        )

    def test_returns_interval_summaries(self, test_db_path: pathlib.Path):
        now = datetime.now(timezone.utc)
        slot = (now - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        self._insert_interval_summary(conn, slot_str)
        conn.commit()
        conn.close()

        result = analytics.get_energy_flow(hours_back=2, db_path=test_db_path)
        assert len(result) >= 1
        assert "pv_yield_wh" in result[0]

    def test_returns_empty_list_when_no_data(self, test_db_path: pathlib.Path):
        result = analytics.get_energy_flow(db_path=test_db_path)
        assert result == []


# ---------------------------------------------------------------------------
# Tests: get_daily_summary
# ---------------------------------------------------------------------------

class TestGetDailySummary:
    def _insert_daily_summary(self, conn, date: str) -> None:
        conn.execute(
            """
            INSERT OR REPLACE INTO daily_summary
                (date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
                 grid_import_kwh, grid_export_kwh, load_kwh,
                 self_consumption_rate, self_sufficiency_rate,
                 grid_import_cost_aud, grid_export_revenue_aud,
                 counterfactual_cost_aud, total_savings_aud,
                 avg_import_price_ckwh)
            VALUES (?,28.5,12.0,8.0,5.0,10.0,25.0,0.68,0.72,1.50,0.40,3.50,2.00,15.0)
            """,
            (date,),
        )

    def test_returns_summary_for_specific_date(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        self._insert_daily_summary(conn, "2026-03-25")
        conn.commit()
        conn.close()

        result = analytics.get_daily_summary("2026-03-25", db_path=test_db_path)
        assert result is not None
        assert result["pv_yield_kwh"] == pytest.approx(28.5)
        assert result["total_savings_aud"] == pytest.approx(2.0)

    def test_returns_none_when_no_data(self, test_db_path: pathlib.Path):
        result = analytics.get_daily_summary("2000-01-01", db_path=test_db_path)
        assert result is None


# ---------------------------------------------------------------------------
# Tests: get_savings_report
# ---------------------------------------------------------------------------

class TestGetSavingsReport:
    def _insert_days(self, conn, dates: list[str]) -> None:
        for date in dates:
            conn.execute(
                """
                INSERT OR REPLACE INTO daily_summary
                    (date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
                     grid_import_kwh, grid_export_kwh, load_kwh,
                     self_consumption_rate, self_sufficiency_rate,
                     grid_import_cost_aud, grid_export_revenue_aud,
                     counterfactual_cost_aud, total_savings_aud,
                     avg_import_price_ckwh)
                VALUES (?,10.0,5.0,3.0,2.0,4.0,9.0,0.65,0.70,0.60,0.16,1.40,0.80,18.0)
                """,
                (date,),
            )

    def test_returns_days_list_and_totals(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        self._insert_days(conn, ["2026-03-23", "2026-03-24", "2026-03-25"])
        conn.commit()
        conn.close()

        result = analytics.get_savings_report("2026-03-23", "2026-03-25", db_path=test_db_path)
        assert "days" in result
        assert "totals" in result
        assert len(result["days"]) == 3
        assert result["totals"]["days_with_data"] == 3
        assert result["totals"]["total_savings_aud"] == pytest.approx(3 * 0.80)

    def test_returns_empty_days_and_none_totals_when_no_data(
        self, test_db_path: pathlib.Path
    ):
        result = analytics.get_savings_report("2020-01-01", "2020-01-07", db_path=test_db_path)
        assert result["days"] == []
        assert result["totals"] is None

    def test_date_range_is_inclusive(self, test_db_path: pathlib.Path):
        conn = _conn(test_db_path)
        self._insert_days(conn, ["2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26"])
        conn.commit()
        conn.close()

        result = analytics.get_savings_report("2026-03-24", "2026-03-25", db_path=test_db_path)
        assert len(result["days"]) == 2
        dates = [d["date"] for d in result["days"]]
        assert "2026-03-24" in dates
        assert "2026-03-25" in dates
        assert "2026-03-23" not in dates
        assert "2026-03-26" not in dates


# ---------------------------------------------------------------------------
# Tests: get_optimization_context
# ---------------------------------------------------------------------------

class TestGetOptimizationContext:
    def test_returns_all_required_keys(self, seeded_db_path: pathlib.Path):
        result = analytics.get_optimization_context(db_path=seeded_db_path)
        required_keys = [
            "current_soc", "current_pv_w", "current_load_w",
            "current_import_ckwh", "current_export_ckwh", "spike_status",
            "price_forecast_24h", "solar_forecast_24h",
            "recent_avg_load_w", "system_config",
        ]
        for key in required_keys:
            assert key in result, f"Missing key: {key}"

    def test_current_soc_is_populated(self, seeded_db_path: pathlib.Path):
        result = analytics.get_optimization_context(db_path=seeded_db_path)
        assert result["current_soc"] == pytest.approx(72.0)

    def test_returns_none_current_soc_when_no_telemetry(
        self, test_db_path: pathlib.Path
    ):
        result = analytics.get_optimization_context(db_path=test_db_path)
        assert result["current_soc"] is None

    def test_price_forecast_24h_is_list(self, seeded_db_path: pathlib.Path):
        result = analytics.get_optimization_context(db_path=seeded_db_path)
        assert isinstance(result["price_forecast_24h"], list)

    def test_solar_forecast_24h_is_list(self, seeded_db_path: pathlib.Path):
        result = analytics.get_optimization_context(db_path=seeded_db_path)
        assert isinstance(result["solar_forecast_24h"], list)


# ---------------------------------------------------------------------------
# Tests: get_pipeline_health
# ---------------------------------------------------------------------------

class TestGetPipelineHealth:
    def test_returns_health_structure(self, seeded_db_path: pathlib.Path):
        result = analytics.get_pipeline_health(db_path=seeded_db_path)
        assert "pipelines" in result
        assert "freshness" in result
        assert "healthy" in result
        assert isinstance(result["healthy"], bool)

    def test_never_run_pipelines_show_never_run_status(
        self, test_db_path: pathlib.Path
    ):
        result = analytics.get_pipeline_health(db_path=test_db_path)
        for name, status in result["pipelines"].items():
            assert status["status"] == "never_run"

    def test_healthy_is_false_when_no_data(self, test_db_path: pathlib.Path):
        result = analytics.get_pipeline_health(db_path=test_db_path)
        assert result["healthy"] is False
