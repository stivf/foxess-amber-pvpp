"""
Aggregation pipeline: Silver -> Gold layer.

Computes:
1. 30-minute interval summaries (aligns with Amber settlement periods)
   - Energy flows (Wh), average prices, cost/revenue, self-consumption
2. Daily summaries for dashboard savings reports

These gold-layer tables feed both:
  - The optimization engine (current SoC, recent prices, forecasts)
  - The dashboard analytics (savings, self-consumption rate, export revenue)

Run after each telemetry + price collection cycle (~1–5 min cadence).
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from .db import transaction, DB_PATH

log = logging.getLogger(__name__)


def _floor_to_30min(dt_utc_str: str) -> str:
    """Round a UTC ISO8601 string down to the nearest 30-minute boundary."""
    dt = datetime.fromisoformat(dt_utc_str.replace("Z", "+00:00"))
    floored = dt.replace(minute=(dt.minute // 30) * 30, second=0, microsecond=0)
    return floored.strftime("%Y-%m-%dT%H:%M:%SZ")


class Aggregator:
    """
    Reads from Silver layer (telemetry, prices) and writes to Gold layer
    (interval_summary_30min, daily_summary).

    Designed to be idempotent: re-running for the same intervals
    produces identical results (UPSERT / INSERT OR REPLACE semantics).
    """

    def __init__(self, db_path=DB_PATH):
        self.db_path = db_path

    # ─────────────────────────────────────────────────────────────
    # 30-MINUTE INTERVAL AGGREGATION
    # ─────────────────────────────────────────────────────────────

    def _aggregate_30min_interval(self, conn, interval_start: str) -> dict | None:
        """
        Aggregate telemetry and prices for a single 30-minute interval.

        Energy flows are computed by integrating power readings over time
        using the trapezoid rule approximation (sum * avg_interval_duration).
        """
        interval_end = (
            datetime.fromisoformat(interval_start.replace("Z", "+00:00"))
            + timedelta(minutes=30)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Fetch all telemetry readings within this 30-min window
        readings = conn.execute(
            """
            SELECT recorded_at, pv_power_w, bat_power_w, grid_power_w, load_power_w, bat_soc
            FROM telemetry
            WHERE recorded_at >= ? AND recorded_at <= ?
            ORDER BY recorded_at ASC
            """,
            (interval_start, interval_end),
        ).fetchall()

        if not readings:
            return None

        # Integrate power (W) over time to get energy (Wh)
        # Each reading represents an average over the period since last reading
        total_pv_wh = 0.0
        total_bat_charge_wh = 0.0
        total_bat_discharge_wh = 0.0
        total_grid_import_wh = 0.0
        total_grid_export_wh = 0.0
        total_load_wh = 0.0

        interval_start_dt = datetime.fromisoformat(interval_start.replace("Z", "+00:00"))

        prev_time = interval_start_dt
        for row in readings:
            cur_time = datetime.fromisoformat(row["recorded_at"].replace("Z", "+00:00"))
            duration_h = (cur_time - prev_time).total_seconds() / 3600.0

            pv = max(0.0, float(row["pv_power_w"] or 0))
            bat = float(row["bat_power_w"] or 0)
            grid = float(row["grid_power_w"] or 0)
            load = max(0.0, float(row["load_power_w"] or 0))

            total_pv_wh += pv * duration_h
            total_bat_charge_wh += max(0.0, bat) * duration_h
            total_bat_discharge_wh += max(0.0, -bat) * duration_h
            total_grid_import_wh += max(0.0, grid) * duration_h
            total_grid_export_wh += max(0.0, -grid) * duration_h
            total_load_wh += load * duration_h
            prev_time = cur_time

        bat_soc_end = float(readings[-1]["bat_soc"]) if readings else None

        # Self-consumed solar = pv_yield - exported
        self_consumed_wh = max(0.0, total_pv_wh - total_grid_export_wh)

        # Fetch average prices for this interval
        prices = conn.execute(
            """
            SELECT
                channel_type,
                AVG(per_kwh)      AS avg_per_kwh,
                AVG(spot_per_kwh) AS avg_spot,
                AVG(renewables)   AS avg_renewables
            FROM prices
            WHERE interval_start >= ? AND interval_start < ?
            GROUP BY channel_type
            """,
            (interval_start, interval_end),
        ).fetchall()

        price_map = {r["channel_type"]: dict(r) for r in prices}
        import_price = (price_map.get("general") or {}).get("avg_per_kwh") or 0.0
        export_price = (price_map.get("feedIn") or {}).get("avg_per_kwh") or 0.0
        avg_spot = (price_map.get("general") or {}).get("avg_spot") or 0.0
        avg_renewables = (price_map.get("general") or {}).get("avg_renewables")

        # Cost/revenue in AUD cents: (Wh / 1000) * c/kWh
        import_cost_ac = (total_grid_import_wh / 1000.0) * float(import_price or 0)
        export_revenue_ac = (total_grid_export_wh / 1000.0) * float(export_price or 0)

        return {
            "interval_start": interval_start,
            "interval_end": interval_end,
            "pv_yield_wh": total_pv_wh,
            "battery_charged_wh": total_bat_charge_wh,
            "battery_discharged_wh": total_bat_discharge_wh,
            "grid_import_wh": total_grid_import_wh,
            "grid_export_wh": total_grid_export_wh,
            "load_wh": total_load_wh,
            "bat_soc_end": bat_soc_end,
            "avg_import_price_ckwh": float(import_price or 0),
            "avg_export_price_ckwh": float(export_price or 0),
            "avg_spot_price_ckwh": float(avg_spot or 0),
            "avg_renewables_pct": avg_renewables,
            "import_cost_ac": import_cost_ac,
            "export_revenue_ac": export_revenue_ac,
            "self_consumed_wh": self_consumed_wh,
        }

    def run_30min_aggregation(self, lookback_hours: int = 2) -> int:
        """
        Recompute 30-min summaries for the past lookback_hours.
        Returns number of intervals written.
        """
        now = datetime.now(timezone.utc)
        start = now - timedelta(hours=lookback_hours)
        # Enumerate all 30-min slots in range
        slots = []
        cur = start.replace(minute=(start.minute // 30) * 30, second=0, microsecond=0)
        while cur <= now:
            slots.append(cur.strftime("%Y-%m-%dT%H:%M:%SZ"))
            cur += timedelta(minutes=30)

        written = 0
        started_at = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            with transaction(self.db_path) as conn:
                for slot_start in slots:
                    result = self._aggregate_30min_interval(conn, slot_start)
                    if result is None:
                        continue
                    conn.execute(
                        """
                        INSERT INTO interval_summary_30min
                            (interval_start, interval_end,
                             pv_yield_wh, battery_charged_wh, battery_discharged_wh,
                             grid_import_wh, grid_export_wh, load_wh,
                             bat_soc_end,
                             avg_import_price_ckwh, avg_export_price_ckwh,
                             avg_spot_price_ckwh, avg_renewables_pct,
                             import_cost_ac, export_revenue_ac, self_consumed_wh,
                             computed_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                        ON CONFLICT(interval_start) DO UPDATE SET
                            interval_end          = excluded.interval_end,
                            pv_yield_wh           = excluded.pv_yield_wh,
                            battery_charged_wh    = excluded.battery_charged_wh,
                            battery_discharged_wh = excluded.battery_discharged_wh,
                            grid_import_wh        = excluded.grid_import_wh,
                            grid_export_wh        = excluded.grid_export_wh,
                            load_wh               = excluded.load_wh,
                            bat_soc_end           = excluded.bat_soc_end,
                            avg_import_price_ckwh = excluded.avg_import_price_ckwh,
                            avg_export_price_ckwh = excluded.avg_export_price_ckwh,
                            avg_spot_price_ckwh   = excluded.avg_spot_price_ckwh,
                            avg_renewables_pct    = excluded.avg_renewables_pct,
                            import_cost_ac        = excluded.import_cost_ac,
                            export_revenue_ac     = excluded.export_revenue_ac,
                            self_consumed_wh      = excluded.self_consumed_wh,
                            computed_at           = excluded.computed_at
                        """,
                        (
                            result["interval_start"], result["interval_end"],
                            result["pv_yield_wh"], result["battery_charged_wh"],
                            result["battery_discharged_wh"], result["grid_import_wh"],
                            result["grid_export_wh"], result["load_wh"],
                            result["bat_soc_end"],
                            result["avg_import_price_ckwh"], result["avg_export_price_ckwh"],
                            result["avg_spot_price_ckwh"], result["avg_renewables_pct"],
                            result["import_cost_ac"], result["export_revenue_ac"],
                            result["self_consumed_wh"],
                        ),
                    )
                    written += 1

                conn.execute(
                    """
                    INSERT INTO pipeline_runs (pipeline, started_at, finished_at, status, rows_processed, error_message)
                    VALUES ('aggregation_30min', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'success', ?, NULL)
                    """,
                    (started_at, written),
                )
        except Exception as exc:
            log.error("30min aggregation failed: %s", exc, exc_info=True)
            try:
                with transaction(self.db_path) as conn:
                    conn.execute(
                        """
                        INSERT INTO pipeline_runs (pipeline, started_at, finished_at, status, rows_processed, error_message)
                        VALUES ('aggregation_30min', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'failed', 0, ?)
                        """,
                        (started_at, str(exc)),
                    )
            except Exception:
                pass
            raise

        log.info("aggregator: 30min aggregation wrote %d intervals", written)
        return written

    # ─────────────────────────────────────────────────────────────
    # DAILY AGGREGATION
    # ─────────────────────────────────────────────────────────────

    def _aggregate_day(self, conn, date_str: str, local_tz_offset_hours: int = 10) -> dict | None:
        """
        Aggregate 30-min summaries into a daily summary.

        Args:
            date_str:              YYYY-MM-DD in local time
            local_tz_offset_hours: UTC offset for local time (e.g. 10 for AEST)
        """
        # Convert local date boundaries to UTC for querying
        tz_offset = timedelta(hours=local_tz_offset_hours)
        local_midnight = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc) - tz_offset
        next_midnight = local_midnight + timedelta(days=1)

        day_start_utc = local_midnight.strftime("%Y-%m-%dT%H:%M:%SZ")
        day_end_utc = next_midnight.strftime("%Y-%m-%dT%H:%M:%SZ")

        rows = conn.execute(
            """
            SELECT
                SUM(pv_yield_wh)           AS pv_yield_wh,
                SUM(battery_charged_wh)    AS battery_charged_wh,
                SUM(battery_discharged_wh) AS battery_discharged_wh,
                SUM(grid_import_wh)        AS grid_import_wh,
                SUM(grid_export_wh)        AS grid_export_wh,
                SUM(load_wh)               AS load_wh,
                SUM(import_cost_ac)        AS import_cost_ac,
                SUM(export_revenue_ac)     AS export_revenue_ac,
                SUM(self_consumed_wh)      AS self_consumed_wh,
                AVG(avg_import_price_ckwh) AS avg_import_price,
                AVG(avg_export_price_ckwh) AS avg_export_price,
                MAX(avg_import_price_ckwh) AS peak_import_price,
                MAX(avg_export_price_ckwh) AS peak_export_price,
                COUNT(CASE WHEN avg_import_price_ckwh > 30 THEN 1 END) AS spike_count
            FROM interval_summary_30min
            WHERE interval_start >= ? AND interval_start < ?
            """,
            (day_start_utc, day_end_utc),
        ).fetchone()

        if not rows or rows["pv_yield_wh"] is None:
            return None

        pv_yield_kwh = (rows["pv_yield_wh"] or 0) / 1000.0
        load_kwh = (rows["load_wh"] or 0) / 1000.0
        self_consumed_kwh = (rows["self_consumed_wh"] or 0) / 1000.0

        # Self-consumption rate: % of solar that was used on-site (not exported)
        self_consumption_rate = (self_consumed_kwh / pv_yield_kwh) if pv_yield_kwh > 0 else 0.0
        # Self-sufficiency rate: % of load met by solar + battery (not grid)
        self_sufficiency_rate = min(1.0, (self_consumed_kwh + (rows["battery_discharged_wh"] or 0) / 1000.0) / load_kwh) if load_kwh > 0 else 0.0

        # Convert from AUD cents to AUD
        import_cost_aud = (rows["import_cost_ac"] or 0) / 100.0
        export_revenue_aud = (rows["export_revenue_ac"] or 0) / 100.0

        # Counterfactual: what would import have cost if all load was grid-supplied
        # at the average import price (i.e., no solar/battery)
        avg_import_price_ckwh = rows["avg_import_price"] or 0.0
        counterfactual_cost_aud = (load_kwh * avg_import_price_ckwh) / 100.0
        actual_net_cost_aud = import_cost_aud - export_revenue_aud
        total_savings_aud = counterfactual_cost_aud - actual_net_cost_aud

        return {
            "date": date_str,
            "pv_yield_kwh": pv_yield_kwh,
            "battery_charged_kwh": (rows["battery_charged_wh"] or 0) / 1000.0,
            "battery_discharged_kwh": (rows["battery_discharged_wh"] or 0) / 1000.0,
            "grid_import_kwh": (rows["grid_import_wh"] or 0) / 1000.0,
            "grid_export_kwh": (rows["grid_export_wh"] or 0) / 1000.0,
            "load_kwh": load_kwh,
            "self_consumption_rate": round(self_consumption_rate, 4),
            "self_sufficiency_rate": round(self_sufficiency_rate, 4),
            "grid_import_cost_aud": round(import_cost_aud, 4),
            "grid_export_revenue_aud": round(export_revenue_aud, 4),
            "counterfactual_cost_aud": round(counterfactual_cost_aud, 4),
            "total_savings_aud": round(total_savings_aud, 4),
            "avg_import_price_ckwh": avg_import_price_ckwh,
            "avg_export_price_ckwh": rows["avg_export_price"],
            "peak_import_price_ckwh": rows["peak_import_price"],
            "peak_export_price_ckwh": rows["peak_export_price"],
            "spike_count": rows["spike_count"] or 0,
        }

    def run_daily_aggregation(self, days_back: int = 2, local_tz_offset_hours: int = 10) -> int:
        """
        Recompute daily summaries for the past days_back days.
        Returns number of days written.
        """
        written = 0
        started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            with transaction(self.db_path) as conn:
                today = datetime.now(timezone.utc) + timedelta(hours=local_tz_offset_hours)
                for i in range(days_back):
                    target = today - timedelta(days=i)
                    date_str = target.strftime("%Y-%m-%d")
                    result = self._aggregate_day(conn, date_str, local_tz_offset_hours)
                    if result is None:
                        continue
                    conn.execute(
                        """
                        INSERT INTO daily_summary
                            (date, pv_yield_kwh, battery_charged_kwh, battery_discharged_kwh,
                             grid_import_kwh, grid_export_kwh, load_kwh,
                             self_consumption_rate, self_sufficiency_rate,
                             grid_import_cost_aud, grid_export_revenue_aud,
                             counterfactual_cost_aud, total_savings_aud,
                             avg_import_price_ckwh, avg_export_price_ckwh,
                             peak_import_price_ckwh, peak_export_price_ckwh, spike_count,
                             computed_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                        ON CONFLICT(date) DO UPDATE SET
                            pv_yield_kwh            = excluded.pv_yield_kwh,
                            battery_charged_kwh     = excluded.battery_charged_kwh,
                            battery_discharged_kwh  = excluded.battery_discharged_kwh,
                            grid_import_kwh         = excluded.grid_import_kwh,
                            grid_export_kwh         = excluded.grid_export_kwh,
                            load_kwh                = excluded.load_kwh,
                            self_consumption_rate   = excluded.self_consumption_rate,
                            self_sufficiency_rate   = excluded.self_sufficiency_rate,
                            grid_import_cost_aud    = excluded.grid_import_cost_aud,
                            grid_export_revenue_aud = excluded.grid_export_revenue_aud,
                            counterfactual_cost_aud = excluded.counterfactual_cost_aud,
                            total_savings_aud       = excluded.total_savings_aud,
                            avg_import_price_ckwh   = excluded.avg_import_price_ckwh,
                            avg_export_price_ckwh   = excluded.avg_export_price_ckwh,
                            peak_import_price_ckwh  = excluded.peak_import_price_ckwh,
                            peak_export_price_ckwh  = excluded.peak_export_price_ckwh,
                            spike_count             = excluded.spike_count,
                            computed_at             = excluded.computed_at
                        """,
                        (
                            result["date"],
                            result["pv_yield_kwh"], result["battery_charged_kwh"],
                            result["battery_discharged_kwh"], result["grid_import_kwh"],
                            result["grid_export_kwh"], result["load_kwh"],
                            result["self_consumption_rate"], result["self_sufficiency_rate"],
                            result["grid_import_cost_aud"], result["grid_export_revenue_aud"],
                            result["counterfactual_cost_aud"], result["total_savings_aud"],
                            result["avg_import_price_ckwh"], result["avg_export_price_ckwh"],
                            result["peak_import_price_ckwh"], result["peak_export_price_ckwh"],
                            result["spike_count"],
                        ),
                    )
                    written += 1

                conn.execute(
                    """
                    INSERT INTO pipeline_runs (pipeline, started_at, finished_at, status, rows_processed)
                    VALUES ('aggregation_daily', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), 'success', ?)
                    """,
                    (started_at, written),
                )
        except Exception as exc:
            log.error("daily aggregation failed: %s", exc, exc_info=True)
            raise

        log.info("aggregator: daily aggregation wrote %d days", written)
        return written

    def run_all(self, lookback_hours: int = 2, days_back: int = 2) -> dict:
        """Run both 30-min and daily aggregations. Returns stats."""
        intervals = self.run_30min_aggregation(lookback_hours)
        days = self.run_daily_aggregation(days_back)
        return {"intervals_written": intervals, "days_written": days}
