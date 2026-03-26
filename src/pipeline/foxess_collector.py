"""
FoxESS inverter telemetry collector.

Uses the official `foxesscloud` Python SDK (PyPI: foxesscloud).

The foxesscloud SDK handles:
  - HMAC-MD5 signature authentication
  - Rate limiting
  - Device serial number management

Rate limit: FoxESS Cloud enforces 1,440 API calls/day (ADR-008).
Default poll interval is 180s (3 min) = 480 calls/day, leaving budget
for control commands and burst polling during price spikes.

The collector accepts an optional `budget` object (FoxESSBudget, built by
the backend architect in src/engine/). If provided, `run_once()` calls
`budget.can_poll()` before making an API call and skips the cycle if the
budget is exhausted. If no budget is provided the collector polls freely
(useful for testing and initial setup).

Bronze: raw_foxess_telemetry (append-only)
Silver: telemetry (upsert on recorded_at + device_sn)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable

import foxesscloud.openapi as f

from .db import transaction, DB_PATH

log = logging.getLogger(__name__)


@runtime_checkable
class BudgetProtocol(Protocol):
    """
    Minimal interface the collector requires from the budget tracker.
    The full FoxESSBudget implementation lives in src/engine/ (backend architect).
    """
    def can_poll(self) -> bool:
        """Return True if a telemetry poll call is within budget."""
        ...

    def record_call(self, call_type: str) -> None:
        """Record that an API call was made. call_type: 'poll' | 'cmd'."""
        ...


class FoxESSCollector:
    """
    Collects real-time telemetry from FoxESS Cloud via the official SDK.

    Args:
        api_key:    FoxESS API key.
        token:      FoxESS user token.
        device_sn:  Inverter serial number.
        db_path:    SQLite database path.
        budget:     Optional FoxESSBudget instance. If provided, can_poll()
                    is checked before each API call. If None, polls freely.
    """

    def __init__(
        self,
        api_key: str,
        token: str,
        device_sn: str,
        db_path=DB_PATH,
        budget: BudgetProtocol | None = None,
    ):
        self.device_sn = device_sn
        self.db_path = db_path
        self.budget = budget

        # Configure the foxesscloud SDK
        f.api_key = api_key
        f.token = token
        f.device_sn = device_sn

    def _log_run(self, conn, status: str, error: str | None, started_at: str):
        conn.execute(
            """
            INSERT INTO pipeline_runs
                (pipeline, started_at, finished_at, status, rows_ingested, error_message, pipeline_version)
            VALUES ('foxess_telemetry', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, '1.0.0')
            """,
            (started_at, status, 1 if status == "success" else 0, error),
        )

    def fetch_realtime(self) -> dict:
        """
        Fetch current device state via foxesscloud SDK.
        Returns a normalised telemetry dict ready for DB insertion.

        Raises RuntimeError if the SDK returns no data (API error, exhausted
        budget on the FoxESS side, or misconfigured credentials).
        """
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        device = f.get_real(device_sn=self.device_sn)
        if device is None:
            raise RuntimeError("foxesscloud SDK returned None — check API key, token, and device SN")

        bat_power  = float(device.get("batChargePower", 0) or 0) - float(device.get("batDischargePower", 0) or 0)
        grid_power = float(device.get("gridConsumptionPower", 0) or 0) - float(device.get("feedinPower", 0) or 0)

        return {
            "device_sn":       self.device_sn,
            "device_time":     device.get("time", now_utc),
            "device_time_utc": now_utc,
            "pv_power_w":      float(device.get("pvPower", 0) or device.get("generationPower", 0) or 0),
            "bat_power_w":     bat_power,
            "grid_power_w":    grid_power,
            "load_power_w":    float(device.get("loadsPower", 0) or 0),
            "eps_power_w":     float(device.get("epsPower", 0) or 0),
            "bat_soc":         float(device.get("SoC", 0) or 0),
            "bat_temp_c":      device.get("batTemperature"),
            "bat_voltage_v":   device.get("batVolt"),
            "bat_current_a":   device.get("batCurrent"),
            "inv_temp_c":      device.get("ambientTemperation"),
            "grid_voltage_v":  device.get("gridVoltage"),
            "grid_freq_hz":    device.get("gridFrequency"),
            "work_mode":       device.get("workMode"),
            "today_yield_kwh":     device.get("todayYield"),
            "today_charge_kwh":    device.get("chargeEnergyToday"),
            "today_discharge_kwh": device.get("dischargeEnergyToday"),
            "today_import_kwh":    device.get("gridConsumptionEnergyToday"),
            "today_export_kwh":    device.get("feedinEnergyToday"),
        }

    def _insert_bronze(self, conn, t: dict) -> None:
        conn.execute(
            """
            INSERT INTO raw_foxess_telemetry
                (device_sn, device_time, device_time_utc,
                 pv_power_w, bat_power_w, grid_power_w, load_power_w, eps_power_w,
                 bat_soc, bat_temp_c, bat_voltage_v, bat_current_a,
                 inv_temp_c, grid_voltage_v, grid_freq_hz, work_mode,
                 today_yield_kwh, today_charge_kwh, today_discharge_kwh,
                 today_import_kwh, today_export_kwh)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                t["device_sn"], t["device_time"], t["device_time_utc"],
                t["pv_power_w"], t["bat_power_w"], t["grid_power_w"],
                t["load_power_w"], t["eps_power_w"],
                t["bat_soc"], t["bat_temp_c"], t["bat_voltage_v"], t["bat_current_a"],
                t["inv_temp_c"], t["grid_voltage_v"], t["grid_freq_hz"], t["work_mode"],
                t["today_yield_kwh"], t["today_charge_kwh"], t["today_discharge_kwh"],
                t["today_import_kwh"], t["today_export_kwh"],
            ),
        )

    def _upsert_silver(self, conn, t: dict) -> None:
        conn.execute(
            """
            INSERT INTO telemetry
                (recorded_at, device_sn, pv_power_w, bat_power_w, grid_power_w,
                 load_power_w, bat_soc, bat_temp_c, work_mode, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
            ON CONFLICT(recorded_at, device_sn) DO UPDATE SET
                pv_power_w   = excluded.pv_power_w,
                bat_power_w  = excluded.bat_power_w,
                grid_power_w = excluded.grid_power_w,
                load_power_w = excluded.load_power_w,
                bat_soc      = excluded.bat_soc,
                bat_temp_c   = excluded.bat_temp_c,
                work_mode    = excluded.work_mode,
                updated_at   = excluded.updated_at
            """,
            (
                t["device_time_utc"], t["device_sn"],
                t["pv_power_w"], t["bat_power_w"], t["grid_power_w"], t["load_power_w"],
                t["bat_soc"], t["bat_temp_c"], t["work_mode"],
            ),
        )

    def run_once(self) -> dict:
        """
        Execute one telemetry poll cycle.

        If a budget tracker is configured, checks can_poll() first.
        Skips the API call and returns {"status": "budget_skip"} if
        the daily poll budget is exhausted — preserving the command reserve.
        """
        started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Budget check — skip poll if reserve would be breached
        if self.budget is not None and not self.budget.can_poll():
            log.warning(
                "foxess_collector: poll budget exhausted — skipping cycle to preserve command reserve"
            )
            return {"status": "budget_skip"}

        try:
            t = self.fetch_realtime()

            # Record the call against the budget after a successful API response
            if self.budget is not None:
                self.budget.record_call("poll")

            with transaction(self.db_path) as conn:
                self._insert_bronze(conn, t)
                self._upsert_silver(conn, t)
                self._log_run(conn, "success", None, started_at)

            log.info(
                "foxess_collector: SoC=%.1f%% PV=%.0fW bat=%.0fW grid=%.0fW",
                t["bat_soc"], t["pv_power_w"], t["bat_power_w"], t["grid_power_w"],
            )
            return {"status": "success", "telemetry": t}

        except Exception as exc:
            log.error("foxess_collector failed: %s", exc, exc_info=True)
            try:
                with transaction(self.db_path) as conn:
                    self._log_run(conn, "failed", str(exc), started_at)
            except Exception:
                pass
            return {"status": "failed", "error": str(exc)}
