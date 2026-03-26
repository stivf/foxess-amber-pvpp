"""
Analytics query layer for the dashboard API.

All functions return plain dicts/lists suitable for JSON serialization.
These are the data contracts consumed by the backend API endpoints.

Query patterns:
  - Current state (real-time dashboard):     get_current_state()
  - Price feed (live + forecast):            get_price_feed()
  - Solar forecast (next 24h):               get_solar_forecast()
  - Energy flow chart (last N hours):        get_energy_flow()
  - Daily savings summary:                   get_daily_summary()
  - Historical savings report (date range):  get_savings_report()
  - Optimization context (engine inputs):    get_optimization_context()
"""

import sqlite3
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from .db import get_connection, DB_PATH

log = logging.getLogger(__name__)


def _conn(db_path=DB_PATH) -> sqlite3.Connection:
    return get_connection(db_path)


# ─────────────────────────────────────────────────────────────
# CURRENT STATE — real-time dashboard widgets
# ─────────────────────────────────────────────────────────────

def get_current_state(db_path=DB_PATH) -> dict:
    """
    Latest telemetry snapshot + current prices.

    Returns:
        {
          telemetry: { bat_soc, pv_power_w, bat_power_w, grid_power_w,
                       load_power_w, work_mode, recorded_at },
          prices: { general: {per_kwh, spot_per_kwh, spike_status, descriptor},
                    feedIn: {per_kwh, ...} },
          updated_at: <ISO8601>
        }
    """
    conn = _conn(db_path)
    try:
        tel = conn.execute(
            """
            SELECT recorded_at, bat_soc, pv_power_w, bat_power_w,
                   grid_power_w, load_power_w, bat_temp_c, work_mode
            FROM telemetry
            ORDER BY recorded_at DESC
            LIMIT 1
            """
        ).fetchone()

        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Get current interval prices (closest to now, non-forecast preferred)
        price_rows = conn.execute(
            """
            SELECT channel_type, per_kwh, spot_per_kwh, spike_status, descriptor,
                   renewables, is_forecast, interval_start
            FROM prices
            WHERE interval_start <= ?
            ORDER BY interval_start DESC
            LIMIT 6
            """,
            (now_utc,),
        ).fetchall()

        prices = {}
        for row in price_rows:
            ch = row["channel_type"]
            if ch not in prices:
                prices[ch] = dict(row)

        return {
            "telemetry": dict(tel) if tel else None,
            "prices": prices,
            "updated_at": now_utc,
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PRICE FEED — current + 24h forecast
# ─────────────────────────────────────────────────────────────

def get_price_feed(hours_ahead: int = 24, db_path=DB_PATH) -> list[dict]:
    """
    Price timeline: last 1h actuals + next hours_ahead forecast.

    Returns list of intervals ordered by interval_start, both channels.
    Each dict: { interval_start, channel_type, per_kwh, spot_per_kwh,
                 spike_status, descriptor, renewables, is_forecast }
    """
    conn = _conn(db_path)
    try:
        now = datetime.now(timezone.utc)
        window_start = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        window_end = (now + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute(
            """
            SELECT interval_start, channel_type, per_kwh, spot_per_kwh,
                   spike_status, descriptor, renewables, is_forecast
            FROM prices
            WHERE interval_start >= ? AND interval_start <= ?
            ORDER BY interval_start ASC, channel_type ASC
            """,
            (window_start, window_end),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SOLAR FORECAST
# ─────────────────────────────────────────────────────────────

def get_solar_forecast(hours_ahead: int = 48, db_path=DB_PATH) -> list[dict]:
    """
    Solar PV yield forecast for the next hours_ahead hours.

    Returns list ordered by slot_start:
    { slot_start, slot_end, est_pv_yield_wh, ghi_wm2, cloud_cover_pct,
      temp_c, forecast_run_time }
    """
    conn = _conn(db_path)
    try:
        now = datetime.now(timezone.utc)
        window_end = (now + timedelta(hours=hours_ahead)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute(
            """
            SELECT slot_start, slot_end, est_pv_yield_wh, ghi_wm2,
                   cloud_cover_pct, temp_c, forecast_run_time
            FROM solar_forecasts
            WHERE slot_start >= ? AND slot_start <= ?
            ORDER BY slot_start ASC
            """,
            (now.strftime("%Y-%m-%dT%H:%M:%SZ"), window_end),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# ENERGY FLOW CHART
# ─────────────────────────────────────────────────────────────

def get_energy_flow(hours_back: int = 24, db_path=DB_PATH) -> list[dict]:
    """
    30-minute energy flow data for charts (last hours_back hours).

    Returns list ordered by interval_start:
    { interval_start, pv_yield_wh, battery_charged_wh, battery_discharged_wh,
      grid_import_wh, grid_export_wh, load_wh, bat_soc_end,
      avg_import_price_ckwh, avg_export_price_ckwh, self_consumed_wh }
    """
    conn = _conn(db_path)
    try:
        window_start = (
            datetime.now(timezone.utc) - timedelta(hours=hours_back)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows = conn.execute(
            """
            SELECT interval_start, interval_end,
                   pv_yield_wh, battery_charged_wh, battery_discharged_wh,
                   grid_import_wh, grid_export_wh, load_wh, bat_soc_end,
                   avg_import_price_ckwh, avg_export_price_ckwh, avg_spot_price_ckwh,
                   avg_renewables_pct, self_consumed_wh,
                   import_cost_ac, export_revenue_ac
            FROM interval_summary_30min
            WHERE interval_start >= ?
            ORDER BY interval_start ASC
            """,
            (window_start,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# DAILY SUMMARY — for dashboard cards
# ─────────────────────────────────────────────────────────────

def get_daily_summary(date: str | None = None, db_path=DB_PATH) -> dict | None:
    """
    Daily summary for a given date (YYYY-MM-DD, local time).
    Defaults to today.

    Returns the full daily_summary row as a dict, or None if not available.
    """
    conn = _conn(db_path)
    try:
        if date is None:
            # AEST = UTC+10
            date = (datetime.now(timezone.utc) + timedelta(hours=10)).strftime("%Y-%m-%d")
        row = conn.execute(
            "SELECT * FROM daily_summary WHERE date = ?", (date,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# SAVINGS REPORT — date range for history view
# ─────────────────────────────────────────────────────────────

def get_savings_report(
    date_from: str,
    date_to: str,
    db_path=DB_PATH,
) -> dict:
    """
    Aggregated savings report over a date range (inclusive, YYYY-MM-DD).

    Returns:
        {
          days: [ {date, pv_yield_kwh, grid_import_kwh, grid_export_kwh,
                   self_consumption_rate, self_sufficiency_rate,
                   total_savings_aud, ...}, ... ],
          totals: {
            pv_yield_kwh, grid_import_kwh, grid_export_kwh,
            grid_import_cost_aud, grid_export_revenue_aud,
            counterfactual_cost_aud, total_savings_aud,
            avg_self_consumption_rate, avg_self_sufficiency_rate,
            days_with_data
          }
        }
    """
    conn = _conn(db_path)
    try:
        rows = conn.execute(
            """
            SELECT date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
                   grid_import_kwh, grid_export_kwh, load_kwh,
                   self_consumption_rate, self_sufficiency_rate,
                   grid_import_cost_aud, grid_export_revenue_aud,
                   counterfactual_cost_aud, total_savings_aud,
                   avg_import_price_ckwh, avg_export_price_ckwh,
                   peak_import_price_ckwh, spike_count
            FROM daily_summary
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (date_from, date_to),
        ).fetchall()

        days = [dict(r) for r in rows]

        if not days:
            return {"days": [], "totals": None}

        totals = {
            "pv_yield_kwh":            sum(d["pv_yield_kwh"] for d in days),
            "grid_import_kwh":         sum(d["grid_import_kwh"] for d in days),
            "grid_export_kwh":         sum(d["grid_export_kwh"] for d in days),
            "load_kwh":                sum(d["load_kwh"] for d in days),
            "grid_import_cost_aud":    sum(d["grid_import_cost_aud"] for d in days),
            "grid_export_revenue_aud": sum(d["grid_export_revenue_aud"] for d in days),
            "counterfactual_cost_aud": sum(d["counterfactual_cost_aud"] for d in days),
            "total_savings_aud":       sum(d["total_savings_aud"] for d in days),
            "avg_self_consumption_rate": sum(d["self_consumption_rate"] for d in days) / len(days),
            "avg_self_sufficiency_rate": sum(d["self_sufficiency_rate"] for d in days) / len(days),
            "days_with_data":          len(days),
        }

        return {"days": days, "totals": totals}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# OPTIMIZATION CONTEXT — inputs for the decision engine
# ─────────────────────────────────────────────────────────────

def get_optimization_context(db_path=DB_PATH) -> dict:
    """
    All inputs needed by the optimization engine for a decision cycle.

    Returns:
        {
          current_soc:         float (%)
          current_pv_w:        float (W)
          current_load_w:      float (W)
          current_import_ckwh: float (c/kWh)
          current_export_ckwh: float (c/kWh)
          spike_status:        str
          price_forecast_24h:  [ {interval_start, per_kwh, channel_type, is_forecast}, ... ]
          solar_forecast_24h:  [ {slot_start, est_pv_yield_wh}, ... ]
          recent_avg_load_w:   float (1h average load, for consumption estimation)
          system_config:       { bat_capacity_kwh, bat_min_soc, bat_max_soc,
                                 charge_threshold_ckwh, discharge_threshold_ckwh }
        }
    """
    conn = _conn(db_path)
    try:
        # Latest telemetry
        tel = conn.execute(
            """
            SELECT bat_soc, pv_power_w, load_power_w, recorded_at
            FROM telemetry
            ORDER BY recorded_at DESC LIMIT 1
            """
        ).fetchone()

        # 1h average load
        hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        avg_load = conn.execute(
            "SELECT AVG(load_power_w) as avg FROM telemetry WHERE recorded_at >= ?",
            (hour_ago,),
        ).fetchone()

        # Current prices
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cur_prices = conn.execute(
            """
            SELECT channel_type, per_kwh, spike_status
            FROM prices
            WHERE interval_start <= ?
            ORDER BY interval_start DESC
            LIMIT 4
            """,
            (now_str,),
        ).fetchall()

        prices_by_channel: dict[str, dict] = {}
        for row in cur_prices:
            ch = row["channel_type"]
            if ch not in prices_by_channel:
                prices_by_channel[ch] = dict(row)

        # 24h price forecast (both channels)
        window_end = (datetime.now(timezone.utc) + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%SZ")
        price_forecast = conn.execute(
            """
            SELECT interval_start, channel_type, per_kwh, spot_per_kwh,
                   spike_status, descriptor, is_forecast
            FROM prices
            WHERE interval_start >= ? AND interval_start <= ?
            ORDER BY interval_start ASC, channel_type ASC
            """,
            (now_str, window_end),
        ).fetchall()

        # 24h solar forecast
        solar_forecast = conn.execute(
            """
            SELECT slot_start, est_pv_yield_wh, ghi_wm2, cloud_cover_pct
            FROM solar_forecasts
            WHERE slot_start >= ? AND slot_start <= ?
            ORDER BY slot_start ASC
            """,
            (now_str, window_end),
        ).fetchall()

        # System config
        config_rows = conn.execute(
            """
            SELECT key, value FROM system_config
            WHERE key IN ('bat_capacity_kwh', 'bat_min_soc', 'bat_max_soc',
                          'charge_threshold_ckwh', 'discharge_threshold_ckwh')
            """
        ).fetchall()
        system_config = {r["key"]: float(r["value"]) for r in config_rows if r["value"]}

        general = prices_by_channel.get("general", {})
        feed_in = prices_by_channel.get("feedIn", {})

        return {
            "current_soc": float(tel["bat_soc"]) if tel else None,
            "current_pv_w": float(tel["pv_power_w"]) if tel else None,
            "current_load_w": float(tel["load_power_w"]) if tel else None,
            "telemetry_age_sec": (
                (
                    datetime.now(timezone.utc)
                    - datetime.fromisoformat(tel["recorded_at"].replace("Z", "+00:00"))
                ).total_seconds()
                if tel
                else None
            ),
            "current_import_ckwh": general.get("per_kwh"),
            "current_export_ckwh": feed_in.get("per_kwh"),
            "spike_status": general.get("spike_status", "none"),
            "price_forecast_24h": [dict(r) for r in price_forecast],
            "solar_forecast_24h": [dict(r) for r in solar_forecast],
            "recent_avg_load_w": float(avg_load["avg"]) if avg_load and avg_load["avg"] else None,
            "system_config": system_config,
        }
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────
# PIPELINE HEALTH — for monitoring endpoint
# ─────────────────────────────────────────────────────────────

def get_pipeline_health(db_path=DB_PATH) -> dict:
    """
    Last run status for each pipeline + data freshness checks.

    Returns:
        {
          pipelines: { amber_prices: {status, started_at, rows_ingested, error},
                       foxess_telemetry: {...},
                       solar_forecast: {...},
                       aggregation_30min: {...} },
          freshness: { prices_age_min, telemetry_age_min, solar_forecast_age_min },
          healthy: bool
        }
    """
    conn = _conn(db_path)
    try:
        pipeline_names = ["amber_prices", "foxess_telemetry", "solar_forecast", "aggregation_30min", "aggregation_daily"]
        pipelines = {}
        for name in pipeline_names:
            row = conn.execute(
                """
                SELECT status, started_at, finished_at, rows_ingested, error_message
                FROM pipeline_runs WHERE pipeline = ?
                ORDER BY started_at DESC LIMIT 1
                """,
                (name,),
            ).fetchone()
            pipelines[name] = dict(row) if row else {"status": "never_run"}

        now = datetime.now(timezone.utc)
        now_str = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        def age_min(ts_str: str | None) -> float | None:
            if not ts_str:
                return None
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                return round((now - ts).total_seconds() / 60.0, 1)
            except Exception:
                return None

        # Data freshness
        latest_price = conn.execute(
            "SELECT MAX(updated_at) as ts FROM prices"
        ).fetchone()
        latest_tel = conn.execute(
            "SELECT MAX(recorded_at) as ts FROM telemetry"
        ).fetchone()
        latest_solar = conn.execute(
            "SELECT MAX(updated_at) as ts FROM solar_forecasts"
        ).fetchone()

        freshness = {
            "prices_age_min": age_min(latest_price["ts"] if latest_price else None),
            "telemetry_age_min": age_min(latest_tel["ts"] if latest_tel else None),
            "solar_forecast_age_min": age_min(latest_solar["ts"] if latest_solar else None),
        }

        # Health: prices < 10min, telemetry < 5min, solar < 120min
        healthy = (
            (freshness["prices_age_min"] or 999) < 10
            and (freshness["telemetry_age_min"] or 999) < 5
            and (freshness["solar_forecast_age_min"] or 999) < 120
        )

        return {"pipelines": pipelines, "freshness": freshness, "healthy": healthy}
    finally:
        conn.close()
