"""Battery state and history endpoints."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query, HTTPException

from src.api.dependencies import Auth, DbConn, AppSettings
from src.pipeline import analytics
from src.shared.models import foxess_mode_to_battery_mode

router = APIRouter()

VALID_INTERVALS = {"1m", "5m", "30m", "1h", "1d"}
INTERVAL_MINUTES = {"1m": 1, "5m": 5, "30m": 30, "1h": 60, "1d": 1440}


@router.get("/battery/state")
def get_battery_state(auth: Auth, db: DbConn, settings: AppSettings):
    state = analytics.get_current_state(settings.db_path_obj)
    tel = state.get("telemetry") or {}

    if not tel:
        raise HTTPException(status_code=503, detail={"error": {"code": "NO_DATA", "message": "No telemetry data available"}})

    battery_mode = foxess_mode_to_battery_mode(tel.get("work_mode"))

    return {
        "soc": tel.get("bat_soc", 0.0),
        "power_w": tel.get("bat_power_w", 0.0),
        "mode": battery_mode.value,
        "capacity_kwh": settings.bat_capacity_kwh,
        "min_soc": settings.bat_min_soc,
        "charge_rate_w": 3000.0,
        "discharge_rate_w": 3000.0,
        "temperature": tel.get("bat_temp_c"),
        "updated_at": tel.get("recorded_at", state.get("updated_at", "")),
    }


@router.get("/battery/history")
def get_battery_history(
    auth: Auth,
    db: DbConn,
    settings: AppSettings,
    from_: str = Query(alias="from"),
    to: str | None = Query(default=None),
    interval: str = Query(default="5m"),
):
    if interval not in VALID_INTERVALS:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_PARAMETER", "message": f"interval must be one of {sorted(VALID_INTERVALS)}"}},
        )

    try:
        from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_PARAMETER", "message": "Invalid 'from' datetime"}})

    to_dt = datetime.now(timezone.utc)
    if to:
        try:
            to_dt = datetime.fromisoformat(to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_PARAMETER", "message": "Invalid 'to' datetime"}})

    from_str = from_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    to_str = to_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    # Query telemetry, group into buckets
    rows = db.execute(
        """
        SELECT recorded_at, bat_soc, bat_power_w, pv_power_w, load_power_w, grid_power_w
        FROM telemetry
        WHERE recorded_at >= ? AND recorded_at <= ?
        ORDER BY recorded_at ASC
        """,
        (from_str, to_str),
    ).fetchall()

    bucket_minutes = INTERVAL_MINUTES[interval]
    buckets: dict[str, list] = {}

    for row in rows:
        try:
            dt = datetime.fromisoformat(row["recorded_at"].replace("Z", "+00:00"))
        except ValueError:
            continue
        total_minutes = (dt.hour * 60 + dt.minute) // bucket_minutes * bucket_minutes
        bucket_hour = total_minutes // 60
        bucket_min = total_minutes % 60
        bucket_key = dt.replace(hour=bucket_hour, minute=bucket_min, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
        buckets.setdefault(bucket_key, []).append(dict(row))

    def avg(rows, key):
        vals = [r[key] for r in rows if r.get(key) is not None]
        return round(sum(vals) / len(vals), 2) if vals else 0.0

    data = []
    for bucket_time in sorted(buckets):
        pts = buckets[bucket_time]
        data.append({
            "time": bucket_time,
            "avg_soc": avg(pts, "bat_soc"),
            "avg_power_w": avg(pts, "bat_power_w"),
            "avg_solar_w": avg(pts, "pv_power_w"),
            "avg_load_w": avg(pts, "load_power_w"),
            "avg_grid_w": avg(pts, "grid_power_w"),
        })

    return {"interval": interval, "data": data}
