"""GET /health — no auth required."""
from __future__ import annotations

import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from src.api.dependencies import AppSettings, DbConn
from src.pipeline import analytics

router = APIRouter()
_start_time = time.monotonic()


class ServiceStatuses(BaseModel):
    amber_api: str
    foxess_api: str
    solar_api: str
    sqlite: str


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: float
    services: ServiceStatuses


@router.get("/health", response_model=HealthResponse)
def get_health(db: DbConn, settings: AppSettings):
    uptime = round(time.monotonic() - _start_time, 1)

    # Check SQLite connectivity
    sqlite_ok = "disconnected"
    try:
        db.execute("SELECT 1")
        sqlite_ok = "connected"
    except Exception:
        pass

    # Check data freshness as a proxy for external API connectivity
    health_data = {}
    try:
        health_data = analytics.get_pipeline_health(settings.db_path_obj)
    except Exception:
        pass

    freshness = health_data.get("freshness", {})
    prices_age = freshness.get("prices_age_min")
    telemetry_age = freshness.get("telemetry_age_min")
    solar_age = freshness.get("solar_forecast_age_min")

    amber_status = "connected" if prices_age is not None and prices_age < 15 else "unknown"
    foxess_status = "connected" if telemetry_age is not None and telemetry_age < 10 else "unknown"
    solar_status = "connected" if solar_age is not None and solar_age < 120 else "unknown"

    overall = "healthy" if sqlite_ok == "connected" else "degraded"

    return HealthResponse(
        status=overall,
        version=settings.version,
        uptime_seconds=uptime,
        services=ServiceStatuses(
            amber_api=amber_status,
            foxess_api=foxess_status,
            solar_api=solar_status,
            sqlite=sqlite_ok,
        ),
    )
