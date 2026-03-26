"""
Unit tests for the decision engine optimizer.

Tests the core CHARGE / HOLD / DISCHARGE decision logic and threshold
calculations derived from aggressiveness profile values.

Based on the algorithm in ARCHITECTURE.md §4.4:
  charge_threshold    = base_charge_threshold * (1 + import_aggressiveness)
  discharge_threshold = base_discharge_threshold * (1 - export_aggressiveness * 0.5)
  effective_min_soc   = base_min_soc + (100 - base_min_soc) * preservation_aggressiveness * 0.5

These tests define the expected contract. The implementation lives in
src/engine/optimizer.py and src/engine/strategy.py.
"""

import pytest
from dataclasses import dataclass
from typing import Literal


# ---------------------------------------------------------------------------
# Reference implementation (mirrors the algorithm spec)
# ---------------------------------------------------------------------------

@dataclass
class Profile:
    export_aggressiveness: float = 0.5
    preservation_aggressiveness: float = 0.5
    import_aggressiveness: float = 0.5


def compute_thresholds(
    profile: Profile,
    base_charge_threshold: float,
    base_discharge_threshold: float,
    base_min_soc: float,
) -> dict:
    """
    Compute effective thresholds for a given profile and base values.

    Returns:
        {
          charge_threshold:    c/kWh — charge if price < this
          discharge_threshold: c/kWh — discharge if price > this
          effective_min_soc:   % — never discharge below this
        }
    """
    charge_threshold = base_charge_threshold * (1 + profile.import_aggressiveness)
    discharge_threshold = base_discharge_threshold * (1 - profile.export_aggressiveness * 0.5)
    effective_min_soc = base_min_soc + (100 - base_min_soc) * profile.preservation_aggressiveness * 0.5
    return {
        "charge_threshold": charge_threshold,
        "discharge_threshold": discharge_threshold,
        "effective_min_soc": effective_min_soc,
    }


Action = Literal["CHARGE", "HOLD", "DISCHARGE", "EXPORT", "AUTO"]


def decide_action(
    price_ckwh: float,
    bat_soc: float,
    solar_w: float,
    load_w: float,
    thresholds: dict,
    bat_capacity_pct: float = 100.0,
) -> Action:
    """
    Decide the action for a single 30-minute slot.

    Args:
        price_ckwh:     Current all-in import price (c/kWh)
        bat_soc:        Current battery state of charge (%)
        solar_w:        Estimated solar generation (W)
        load_w:         Estimated household load (W)
        thresholds:     dict from compute_thresholds()
        bat_capacity_pct: Maximum SoC to charge to (default 100%)

    Returns:
        Action string
    """
    charge_threshold = thresholds["charge_threshold"]
    discharge_threshold = thresholds["discharge_threshold"]
    effective_min_soc = thresholds["effective_min_soc"]

    net_load = load_w - solar_w  # positive = net consumption, negative = excess solar

    if price_ckwh < charge_threshold and bat_soc < bat_capacity_pct:
        return "CHARGE"
    if price_ckwh > discharge_threshold and bat_soc > effective_min_soc:
        return "DISCHARGE"
    # Excess solar during spike: export
    if price_ckwh > discharge_threshold and net_load < 0:
        return "EXPORT"
    return "HOLD"


# ---------------------------------------------------------------------------
# Tests: threshold calculation
# ---------------------------------------------------------------------------

BASE_CHARGE = 10.0   # c/kWh
BASE_DISCHARGE = 30.0  # c/kWh
BASE_MIN_SOC = 20.0   # %


class TestThresholdCalculation:
    def test_balanced_profile_midpoint_thresholds(self):
        profile = Profile(0.5, 0.5, 0.5)
        t = compute_thresholds(profile, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        assert t["charge_threshold"] == pytest.approx(10.0 * 1.5)       # 15.0
        assert t["discharge_threshold"] == pytest.approx(30.0 * 0.75)   # 22.5
        assert t["effective_min_soc"] == pytest.approx(20.0 + 80.0 * 0.25)  # 40.0

    def test_zero_aggressiveness_conservative_thresholds(self):
        profile = Profile(0.0, 0.0, 0.0)
        t = compute_thresholds(profile, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        # import_aggressiveness=0: charge only at base threshold (no scaling up)
        assert t["charge_threshold"] == pytest.approx(10.0 * 1.0)   # 10.0
        # export_aggressiveness=0: discharge threshold stays at base (no reduction)
        assert t["discharge_threshold"] == pytest.approx(30.0 * 1.0)  # 30.0
        # preservation_aggressiveness=0: effective_min_soc = base_min_soc
        assert t["effective_min_soc"] == pytest.approx(20.0)

    def test_max_aggressiveness_aggressive_thresholds(self):
        profile = Profile(1.0, 1.0, 1.0)
        t = compute_thresholds(profile, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        # Willing to charge at up to 2x base threshold
        assert t["charge_threshold"] == pytest.approx(10.0 * 2.0)   # 20.0
        # Discharge threshold halved (export whenever even mildly profitable)
        assert t["discharge_threshold"] == pytest.approx(30.0 * 0.5)  # 15.0
        # Effective min SoC = 20 + 80 * 0.5 = 60
        assert t["effective_min_soc"] == pytest.approx(60.0)

    def test_high_export_aggressiveness_lowers_discharge_threshold(self):
        low_export = Profile(export_aggressiveness=0.2)
        high_export = Profile(export_aggressiveness=0.8)
        t_low = compute_thresholds(low_export, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        t_high = compute_thresholds(high_export, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        assert t_high["discharge_threshold"] < t_low["discharge_threshold"]

    def test_high_import_aggressiveness_raises_charge_threshold(self):
        low_import = Profile(import_aggressiveness=0.2)
        high_import = Profile(import_aggressiveness=0.8)
        t_low = compute_thresholds(low_import, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        t_high = compute_thresholds(high_import, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        assert t_high["charge_threshold"] > t_low["charge_threshold"]

    def test_high_preservation_raises_effective_min_soc(self):
        low_pres = Profile(preservation_aggressiveness=0.1)
        high_pres = Profile(preservation_aggressiveness=0.9)
        t_low = compute_thresholds(low_pres, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        t_high = compute_thresholds(high_pres, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        assert t_high["effective_min_soc"] > t_low["effective_min_soc"]

    def test_effective_min_soc_never_exceeds_100(self):
        """Even at max preservation, effective min SoC stays bounded."""
        profile = Profile(preservation_aggressiveness=1.0)
        t = compute_thresholds(profile, BASE_CHARGE, BASE_DISCHARGE, base_min_soc=20.0)
        assert t["effective_min_soc"] <= 100.0

    def test_effective_min_soc_never_below_base(self):
        profile = Profile(preservation_aggressiveness=0.0)
        t = compute_thresholds(profile, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)
        assert t["effective_min_soc"] >= BASE_MIN_SOC


# ---------------------------------------------------------------------------
# Tests: action decision
# ---------------------------------------------------------------------------

# Balanced thresholds: charge < 15c, discharge > 22.5c, min_soc = 40%
BALANCED_THRESHOLDS = compute_thresholds(Profile(0.5, 0.5, 0.5), BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)


class TestActionDecision:
    def test_cheap_price_triggers_charge_when_battery_not_full(self):
        action = decide_action(
            price_ckwh=8.0,   # < 15c threshold
            bat_soc=60.0,
            solar_w=0.0,
            load_w=500.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "CHARGE"

    def test_no_charge_when_battery_full(self):
        action = decide_action(
            price_ckwh=8.0,   # cheap
            bat_soc=100.0,    # full
            solar_w=0.0,
            load_w=500.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_spike_price_triggers_discharge_when_above_min_soc(self):
        action = decide_action(
            price_ckwh=85.0,  # > 22.5c threshold
            bat_soc=80.0,     # > 40% effective min SoC
            solar_w=0.0,
            load_w=1000.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "DISCHARGE"

    def test_spike_price_does_not_discharge_below_effective_min_soc(self):
        action = decide_action(
            price_ckwh=85.0,   # spike
            bat_soc=38.0,      # < 40% effective min SoC
            solar_w=0.0,
            load_w=1000.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_moderate_price_returns_hold(self):
        action = decide_action(
            price_ckwh=18.0,   # between charge (15c) and discharge (22.5c) thresholds
            bat_soc=60.0,
            solar_w=2000.0,
            load_w=1000.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_zero_solar_zero_load_hold_at_moderate_price(self):
        action = decide_action(
            price_ckwh=18.0,
            bat_soc=50.0,
            solar_w=0.0,
            load_w=0.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_charge_threshold_boundary_exclusive(self):
        """Price exactly at charge_threshold should NOT trigger charge (< not <=)."""
        threshold = BALANCED_THRESHOLDS["charge_threshold"]  # 15.0
        action = decide_action(
            price_ckwh=threshold,
            bat_soc=50.0,
            solar_w=0.0,
            load_w=500.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_discharge_threshold_boundary_exclusive(self):
        """Price exactly at discharge_threshold should NOT trigger discharge (> not >=)."""
        threshold = BALANCED_THRESHOLDS["discharge_threshold"]  # 22.5
        action = decide_action(
            price_ckwh=threshold,
            bat_soc=80.0,
            solar_w=0.0,
            load_w=500.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "HOLD"

    def test_aggressive_export_discharges_at_lower_price(self):
        """High export aggressiveness discharges at lower prices than balanced."""
        aggressive = Profile(export_aggressiveness=0.9, preservation_aggressiveness=0.1)
        t_aggressive = compute_thresholds(aggressive, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)

        # At 20c (below balanced discharge threshold of 22.5c)
        action_aggressive = decide_action(20.0, 80.0, 0.0, 500.0, t_aggressive)
        action_balanced = decide_action(20.0, 80.0, 0.0, 500.0, BALANCED_THRESHOLDS)

        assert action_aggressive == "DISCHARGE"
        assert action_balanced == "HOLD"

    def test_conservative_import_does_not_charge_at_moderate_price(self):
        """Zero import aggressiveness only charges at very cheap prices."""
        conservative = Profile(import_aggressiveness=0.0)
        t_conservative = compute_thresholds(conservative, BASE_CHARGE, BASE_DISCHARGE, BASE_MIN_SOC)

        # At 12c (above conservative charge threshold of 10c, below balanced of 15c)
        action_conservative = decide_action(12.0, 50.0, 0.0, 500.0, t_conservative)
        action_balanced = decide_action(12.0, 50.0, 0.0, 500.0, BALANCED_THRESHOLDS)

        assert action_conservative == "HOLD"
        assert action_balanced == "CHARGE"

    def test_negative_price_always_charges_if_not_full(self):
        """Negative prices should always trigger charging regardless of aggressiveness."""
        action = decide_action(
            price_ckwh=-5.0,  # negative price
            bat_soc=50.0,
            solar_w=0.0,
            load_w=500.0,
            thresholds=BALANCED_THRESHOLDS,
        )
        assert action == "CHARGE"


# ---------------------------------------------------------------------------
# Tests: schedule generation
# ---------------------------------------------------------------------------

def generate_schedule(
    slots: list[dict],  # [{interval_start, price_ckwh, solar_w_forecast}]
    bat_soc_initial: float,
    bat_capacity_pct: float,
    thresholds: dict,
    load_w_avg: float = 800.0,
) -> list[dict]:
    """
    Generate a 24h schedule from a list of price/solar slots.

    Returns list of {interval_start, action, price_ckwh, solar_w_forecast}
    """
    schedule = []
    soc = bat_soc_initial
    for slot in slots:
        action = decide_action(
            price_ckwh=slot["price_ckwh"],
            bat_soc=soc,
            solar_w=slot.get("solar_w_forecast", 0.0),
            load_w=load_w_avg,
            thresholds=thresholds,
            bat_capacity_pct=bat_capacity_pct,
        )
        schedule.append({
            "interval_start": slot["interval_start"],
            "action": action,
            "price_ckwh": slot["price_ckwh"],
        })
    return schedule


class TestScheduleGeneration:
    def test_typical_day_schedule(self):
        """Morning cheap -> CHARGE, midday moderate -> HOLD, evening spike -> DISCHARGE."""
        slots = [
            {"interval_start": "2026-03-25T00:00:00Z", "price_ckwh": 5.0},   # cheap
            {"interval_start": "2026-03-25T00:30:00Z", "price_ckwh": 5.0},   # cheap
            {"interval_start": "2026-03-25T12:00:00Z", "price_ckwh": 18.0},  # moderate
            {"interval_start": "2026-03-25T17:00:00Z", "price_ckwh": 75.0},  # spike
            {"interval_start": "2026-03-25T17:30:00Z", "price_ckwh": 85.0},  # spike
        ]
        schedule = generate_schedule(slots, bat_soc_initial=50.0, bat_capacity_pct=95.0,
                                     thresholds=BALANCED_THRESHOLDS)
        assert schedule[0]["action"] == "CHARGE"
        assert schedule[1]["action"] == "CHARGE"
        assert schedule[2]["action"] == "HOLD"
        assert schedule[3]["action"] == "DISCHARGE"
        assert schedule[4]["action"] == "DISCHARGE"

    def test_empty_slots_returns_empty_schedule(self):
        schedule = generate_schedule([], bat_soc_initial=50.0, bat_capacity_pct=95.0,
                                     thresholds=BALANCED_THRESHOLDS)
        assert schedule == []

    def test_all_moderate_prices_all_hold(self):
        slots = [
            {"interval_start": f"2026-03-25T{h:02d}:00:00Z", "price_ckwh": 18.0}
            for h in range(24)
        ]
        schedule = generate_schedule(slots, bat_soc_initial=60.0, bat_capacity_pct=95.0,
                                     thresholds=BALANCED_THRESHOLDS)
        assert all(s["action"] == "HOLD" for s in schedule)
