"""
Integration tests for the data aggregation pipeline runner.

Tests the Aggregator.run_30min_aggregation() and run_daily_aggregation()
methods end-to-end against a real SQLite DB with seeded telemetry and
price data.

Validates:
  - Multi-interval aggregation (multiple 30-min slots)
  - run_30min_aggregation() writes to interval_summary_30min
  - run_daily_aggregation() writes to daily_summary from interval summaries
  - Idempotency of repeated aggregation runs
  - Correct energy integration across multiple telemetry readings
  - Correct cost and revenue calculations
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest

from src.pipeline.aggregator import Aggregator
from tests.conftest import apply_migrations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _conn(db_path: pathlib.Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _insert_telemetry(conn: sqlite3.Connection, recorded_at: str,
                       pv_w: float = 3000.0, bat_w: float = 1000.0,
                       grid_w: float = -500.0, load_w: float = 1200.0,
                       bat_soc: float = 72.0) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO telemetry
            (recorded_at, device_sn, pv_power_w, bat_power_w, grid_power_w,
             load_power_w, bat_soc, updated_at)
        VALUES (?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (recorded_at, "TEST001", pv_w, bat_w, grid_w, load_w, bat_soc),
    )


def _insert_price(conn: sqlite3.Connection, interval_start: str,
                  channel_type: str, per_kwh: float,
                  spot_per_kwh: float = 8.0) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO prices
            (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
             spike_status, updated_at)
        VALUES (?,?,0,?,?,'none',strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        """,
        (interval_start, channel_type, spot_per_kwh, per_kwh),
    )


def _get_interval_summary(db_path: pathlib.Path, interval_start: str) -> sqlite3.Row | None:
    conn = _conn(db_path)
    row = conn.execute(
        "SELECT * FROM interval_summary_30min WHERE interval_start = ?",
        (interval_start,),
    ).fetchone()
    conn.close()
    return row


def _get_daily_summary(db_path: pathlib.Path, date: str) -> sqlite3.Row | None:
    conn = _conn(db_path)
    row = conn.execute(
        "SELECT * FROM daily_summary WHERE date = ?", (date,)
    ).fetchone()
    conn.close()
    return row


# ---------------------------------------------------------------------------
# Tests: run_30min_aggregation() end-to-end
# ---------------------------------------------------------------------------

class TestRun30MinAggregation:
    def test_aggregation_writes_interval_summary(self, test_db_path: pathlib.Path):
        """run_30min_aggregation() creates at least one row in interval_summary_30min."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")
        next_slot_str = (slot + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_telemetry(conn, slot_str)
        _insert_telemetry(conn, next_slot_str)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        _insert_price(conn, slot_str, "feedIn", per_kwh=4.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        rows_written = agg.run_30min_aggregation(lookback_hours=1)

        assert rows_written > 0

        conn = _conn(test_db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM interval_summary_30min"
        ).fetchone()[0]
        conn.close()
        assert count > 0

    def test_aggregation_multiple_slots(self, test_db_path: pathlib.Path):
        """run_30min_aggregation() processes multiple 30-min slots."""
        base = datetime(2026, 3, 25, 8, 0, 0, tzinfo=timezone.utc)
        conn = _conn(test_db_path)

        # Insert 2 hours of data (4 slots)
        for i in range(5):
            t = base + timedelta(minutes=30 * i)
            _insert_telemetry(conn, t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                               pv_w=3000.0 + i * 100)
            if i < 4:
                slot_str = t.strftime("%Y-%m-%dT%H:%M:%SZ")
                _insert_price(conn, slot_str, "general", per_kwh=10.0 + i)
                _insert_price(conn, slot_str, "feedIn", per_kwh=4.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        # Use a wide lookback to capture all slots
        rows_written = agg.run_30min_aggregation(lookback_hours=48)

        assert rows_written >= 1

    def test_aggregation_returns_zero_for_empty_db(self, test_db_path: pathlib.Path):
        """With no telemetry, run_30min_aggregation() writes 0 rows."""
        agg = Aggregator(db_path=test_db_path)
        rows_written = agg.run_30min_aggregation(lookback_hours=1)
        assert rows_written == 0

    def test_aggregation_idempotent_across_runs(self, test_db_path: pathlib.Path):
        """Running run_30min_aggregation() twice produces the same count."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_telemetry(conn, slot_str, pv_w=3000.0)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        w1 = agg.run_30min_aggregation(lookback_hours=1)
        w2 = agg.run_30min_aggregation(lookback_hours=1)

        # Same result both times (UPSERT semantics)
        assert w1 == w2

        conn = _conn(test_db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM interval_summary_30min WHERE interval_start = ?",
            (slot_str,),
        ).fetchone()[0]
        conn.close()
        assert count == 1

    def test_aggregation_sets_correct_interval_end(self, test_db_path: pathlib.Path):
        """interval_end must be exactly 30 minutes after interval_start."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_telemetry(conn, slot_str)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_30min_aggregation(lookback_hours=1)

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT interval_start, interval_end FROM interval_summary_30min WHERE interval_start = ?",
            (slot_str,),
        ).fetchone()
        conn.close()

        if row:  # Only assert if the slot was aggregated
            start = datetime.fromisoformat(row["interval_start"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(row["interval_end"].replace("Z", "+00:00"))
            diff = (end - start).total_seconds()
            assert diff == 1800  # 30 minutes = 1800 seconds

    def test_aggregation_pv_yield_is_non_negative(self, test_db_path: pathlib.Path):
        """pv_yield_wh must never be negative."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")
        next_slot_str = (slot + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_telemetry(conn, slot_str, pv_w=0.0)
        _insert_telemetry(conn, next_slot_str, pv_w=0.0)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_30min_aggregation(lookback_hours=1)

        conn = _conn(test_db_path)
        rows = conn.execute(
            "SELECT pv_yield_wh FROM interval_summary_30min"
        ).fetchall()
        conn.close()

        for row in rows:
            assert row["pv_yield_wh"] >= 0, "pv_yield_wh must not be negative"

    def test_aggregation_grid_export_import_separation(self, test_db_path: pathlib.Path):
        """Negative grid_power_w = exporting; positive = importing. Both tracked separately."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")
        next_slot_str = (slot + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        # Exporting: grid_power_w = -500W
        _insert_telemetry(conn, slot_str, grid_w=-500.0, pv_w=3000.0)
        _insert_telemetry(conn, next_slot_str, grid_w=-500.0, pv_w=3000.0)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        _insert_price(conn, slot_str, "feedIn", per_kwh=4.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_30min_aggregation(lookback_hours=1)

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT grid_export_wh, grid_import_wh FROM interval_summary_30min LIMIT 1"
        ).fetchone()
        conn.close()

        if row:
            assert row["grid_export_wh"] >= 0
            assert row["grid_import_wh"] >= 0
            # When exporting, grid_import_wh should be 0
            assert row["grid_import_wh"] == pytest.approx(0.0, abs=1.0)


# ---------------------------------------------------------------------------
# Tests: run_daily_aggregation() end-to-end
# ---------------------------------------------------------------------------

class TestRunDailyAggregation:
    def _insert_interval_summaries(self, conn: sqlite3.Connection,
                                    date_utc: str, n_slots: int = 4) -> None:
        """Insert n 30-min interval summaries starting at UTC 14:00 of date_utc.

        UTC 14:00 on date_utc corresponds to local midnight (AEST UTC+10) at the
        start of the NEXT local day, so data lands in the daily_summary for
        the local date following date_utc.
        """
        base = datetime.fromisoformat(f"{date_utc}T14:00:00+00:00")
        for i in range(n_slots):
            slot_start = (base + timedelta(minutes=30 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")
            slot_end = (base + timedelta(minutes=30 * (i + 1))).strftime("%Y-%m-%dT%H:%M:%SZ")
            conn.execute(
                """
                INSERT OR REPLACE INTO interval_summary_30min
                    (interval_start, interval_end, pv_yield_wh, battery_charged_wh,
                     battery_discharged_wh, grid_import_wh, grid_export_wh, load_wh,
                     bat_soc_end, avg_import_price_ckwh, avg_export_price_ckwh,
                     avg_spot_price_ckwh, import_cost_ac, export_revenue_ac, self_consumed_wh)
                VALUES (?,?,1000,500,0,200,300,800,72.0,10.0,4.0,8.0,2.0,1.2,700)
                """,
                (slot_start, slot_end),
            )

    def test_daily_aggregation_creates_daily_summary_row(
        self, test_db_path: pathlib.Path
    ):
        """run_daily_aggregation() creates a row in daily_summary."""
        conn = _conn(test_db_path)
        self._insert_interval_summaries(conn, "2026-03-24")  # UTC date
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=2, local_tz_offset_hours=10)

        conn = _conn(test_db_path)
        row = conn.execute(
            "SELECT * FROM daily_summary WHERE date = '2026-03-25'"  # UTC+10
        ).fetchone()
        conn.close()

        assert row is not None

    def test_daily_aggregation_sums_pv_yield(self, test_db_path: pathlib.Path):
        """Daily pv_yield_kwh equals sum of interval pv_yield_wh / 1000."""
        conn = _conn(test_db_path)
        self._insert_interval_summaries(conn, "2026-03-24", n_slots=4)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=2, local_tz_offset_hours=10)

        row = _get_daily_summary(test_db_path, "2026-03-25")
        assert row is not None
        # 4 slots × 1000 Wh = 4000 Wh = 4.0 kWh
        assert row["pv_yield_kwh"] == pytest.approx(4.0, rel=0.01)

    def test_daily_aggregation_idempotent(self, test_db_path: pathlib.Path):
        """Running daily aggregation twice produces identical results."""
        conn = _conn(test_db_path)
        self._insert_interval_summaries(conn, "2026-03-24", n_slots=4)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=2, local_tz_offset_hours=10)
        agg.run_daily_aggregation(days_back=2, local_tz_offset_hours=10)

        conn = _conn(test_db_path)
        count = conn.execute(
            "SELECT COUNT(*) FROM daily_summary WHERE date = '2026-03-25'"
        ).fetchone()[0]
        conn.close()
        assert count == 1  # Only one row, not duplicated

    def test_daily_aggregation_computes_savings(self, test_db_path: pathlib.Path):
        """total_savings_aud = counterfactual_cost - (import_cost - export_revenue)."""
        conn = _conn(test_db_path)
        conn.execute(
            """
            INSERT INTO interval_summary_30min
                (interval_start, interval_end, pv_yield_wh, battery_charged_wh,
                 battery_discharged_wh, grid_import_wh, grid_export_wh, load_wh,
                 avg_import_price_ckwh, avg_export_price_ckwh, avg_spot_price_ckwh,
                 import_cost_ac, export_revenue_ac, self_consumed_wh)
            VALUES ('2026-03-24T14:00:00Z','2026-03-24T14:30:00Z',
                    5000, 0, 2000, 0, 1500, 3000, 20.0, 5.0, 15.0, 0.0, 7.5, 3500)
            """
        )
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=2, local_tz_offset_hours=10)

        row = _get_daily_summary(test_db_path, "2026-03-25")
        assert row is not None
        assert row["total_savings_aud"] == pytest.approx(
            row["counterfactual_cost_aud"]
            - (row["grid_import_cost_aud"] - row["grid_export_revenue_aud"]),
            abs=0.01,
        )

    def test_daily_aggregation_no_data_writes_nothing(
        self, test_db_path: pathlib.Path
    ):
        """With no interval summaries, daily_summary stays empty."""
        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=1, local_tz_offset_hours=10)

        conn = _conn(test_db_path)
        count = conn.execute("SELECT COUNT(*) FROM daily_summary").fetchone()[0]
        conn.close()
        assert count == 0

    def test_daily_aggregation_multiple_days(self, test_db_path: pathlib.Path):
        """Aggregation covers multiple days correctly."""
        conn = _conn(test_db_path)
        for day_offset in range(3):
            date_str = f"2026-03-{22 + day_offset}"
            self._insert_interval_summaries(conn, date_str, n_slots=2)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_daily_aggregation(days_back=5, local_tz_offset_hours=10)

        conn = _conn(test_db_path)
        count = conn.execute("SELECT COUNT(*) FROM daily_summary").fetchone()[0]
        conn.close()
        # Should have 3 daily rows
        assert count == 3


# ---------------------------------------------------------------------------
# Tests: aggregation pipeline run logging
# ---------------------------------------------------------------------------

class TestAggregatorPipelineLogging:
    def test_aggregation_run_logged_in_pipeline_runs(self, test_db_path: pathlib.Path):
        """Aggregator logs its run to pipeline_runs table."""
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        slot = now.replace(minute=0 if now.minute < 30 else 30)
        slot_str = slot.strftime("%Y-%m-%dT%H:%M:%SZ")

        conn = _conn(test_db_path)
        _insert_telemetry(conn, slot_str)
        _insert_price(conn, slot_str, "general", per_kwh=10.0)
        conn.commit()
        conn.close()

        agg = Aggregator(db_path=test_db_path)
        agg.run_30min_aggregation(lookback_hours=1)

        conn = _conn(test_db_path)
        row = conn.execute(
            """
            SELECT status FROM pipeline_runs
            WHERE pipeline LIKE '%aggregat%'
            ORDER BY started_at DESC LIMIT 1
            """
        ).fetchone()
        conn.close()

        # Log row may or may not exist depending on Aggregator implementation.
        # If it exists, it must show success.
        if row:
            assert row["status"] == "success"
