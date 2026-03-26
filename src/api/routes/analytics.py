"""Analytics/savings endpoints."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Query, HTTPException

from src.api.dependencies import Auth, DbConn, AppSettings
from src.pipeline import analytics

router = APIRouter()

VALID_PERIODS = {"day", "week", "month", "year"}


@router.get("/analytics/savings")
def get_savings(
    auth: Auth,
    db: DbConn,
    settings: AppSettings,
    period: str = Query(default="month"),
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    if period not in VALID_PERIODS:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_PARAMETER", "message": f"period must be one of {sorted(VALID_PERIODS)}"}},
        )

    now = datetime.now(timezone.utc)

    if from_ is None:
        if period == "day":
            from_dt = now.replace(hour=0, minute=0, second=0)
        elif period == "week":
            from_dt = now - timedelta(days=7)
        elif period == "month":
            from_dt = now.replace(day=1, hour=0, minute=0, second=0)
        else:  # year
            from_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0)
    else:
        try:
            from_dt = datetime.fromisoformat(from_.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_PARAMETER", "message": "Invalid 'from' datetime"}})

    to_dt = now
    if to:
        try:
            to_dt = datetime.fromisoformat(to.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_PARAMETER", "message": "Invalid 'to' datetime"}})

    date_from = from_dt.strftime("%Y-%m-%d")
    date_to = to_dt.strftime("%Y-%m-%d")

    report = analytics.get_savings_report(date_from, date_to, settings.db_path_obj)
    totals = report.get("totals") or {}
    days = report.get("days") or []

    breakdown = [
        {
            "date": d.get("date", ""),
            "savings_dollars": round(d.get("total_savings_aud", 0.0), 2),
            "solar_kwh": round(d.get("pv_yield_kwh", 0.0), 2),
            "import_kwh": round(d.get("grid_import_kwh", 0.0), 2),
            "export_kwh": round(d.get("grid_export_kwh", 0.0), 2),
        }
        for d in days
    ]

    return {
        "period": period,
        "from": from_dt.isoformat(),
        "to": to_dt.isoformat(),
        "total_savings_dollars": round(totals.get("total_savings_aud", 0.0), 2),
        "grid_import_kwh": round(totals.get("grid_import_kwh", 0.0), 2),
        "grid_export_kwh": round(totals.get("grid_export_kwh", 0.0), 2),
        "solar_generation_kwh": round(totals.get("pv_yield_kwh", 0.0), 2),
        "self_consumption_pct": round(totals.get("avg_self_consumption_rate", 0.0) * 100, 1),
        "battery_cycles": 0,  # Not currently tracked; future enhancement
        "avg_buy_price": 0.0,  # Requires weighted avg across days
        "avg_sell_price": 0.0,
        "breakdown": breakdown,
    }
