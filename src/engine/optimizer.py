"""
Core optimization logic: given context inputs, produce a 24h schedule.

This module is a pure function at its heart — the schedule() function
takes data (no DB access) and returns a list of time-slotted actions.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

import structlog

from src.shared.models import ScheduleAction
from .strategy import compute_base_thresholds, apply_profile_to_thresholds

log = structlog.get_logger(__name__)

ENGINE_VERSION = "1.0.0"


def _slot_solar_wh(solar_forecast: list[dict], slot_start: datetime, slot_end: datetime) -> float:
    """Sum estimated PV yield (Wh) for a 30-min slot from hourly forecast."""
    total = 0.0
    for s in solar_forecast:
        try:
            s_start = datetime.fromisoformat(s["slot_start"].replace("Z", "+00:00"))
            s_end = s_start + timedelta(hours=1)
        except (KeyError, ValueError):
            continue
        # Overlap fraction of the slot within this solar hour
        overlap_start = max(slot_start, s_start)
        overlap_end = min(slot_end, s_end)
        if overlap_end <= overlap_start:
            continue
        overlap_hours = (overlap_end - overlap_start).total_seconds() / 3600.0
        yield_wh = s.get("est_pv_yield_wh") or 0.0
        total += yield_wh * overlap_hours
    return total


def generate_schedule(
    context: dict,
    active_profile: dict,
    base_min_soc: int = 20,
) -> list[dict]:
    """
    Generate a 24h schedule of 30-min slots.

    Args:
        context:       Output of pipeline.analytics.get_optimization_context()
        active_profile: The resolved aggressiveness profile (from engine.profiles)
        base_min_soc:  Baseline minimum SoC (from preferences)

    Returns:
        List of slot dicts:
        {
          start_time:        ISO8601
          end_time:          ISO8601
          action:            CHARGE | HOLD | DISCHARGE | AUTO
          reason:            str
          estimated_price:   float | None
          estimated_solar_w: float | None
          profile_id:        str
          profile_name:      str
        }
    """
    price_forecast = context.get("price_forecast_24h", [])
    solar_forecast = context.get("solar_forecast_24h", [])
    current_soc = context.get("current_soc") or 50.0

    profile = active_profile.get("profile") or active_profile
    export_agg = profile.get("export_aggressiveness", 0.5)
    preservation_agg = profile.get("preservation_aggressiveness", 0.5)
    import_agg = profile.get("import_aggressiveness", 0.5)
    profile_id = profile.get("id", "prof_default")
    profile_name = profile.get("name", "Balanced")

    # Compute base thresholds from price distribution
    base_thresholds = compute_base_thresholds(price_forecast)
    thresholds = apply_profile_to_thresholds(
        base_charge_threshold=base_thresholds["charge_threshold_ckwh"],
        base_discharge_threshold=base_thresholds["discharge_threshold_ckwh"],
        base_min_soc=base_min_soc,
        export_aggressiveness=export_agg,
        preservation_aggressiveness=preservation_agg,
        import_aggressiveness=import_agg,
    )
    charge_threshold = thresholds["charge_threshold_ckwh"]
    discharge_threshold = thresholds["discharge_threshold_ckwh"]
    effective_min_soc = thresholds["effective_min_soc"]

    log.debug(
        "optimizer: thresholds",
        charge=charge_threshold,
        discharge=discharge_threshold,
        min_soc=effective_min_soc,
        profile=profile_id,
    )

    # Build a price lookup: interval_start (str) -> price (general channel)
    price_map: dict[str, float] = {}
    for p in price_forecast:
        if p.get("channel_type", "general") == "general":
            price_map[p["interval_start"]] = p.get("per_kwh", 0.0)

    # Generate 30-min slots for next 24h
    now = datetime.now(timezone.utc)
    # Start at the next 30-min boundary
    minutes = now.minute
    if minutes < 30:
        slot_start = now.replace(minute=30, second=0, microsecond=0)
    else:
        slot_start = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)

    # Simulated SoC tracking
    simulated_soc = current_soc
    bat_capacity_kwh = context.get("system_config", {}).get("bat_capacity_kwh", 10.0) or 10.0

    slots = []
    for _ in range(48):  # 24h at 30-min intervals
        slot_end = slot_start + timedelta(minutes=30)
        slot_start_iso = slot_start.strftime("%Y-%m-%dT%H:%M:%SZ")
        slot_end_iso = slot_end.strftime("%Y-%m-%dT%H:%M:%SZ")

        # Look up price for this slot
        price = price_map.get(slot_start_iso)
        if price is None:
            # Try fuzzy match within 5 minutes
            for ts, p in price_map.items():
                try:
                    ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if abs((ts_dt - slot_start).total_seconds()) < 300:
                        price = p
                        break
                except ValueError:
                    continue

        # Estimate solar for this slot
        solar_wh = _slot_solar_wh(solar_forecast, slot_start, slot_end)
        solar_w = solar_wh * 2  # 30-min slot -> average watts = Wh * 2

        action = ScheduleAction.AUTO
        reason = "Default: AUTO mode"

        if price is not None:
            is_full = simulated_soc >= 95.0
            is_low = simulated_soc <= effective_min_soc

            # Excess solar from net metering calculation
            recent_load_w = context.get("recent_avg_load_w") or 1500.0
            net_load_w = recent_load_w - solar_w
            excess_solar = net_load_w < 0

            if price <= charge_threshold and not is_full:
                action = ScheduleAction.CHARGE
                reason = f"Low price ({price:.1f}c/kWh), battery at {simulated_soc:.0f}%"
                # Simulate charging: ~30min at 3kW = 1.5kWh
                charge_kwh = min(1.5, bat_capacity_kwh * (1 - simulated_soc / 100.0))
                simulated_soc = min(100.0, simulated_soc + (charge_kwh / bat_capacity_kwh) * 100)

            elif price >= discharge_threshold and not is_low:
                action = ScheduleAction.DISCHARGE
                reason = f"High price ({price:.1f}c/kWh), battery at {simulated_soc:.0f}%"
                discharge_kwh = min(1.5, bat_capacity_kwh * ((simulated_soc - effective_min_soc) / 100.0))
                simulated_soc = max(effective_min_soc, simulated_soc - (discharge_kwh / bat_capacity_kwh) * 100)

            elif excess_solar and not is_full:
                action = ScheduleAction.CHARGE
                reason = f"Excess solar ({-net_load_w:.0f}W surplus), charging"
                simulated_soc = min(100.0, simulated_soc + 2.0)

            else:
                action = ScheduleAction.HOLD
                reason = f"Moderate price ({price:.1f}c/kWh), holding"

        slots.append({
            "start_time": slot_start_iso,
            "end_time": slot_end_iso,
            "action": action.value,
            "reason": reason,
            "estimated_price": round(price, 2) if price is not None else None,
            "estimated_solar_w": round(solar_w, 0) if solar_w > 0 else None,
            "profile_id": profile_id,
            "profile_name": profile_name,
        })

        slot_start = slot_end

    return slots


def estimate_daily_savings(
    schedule_slots: list[dict],
    current_soc: float,
    bat_capacity_kwh: float = 10.0,
    avg_feed_in_ckwh: float = 3.0,
) -> float:
    """
    Rough estimate of savings from the scheduled actions.
    Returns estimated savings in AUD.
    """
    savings = 0.0
    for slot in schedule_slots:
        price = slot.get("estimated_price")
        if price is None:
            continue
        action = slot.get("action", "HOLD")
        # Very rough: 1.5kWh per 30-min slot at rated power
        kwh = 1.5
        if action == "DISCHARGE" and price > 0:
            # Revenue from export at feed-in rate (or avoided import at price)
            savings += kwh * max(price - avg_feed_in_ckwh, 0) / 100.0
        elif action == "CHARGE" and price > 0:
            # "Save" the difference between charge time price and expected discharge price
            # This is very approximate without a more complete model
            pass
    return round(savings, 2)
