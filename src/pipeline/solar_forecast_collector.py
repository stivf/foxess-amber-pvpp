"""
Solar irradiance forecast collector.

Uses Open-Meteo via httpx (free, no API key). Architecture doc confirms
Open-Meteo as the solar forecast source (ADR-006 / ARCHITECTURE.md §4.2).

Bronze: raw_solar_forecasts (append-only)
Silver: solar_forecasts (upsert on slot_start — keeps latest forecast run)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from .db import transaction, DB_PATH

log = logging.getLogger(__name__)

OPEN_METEO_BASE = "https://api.open-meteo.com/v1"


def estimate_pv_yield(
    ghi_wm2: float,
    panel_capacity_w: float,
    interval_minutes: int,
    system_efficiency: float = 0.80,
) -> float:
    """
    Estimate PV energy yield for a forecast interval.

    yield_Wh = GHI (W/m²) × (panel_capacity_W / 1000) × efficiency × interval_hours

    STC irradiance = 1000 W/m². efficiency accounts for inverter losses,
    wiring, temperature, and soiling (configurable via system_config).
    """
    if ghi_wm2 <= 0:
        return 0.0
    return ghi_wm2 * (panel_capacity_w / 1000.0) * system_efficiency * (interval_minutes / 60.0)


class SolarForecastCollector:
    """
    Fetches 48h hourly solar irradiance forecasts from Open-Meteo.

    Args:
        latitude:           Site latitude (decimal, e.g. -27.47 for Brisbane)
        longitude:          Site longitude (decimal, e.g. 153.02)
        panel_capacity_w:   Total PV panel capacity (W)
        system_efficiency:  System efficiency factor (default 0.80)
        db_path:            SQLite database path
    """

    def __init__(
        self,
        latitude: float,
        longitude: float,
        panel_capacity_w: float = 6600.0,
        system_efficiency: float = 0.80,
        db_path=DB_PATH,
    ):
        self.latitude = latitude
        self.longitude = longitude
        self.panel_capacity_w = panel_capacity_w
        self.system_efficiency = system_efficiency
        self.db_path = db_path

    def fetch_forecast(self) -> list[dict]:
        """Fetch 48h hourly forecast from Open-Meteo and return parsed slot dicts."""
        params = {
            "latitude":  self.latitude,
            "longitude": self.longitude,
            "hourly":    "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,temperature_2m,cloudcover",
            "forecast_days": 2,
            "timezone": "UTC",
        }
        resp = httpx.get(f"{OPEN_METEO_BASE}/forecast", params=params, timeout=30.0)
        resp.raise_for_status()
        data = resp.json()

        hourly = data.get("hourly", {})
        times       = hourly.get("time", [])
        ghi_list    = hourly.get("shortwave_radiation", [])
        dni_list    = hourly.get("direct_normal_irradiance", [])
        dhi_list    = hourly.get("diffuse_radiation", [])
        temp_list   = hourly.get("temperature_2m", [])
        cloud_list  = hourly.get("cloudcover", [])

        run_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        slots = []
        for i, t in enumerate(times):
            slot_start = f"{t}:00Z" if not t.endswith("Z") else t
            ghi = ghi_list[i] if i < len(ghi_list) else None
            slots.append({
                "forecast_run_time": run_time,
                "forecast_source":   "open-meteo",
                "slot_start":        slot_start,
                "interval_minutes":  60,
                "ghi_wm2":           ghi,
                "dni_wm2":           dni_list[i] if i < len(dni_list) else None,
                "dhi_wm2":           dhi_list[i] if i < len(dhi_list) else None,
                "est_pv_yield_wh":   estimate_pv_yield(
                    ghi or 0.0, self.panel_capacity_w, 60, self.system_efficiency
                ),
                "cloud_cover_pct":   cloud_list[i] if i < len(cloud_list) else None,
                "temp_c":            temp_list[i] if i < len(temp_list) else None,
            })
        return slots

    def _insert_bronze(self, conn, slots: list[dict]) -> int:
        rows = 0
        for s in slots:
            conn.execute(
                """
                INSERT INTO raw_solar_forecasts
                    (forecast_source, forecast_run_time, slot_start, slot_end,
                     interval_minutes, ghi_wm2, dni_wm2, dhi_wm2,
                     est_pv_yield_wh, cloud_cover_pct, temp_c)
                VALUES (?,?,?,
                    datetime(?, '+' || ? || ' minutes'),
                    ?,?,?,?,?,?,?)
                """,
                (
                    s["forecast_source"], s["forecast_run_time"], s["slot_start"],
                    s["slot_start"], s["interval_minutes"],
                    s["interval_minutes"],
                    s["ghi_wm2"], s["dni_wm2"], s["dhi_wm2"],
                    s["est_pv_yield_wh"], s["cloud_cover_pct"], s["temp_c"],
                ),
            )
            rows += 1
        return rows

    def _upsert_silver(self, conn, slots: list[dict]) -> None:
        for s in slots:
            conn.execute(
                """
                INSERT INTO solar_forecasts
                    (slot_start, slot_end, forecast_source, forecast_run_time,
                     ghi_wm2, est_pv_yield_wh, cloud_cover_pct, temp_c, updated_at)
                VALUES (?,
                    datetime(?, '+' || ? || ' minutes'),
                    ?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                ON CONFLICT(slot_start) DO UPDATE SET
                    forecast_source   = excluded.forecast_source,
                    forecast_run_time = excluded.forecast_run_time,
                    ghi_wm2           = excluded.ghi_wm2,
                    est_pv_yield_wh   = excluded.est_pv_yield_wh,
                    cloud_cover_pct   = excluded.cloud_cover_pct,
                    temp_c            = excluded.temp_c,
                    updated_at        = excluded.updated_at
                """,
                (
                    s["slot_start"], s["slot_start"], s["interval_minutes"],
                    s["forecast_source"], s["forecast_run_time"],
                    s["ghi_wm2"], s["est_pv_yield_wh"], s["cloud_cover_pct"], s["temp_c"],
                ),
            )

    def _log_run(self, conn, status: str, rows: int, error: str | None, started_at: str):
        conn.execute(
            """
            INSERT INTO pipeline_runs
                (pipeline, started_at, finished_at, status, rows_ingested, error_message, pipeline_version)
            VALUES ('solar_forecast', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, '1.0.0')
            """,
            (started_at, status, rows, error),
        )

    def run_once(self) -> dict:
        started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        try:
            slots = self.fetch_forecast()
            with transaction(self.db_path) as conn:
                rows = self._insert_bronze(conn, slots)
                self._upsert_silver(conn, slots)
                self._log_run(conn, "success", rows, None, started_at)
            total_yield = sum(s["est_pv_yield_wh"] for s in slots)
            log.info(
                "solar_forecast_collector: %d slots ingested, 48h est. yield %.1f Wh",
                rows, total_yield,
            )
            return {"status": "success", "rows_ingested": rows, "total_yield_wh": total_yield}
        except Exception as exc:
            log.error("solar_forecast_collector failed: %s", exc, exc_info=True)
            try:
                with transaction(self.db_path) as conn:
                    self._log_run(conn, "failed", 0, str(exc), started_at)
            except Exception:
                pass
            return {"status": "failed", "error": str(exc)}
