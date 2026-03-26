"""Pricing endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query, HTTPException

from src.api.dependencies import Auth, DbConn, AppSettings
from src.pipeline import analytics

router = APIRouter()

VALID_INTERVALS = {"5m", "30m", "1h", "1d"}


@router.get("/pricing/current")
def get_current_pricing(auth: Auth, db: DbConn, settings: AppSettings):
    state = analytics.get_current_state(settings.db_path_obj)
    prices = state.get("prices") or {}
    general = prices.get("general") or {}
    feed_in = prices.get("feedIn") or {}

    forecast_raw = analytics.get_price_feed(hours_ahead=24, db_path=settings.db_path_obj)

    # Build forecast list from general channel only, future intervals
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    forecast = []
    seen_starts = set()
    for p in forecast_raw:
        if p.get("channel_type") != "general":
            continue
        start = p.get("interval_start", "")
        if start <= now_str or start in seen_starts:
            continue
        seen_starts.add(start)

        # Estimate end from 30-min interval
        try:
            from datetime import timedelta
            end_dt = datetime.fromisoformat(start.replace("Z", "+00:00")) + timedelta(minutes=30)
            end_str = end_dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            end_str = start

        forecast.append({
            "start_time": start,
            "end_time": end_str,
            "per_kwh": p.get("per_kwh", 0.0),
            "descriptor": p.get("descriptor"),
            "renewables_pct": p.get("renewables"),
        })

    return {
        "current": {
            "per_kwh": general.get("per_kwh", 0.0),
            "feed_in_per_kwh": feed_in.get("per_kwh", 0.0),
            "descriptor": general.get("descriptor", "neutral"),
            "renewables_pct": general.get("renewables"),
            "spike_status": general.get("spike_status", "none"),
            "updated_at": state.get("updated_at", ""),
        },
        "forecast": forecast,
    }


@router.get("/pricing/history")
def get_pricing_history(
    auth: Auth,
    db: DbConn,
    settings: AppSettings,
    from_: str = Query(alias="from"),
    to: str | None = Query(default=None),
    interval: str = Query(default="30m"),
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

    rows = db.execute(
        """
        SELECT interval_start, per_kwh
        FROM prices
        WHERE channel_type = 'general' AND interval_start >= ? AND interval_start <= ?
        ORDER BY interval_start ASC
        """,
        (from_str, to_str),
    ).fetchall()

    feed_rows = db.execute(
        """
        SELECT interval_start, per_kwh AS feed_in_per_kwh
        FROM prices
        WHERE channel_type = 'feedIn' AND interval_start >= ? AND interval_start <= ?
        ORDER BY interval_start ASC
        """,
        (from_str, to_str),
    ).fetchall()

    feed_map = {r["interval_start"]: r["feed_in_per_kwh"] for r in feed_rows}

    from collections import defaultdict
    INTERVAL_MINUTES = {"5m": 5, "30m": 30, "1h": 60, "1d": 1440}
    bucket_minutes = INTERVAL_MINUTES[interval]
    buckets: dict[str, list] = defaultdict(list)

    for row in rows:
        try:
            dt = datetime.fromisoformat(row["interval_start"].replace("Z", "+00:00"))
        except ValueError:
            continue
        total_minutes = (dt.hour * 60 + dt.minute) // bucket_minutes * bucket_minutes
        bh = total_minutes // 60
        bm = total_minutes % 60
        bkey = dt.replace(hour=bh, minute=bm, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
        buckets[bkey].append({"per_kwh": row["per_kwh"], "feed_in": feed_map.get(row["interval_start"], 0.0)})

    data = []
    for btime in sorted(buckets):
        pts = buckets[btime]
        prices_list = [p["per_kwh"] for p in pts]
        feed_list = [p["feed_in"] for p in pts]
        data.append({
            "time": btime,
            "avg_per_kwh": round(sum(prices_list) / len(prices_list), 4),
            "min_per_kwh": round(min(prices_list), 4),
            "max_per_kwh": round(max(prices_list), 4),
            "avg_feed_in": round(sum(feed_list) / len(feed_list), 4) if feed_list else 0.0,
        })

    return {"interval": interval, "data": data}
