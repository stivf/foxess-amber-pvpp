"""
Amber Electric price collector.

Uses the official `amberelectric` Python SDK (PyPI: amberelectric).

Polls every 5 minutes for:
  - Current interval price (general + feedIn channels)
  - 24h price forecast

Bronze: raw_amber_prices (append-only)
Silver: prices (upsert on interval_start + channel_type)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import amberelectric
from amberelectric.api import amber_api

from .db import transaction, DB_PATH

log = logging.getLogger(__name__)


class AmberCollector:
    """
    Collects spot prices and forecasts from Amber Electric via the official SDK.

    Args:
        api_key:  Amber API key (from user's Amber account dashboard).
        site_id:  Amber site ID (returned by list_sites()).
        db_path:  Path to SQLite database.
    """

    def __init__(self, api_key: str, site_id: str, db_path=DB_PATH):
        self.api_key = api_key
        self.site_id = site_id
        self.db_path = db_path

        configuration = amberelectric.Configuration(access_token=api_key)
        self._client = amber_api.AmberApi(amberelectric.ApiClient(configuration))

    def _log_run(self, conn, status: str, rows_ingested: int, error: str | None, started_at: str):
        conn.execute(
            """
            INSERT INTO pipeline_runs
                (pipeline, started_at, finished_at, status, rows_ingested, error_message, pipeline_version)
            VALUES ('amber_prices', ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'), ?, ?, ?, '1.0.0')
            """,
            (started_at, status, rows_ingested, error),
        )

    def _interval_to_dict(self, interval) -> dict:
        """Normalise an amberelectric SDK interval object to a flat dict."""
        # The SDK returns objects with snake_case attributes
        channel = getattr(interval, "channel_type", "general")
        # SDK channelType enum value is e.g. ChannelType.GENERAL -> "general"
        channel_str = channel.value if hasattr(channel, "value") else str(channel)

        interval_type = getattr(interval, "type", "")
        type_str = interval_type.value if hasattr(interval_type, "value") else str(interval_type)

        spike = getattr(interval, "spike_status", "none")
        spike_str = spike.value if hasattr(spike, "value") else str(spike)

        descriptor = getattr(interval, "descriptor", None)
        descriptor_str = descriptor.value if descriptor and hasattr(descriptor, "value") else str(descriptor) if descriptor else None

        return {
            "interval_start":     str(getattr(interval, "start_time", "")),
            "interval_end":       str(getattr(interval, "end_time", "")),
            "interval_type":      type_str,
            "channel_type":       channel_str,
            "spot_per_kwh":       float(getattr(interval, "spot_per_kwh", 0) or 0),
            "per_kwh":            float(getattr(interval, "per_kwh", 0) or 0),
            "renewables":         getattr(interval, "renewables", None),
            "spike_status":       spike_str,
            "descriptor":         descriptor_str,
            "estimate":           1 if getattr(interval, "estimate", False) else 0,
            "tariff_information": str(getattr(interval, "tariff_information", "") or ""),
            "range_json":         str(getattr(interval, "range", "") or ""),
        }

    def _upsert_bronze(self, conn, intervals: list[dict], source_url: str) -> int:
        rows = 0
        for p in intervals:
            conn.execute(
                """
                INSERT INTO raw_amber_prices
                    (source_url, interval_start, interval_end, interval_type,
                     channel_type, spot_per_kwh, per_kwh, renewables,
                     spike_status, descriptor, estimate, tariff_information, range_json)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                (
                    source_url,
                    p["interval_start"], p["interval_end"], p["interval_type"],
                    p["channel_type"], p["spot_per_kwh"], p["per_kwh"],
                    p["renewables"], p["spike_status"], p["descriptor"],
                    p["estimate"], p["tariff_information"], p["range_json"],
                ),
            )
            rows += 1
        return rows

    def _upsert_silver(self, conn, intervals: list[dict]) -> None:
        for p in intervals:
            conn.execute(
                """
                INSERT INTO prices
                    (interval_start, channel_type, is_forecast, spot_per_kwh, per_kwh,
                     renewables, spike_status, descriptor, updated_at)
                VALUES (?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'))
                ON CONFLICT(interval_start, channel_type) DO UPDATE SET
                    is_forecast    = excluded.is_forecast,
                    spot_per_kwh   = excluded.spot_per_kwh,
                    per_kwh        = excluded.per_kwh,
                    renewables     = excluded.renewables,
                    spike_status   = excluded.spike_status,
                    descriptor     = excluded.descriptor,
                    updated_at     = excluded.updated_at
                """,
                (
                    p["interval_start"], p["channel_type"], p["estimate"],
                    p["spot_per_kwh"], p["per_kwh"], p["renewables"],
                    p["spike_status"], p["descriptor"],
                ),
            )

    def run_once(self) -> dict:
        """
        One collection cycle:
        1. Fetch current interval (actual for just-closed slot + next estimate)
        2. Fetch full 24h price forecast
        3. Write Bronze + upsert Silver
        """
        started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows_bronze = 0
        try:
            current_raw  = self._client.get_current_price(self.site_id, next=48)
            forecast_raw = self._client.get_prices(self.site_id)

            current  = [self._interval_to_dict(i) for i in current_raw]
            forecast = [self._interval_to_dict(i) for i in forecast_raw]

            # Deduplicate — prefer current (actuals) over forecast for same interval
            seen = {(p["interval_start"], p["channel_type"]) for p in current}
            forecast_new = [p for p in forecast if (p["interval_start"], p["channel_type"]) not in seen]
            all_intervals = current + forecast_new

            with transaction(self.db_path) as conn:
                rows_bronze += self._upsert_bronze(conn, current, f"get_current_price/{self.site_id}")
                rows_bronze += self._upsert_bronze(conn, forecast, f"get_prices/{self.site_id}")
                self._upsert_silver(conn, all_intervals)
                self._log_run(conn, "success", rows_bronze, None, started_at)

            log.info("amber_collector: ingested %d raw intervals", rows_bronze)
            return {"status": "success", "rows_ingested": rows_bronze}

        except Exception as exc:
            log.error("amber_collector failed: %s", exc, exc_info=True)
            try:
                with transaction(self.db_path) as conn:
                    self._log_run(conn, "failed", 0, str(exc), started_at)
            except Exception:
                pass
            return {"status": "failed", "error": str(exc)}
