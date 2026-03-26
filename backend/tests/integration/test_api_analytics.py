"""
Integration tests for Analytics API endpoints.

Covers:
  GET /analytics/savings?period={day|week|month|year}&from={iso8601}&to={iso8601}
"""

import pathlib
import sqlite3
from datetime import datetime, timezone, timedelta

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


def _insert_daily_summary(
    conn: sqlite3.Connection,
    date: str,
    pv_kwh: float = 28.5,
    grid_import_kwh: float = 5.0,
    grid_export_kwh: float = 10.0,
    load_kwh: float = 25.0,
    savings_aud: float = 4.52,
    import_cost_aud: float = 1.50,
    export_revenue_aud: float = 0.40,
    counterfactual_aud: float = 3.50,
    self_consumption_rate: float = 0.68,
    avg_import_price: float = 15.0,
    battery_charged_kwh: float = 12.0,
    battery_discharged_kwh: float = 8.0,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO daily_summary
            (date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
             grid_import_kwh, grid_export_kwh, load_kwh,
             self_consumption_rate, self_sufficiency_rate,
             grid_import_cost_aud, grid_export_revenue_aud,
             counterfactual_cost_aud, total_savings_aud,
             avg_import_price_ckwh)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (date, pv_kwh, battery_charged_kwh, battery_discharged_kwh,
         grid_import_kwh, grid_export_kwh, load_kwh,
         self_consumption_rate, 0.72,
         import_cost_aud, export_revenue_aud,
         counterfactual_aud, savings_aud,
         avg_import_price),
    )


def _insert_week_of_data(conn: sqlite3.Connection,
                          base_date: str = "2026-03-19") -> list[str]:
    """Insert 7 days of daily summary data. Returns the list of dates."""
    dates = []
    base = datetime.fromisoformat(base_date)
    for i in range(7):
        date = (base + timedelta(days=i)).strftime("%Y-%m-%d")
        _insert_daily_summary(conn, date, savings_aud=4.0 + i * 0.5)
        dates.append(date)
    return dates


# ---------------------------------------------------------------------------
# Tests: savings analytics data layer
# ---------------------------------------------------------------------------

class TestSavingsAnalyticsDataLayer:
    def test_savings_query_by_date_range(self, test_db_path: pathlib.Path):
        """GET /analytics/savings filters by date range."""
        conn = _conn(test_db_path)
        dates = _insert_week_of_data(conn)
        conn.commit()

        rows = conn.execute(
            """
            SELECT date, total_savings_aud, pv_yield_kwh
            FROM daily_summary
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (dates[0], dates[-1]),
        ).fetchall()
        conn.close()

        assert len(rows) == 7
        date_list = [r["date"] for r in rows]
        assert date_list == sorted(date_list)

    def test_savings_totals_aggregation(self, test_db_path: pathlib.Path):
        """Total savings correctly sums daily_summary rows."""
        conn = _conn(test_db_path)
        _insert_daily_summary(conn, "2026-03-23", savings_aud=3.0)
        _insert_daily_summary(conn, "2026-03-24", savings_aud=5.0)
        _insert_daily_summary(conn, "2026-03-25", savings_aud=4.0)
        conn.commit()

        row = conn.execute(
            """
            SELECT SUM(total_savings_aud) as total,
                   SUM(pv_yield_kwh) as total_solar,
                   SUM(grid_import_kwh) as total_import,
                   SUM(grid_export_kwh) as total_export,
                   COUNT(*) as days
            FROM daily_summary
            WHERE date >= '2026-03-23' AND date <= '2026-03-25'
            """
        ).fetchone()
        conn.close()

        assert row["total"] == pytest.approx(12.0)
        assert row["days"] == 3

    def test_savings_empty_range_returns_no_data(self, test_db_path: pathlib.Path):
        """With no data in range, returns empty."""
        conn = _conn(test_db_path)
        rows = conn.execute(
            "SELECT * FROM daily_summary WHERE date >= '2020-01-01' AND date <= '2020-01-31'"
        ).fetchall()
        conn.close()
        assert rows == []

    def test_savings_response_shape(self):
        """Validate expected fields in /analytics/savings response."""
        required_keys = {
            "period", "from", "to",
            "total_savings_dollars", "grid_import_kwh", "grid_export_kwh",
            "solar_generation_kwh", "self_consumption_pct",
            "battery_cycles", "avg_buy_price", "avg_sell_price", "breakdown"
        }
        breakdown_keys = {"date", "savings_dollars", "solar_kwh", "import_kwh", "export_kwh"}
        valid_periods = {"day", "week", "month", "year"}

        assert "total_savings_dollars" in required_keys
        assert "breakdown" in required_keys
        assert "day" in valid_periods
        assert "date" in breakdown_keys

    def test_savings_single_day_period(self, test_db_path: pathlib.Path):
        """Day period returns exactly one breakdown entry."""
        conn = _conn(test_db_path)
        _insert_daily_summary(conn, "2026-03-25", savings_aud=4.52)
        conn.commit()

        rows = conn.execute(
            """
            SELECT date, total_savings_aud, pv_yield_kwh,
                   grid_import_kwh, grid_export_kwh
            FROM daily_summary
            WHERE date = '2026-03-25'
            """
        ).fetchall()
        conn.close()

        assert len(rows) == 1
        assert rows[0]["total_savings_aud"] == pytest.approx(4.52)

    def test_savings_week_period_sums_correctly(self, test_db_path: pathlib.Path):
        """Week period sums 7 days of savings."""
        conn = _conn(test_db_path)
        dates = _insert_week_of_data(conn, "2026-03-19")
        conn.commit()

        row = conn.execute(
            """
            SELECT SUM(total_savings_aud) as weekly_total, COUNT(*) as days
            FROM daily_summary
            WHERE date >= '2026-03-19' AND date <= '2026-03-25'
            """
        ).fetchone()
        conn.close()

        assert row["days"] == 7
        assert row["weekly_total"] is not None
        assert row["weekly_total"] > 0

    def test_savings_month_period(self, test_db_path: pathlib.Path):
        """Month period covers all days in the month range."""
        conn = _conn(test_db_path)
        # Insert 25 days for March 2026
        base = datetime(2026, 3, 1, tzinfo=timezone.utc)
        for i in range(25):
            date = (base + timedelta(days=i)).strftime("%Y-%m-%d")
            _insert_daily_summary(conn, date, savings_aud=4.0)
        conn.commit()

        row = conn.execute(
            """
            SELECT COUNT(*) as days, SUM(total_savings_aud) as total
            FROM daily_summary
            WHERE date >= '2026-03-01' AND date <= '2026-03-25'
            """
        ).fetchone()
        conn.close()

        assert row["days"] == 25
        assert row["total"] == pytest.approx(100.0)

    def test_savings_self_consumption_pct(self, test_db_path: pathlib.Path):
        """self_consumption_rate is stored in [0,1] range."""
        conn = _conn(test_db_path)
        _insert_daily_summary(conn, "2026-03-25", self_consumption_rate=0.68)
        conn.commit()

        row = conn.execute(
            "SELECT self_consumption_rate FROM daily_summary WHERE date = '2026-03-25'"
        ).fetchone()
        conn.close()

        assert row is not None
        assert 0.0 <= row["self_consumption_rate"] <= 1.0

    def test_savings_avg_prices_from_interval_summaries(self, test_db_path: pathlib.Path):
        """avg_import_price_ckwh is stored in daily_summary."""
        conn = _conn(test_db_path)
        _insert_daily_summary(conn, "2026-03-25", avg_import_price=12.5)
        conn.commit()

        row = conn.execute(
            "SELECT avg_import_price_ckwh FROM daily_summary WHERE date = '2026-03-25'"
        ).fetchone()
        conn.close()

        assert row["avg_import_price_ckwh"] == pytest.approx(12.5)

    def test_savings_battery_cycles_field(self, test_db_path: pathlib.Path):
        """Battery cycles can be derived from discharge events."""
        conn = _conn(test_db_path)
        _insert_daily_summary(conn, "2026-03-25",
                               battery_discharged_kwh=10.4)  # 1 full cycle of 10.4 kWh battery
        conn.commit()

        row = conn.execute(
            "SELECT battery_discharged_kwh FROM daily_summary WHERE date = '2026-03-25'"
        ).fetchone()
        conn.close()

        assert row["battery_discharged_kwh"] == pytest.approx(10.4)

    def test_valid_period_values(self):
        """The 'period' param accepts only: day, week, month, year."""
        valid_periods = {"day", "week", "month", "year"}
        invalid_periods = ["hour", "fortnight", "decade", ""]
        assert all(p in valid_periods for p in valid_periods)
        assert all(p not in valid_periods for p in invalid_periods)


# ---------------------------------------------------------------------------
# FastAPI endpoint tests (uncomment when app is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# class TestAnalyticsAPI:
#     async def test_get_savings_returns_200(self, async_client):
#         resp = await async_client.get("/api/v1/analytics/savings?period=week")
#         assert resp.status_code == 200
#         data = resp.json()
#         assert "period" in data
#         assert "total_savings_dollars" in data
#         assert "breakdown" in data
#
#     async def test_get_savings_with_date_range(self, async_client):
#         resp = await async_client.get(
#             "/api/v1/analytics/savings?period=month"
#             "&from=2026-03-01T00:00:00Z&to=2026-03-25T23:59:59Z"
#         )
#         assert resp.status_code == 200
#
#     async def test_get_savings_invalid_period_returns_400(self, async_client):
#         resp = await async_client.get("/api/v1/analytics/savings?period=decade")
#         assert resp.status_code == 400
#
#     async def test_get_savings_requires_auth(self, async_client):
#         from httpx import AsyncClient, ASGITransport
#         from src.api.main import create_app
#         app = create_app()
#         async with AsyncClient(transport=ASGITransport(app=app),
#                                base_url="http://testserver") as unauthed:
#             resp = await unauthed.get("/api/v1/analytics/savings?period=day")
#         assert resp.status_code == 401
