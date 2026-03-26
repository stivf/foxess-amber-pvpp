"""GET /status — dashboard snapshot."""
from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel

from src.api.dependencies import Auth, DbConn, AppSettings
from src.pipeline import analytics
from src.engine import profiles as profile_engine
from src.engine import scheduler as sched
from src.shared.models import foxess_mode_to_battery_mode

router = APIRouter()


@router.get("/status")
def get_status(auth: Auth, db: DbConn, settings: AppSettings):
    state = analytics.get_current_state(settings.db_path_obj)
    tel = state.get("telemetry") or {}
    prices = state.get("prices") or {}

    general = prices.get("general") or {}
    feed_in = prices.get("feedIn") or {}

    battery_mode = foxess_mode_to_battery_mode(tel.get("work_mode"))
    bat_power = tel.get("bat_power_w", 0.0)

    # Solar forecasts for today/tomorrow
    solar_slots = analytics.get_solar_forecast(hours_ahead=48, db_path=settings.db_path_obj)
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    tomorrow_str = (now.replace(hour=0, minute=0) ).strftime("%Y-%m-%d")
    today_yield = sum(s.get("est_pv_yield_wh", 0) for s in solar_slots if s.get("slot_start", "").startswith(today_str)) / 1000.0
    tomorrow_yield = sum(s.get("est_pv_yield_wh", 0) for s in solar_slots if s.get("slot_start", "").startswith(tomorrow_str)) / 1000.0

    # Active profile
    resolution = profile_engine.resolve_active_profile(db, at=now)
    active_prof = resolution.get("profile") or {}
    source = resolution.get("source", "default")

    # Current schedule action
    from src.api.state import get_current_schedule
    current_schedule = get_current_schedule()
    action_info = sched.get_current_action(current_schedule)

    # Savings summary
    daily = analytics.get_daily_summary(db_path=settings.db_path_obj)
    today_savings = daily.get("total_savings_aud", 0.0) if daily else 0.0

    from datetime import timedelta
    week_start = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    month_start = now.strftime("%Y-%m-01")
    week_report = analytics.get_savings_report(week_start, now.strftime("%Y-%m-%d"), settings.db_path_obj)
    month_report = analytics.get_savings_report(month_start, now.strftime("%Y-%m-%d"), settings.db_path_obj)
    week_savings = (week_report.get("totals") or {}).get("total_savings_aud", 0.0)
    month_savings = (month_report.get("totals") or {}).get("total_savings_aud", 0.0)

    pv_power = tel.get("pv_power_w", 0.0)
    grid_power = tel.get("grid_power_w", 0.0)

    return {
        "battery": {
            "soc": tel.get("bat_soc", 0.0),
            "power_w": bat_power,
            "mode": battery_mode.value,
            "capacity_kwh": settings.bat_capacity_kwh,
            "min_soc": settings.bat_min_soc,
            "temperature": tel.get("bat_temp_c"),
        },
        "price": {
            "current_per_kwh": general.get("per_kwh", 0.0),
            "feed_in_per_kwh": feed_in.get("per_kwh", 0.0),
            "descriptor": general.get("descriptor", "neutral"),
            "renewables_pct": general.get("renewables"),
            "updated_at": state.get("updated_at", ""),
        },
        "solar": {
            "current_generation_w": pv_power,
            "forecast_today_kwh": round(today_yield, 2),
            "forecast_tomorrow_kwh": round(tomorrow_yield, 2),
        },
        "grid": {
            "import_w": max(0.0, grid_power),
            "export_w": max(0.0, -grid_power),
        },
        "schedule": {
            "current_action": action_info["current_action"],
            "next_change_at": action_info["next_change_at"],
            "next_action": action_info["next_action"],
        },
        "active_profile": {
            "id": active_prof.get("id", "prof_default"),
            "name": active_prof.get("name", "Balanced"),
            "source": source,
        },
        "savings": {
            "today_dollars": round(today_savings, 2),
            "this_week_dollars": round(week_savings, 2),
            "this_month_dollars": round(month_savings, 2),
        },
    }
