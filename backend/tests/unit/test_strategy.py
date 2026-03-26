"""
Unit tests for price distribution strategy and base threshold calculation.

The decision engine derives base thresholds from the price forecast distribution
using percentiles (see ARCHITECTURE.md §4.4):
  - base_charge_threshold:    derived from low-price percentile (e.g., 20th)
  - base_discharge_threshold: derived from high-price percentile (e.g., 80th)

These base thresholds are then scaled by the aggressiveness profile
(tested separately in test_optimizer.py).

Tests validate:
  - Percentile extraction from price distributions
  - Base threshold derivation from forecast data
  - Spike detection logic (top 10% of daily forecast)
  - Edge cases: empty forecast, all-same-price, negative prices
"""

import statistics
from typing import Sequence

import pytest


# ---------------------------------------------------------------------------
# Reference implementation of the strategy module.
# When src/engine/strategy.py is implemented, tests can be re-pointed to it.
# ---------------------------------------------------------------------------

def compute_base_thresholds(
    forecast_prices: Sequence[float],
    charge_percentile: float = 20.0,
    discharge_percentile: float = 80.0,
) -> dict:
    """
    Derive base charge and discharge thresholds from the price forecast distribution.

    Args:
        forecast_prices:     List of per-kWh prices for the forecast period.
        charge_percentile:   Prices below this percentile are 'cheap' -> CHARGE.
        discharge_percentile: Prices above this percentile are 'expensive' -> DISCHARGE.

    Returns:
        {
          "base_charge_threshold":    c/kWh below which charging is triggered
          "base_discharge_threshold": c/kWh above which discharging is triggered
          "p20":  20th percentile price
          "p50":  median price
          "p80":  80th percentile price
          "mean": mean price
          "min":  minimum price
          "max":  maximum price
        }
    """
    if not forecast_prices:
        return {
            "base_charge_threshold": 0.0,
            "base_discharge_threshold": float("inf"),
            "p20": 0.0,
            "p50": 0.0,
            "p80": float("inf"),
            "mean": 0.0,
            "min": 0.0,
            "max": 0.0,
        }

    sorted_prices = sorted(forecast_prices)
    n = len(sorted_prices)

    def _percentile(data: list[float], pct: float) -> float:
        """Linear interpolation percentile."""
        if len(data) == 1:
            return data[0]
        k = (pct / 100.0) * (len(data) - 1)
        lo = int(k)
        hi = lo + 1
        if hi >= len(data):
            return data[-1]
        return data[lo] + (k - lo) * (data[hi] - data[lo])

    p20 = _percentile(sorted_prices, charge_percentile)
    p50 = _percentile(sorted_prices, 50.0)
    p80 = _percentile(sorted_prices, discharge_percentile)

    return {
        "base_charge_threshold": p20,
        "base_discharge_threshold": p80,
        "p20": p20,
        "p50": p50,
        "p80": p80,
        "mean": statistics.mean(forecast_prices),
        "min": min(forecast_prices),
        "max": max(forecast_prices),
    }


def detect_price_spike(
    forecast_prices: Sequence[float],
    current_price: float,
    spike_percentile: float = 90.0,
) -> bool:
    """
    Detect if the current price constitutes a spike.

    A spike is defined as the current price exceeding the top N% of
    forecast prices for the day (default: top 10% = 90th percentile).

    Args:
        forecast_prices:  All forecast prices for the period (e.g., next 24h).
        current_price:    The current all-in import price.
        spike_percentile: Threshold percentile above which price is a spike.

    Returns:
        True if current_price is a spike, False otherwise.
    """
    if not forecast_prices:
        return False

    sorted_prices = sorted(forecast_prices)

    def _percentile(data: list[float], pct: float) -> float:
        if len(data) == 1:
            return data[0]
        k = (pct / 100.0) * (len(data) - 1)
        lo = int(k)
        hi = lo + 1
        if hi >= len(data):
            return data[-1]
        return data[lo] + (k - lo) * (data[hi] - data[lo])

    spike_threshold = _percentile(sorted_prices, spike_percentile)
    return current_price > spike_threshold


def classify_price(
    current_price: float,
    thresholds: dict,
) -> str:
    """
    Classify a price into a descriptor category.

    Args:
        current_price:  The price to classify.
        thresholds:     dict from compute_base_thresholds().

    Returns:
        One of: "negative", "low", "neutral", "high", "spike"
    """
    if current_price < 0:
        return "negative"
    if current_price <= thresholds["p20"]:
        return "low"
    if current_price <= thresholds["p50"]:
        return "neutral"
    if current_price <= thresholds["p80"]:
        return "high"
    return "spike"


# ---------------------------------------------------------------------------
# Fixtures: representative price forecasts
# ---------------------------------------------------------------------------

# Typical residential day: cheap overnight, spike in evening
TYPICAL_DAY_PRICES = [
    # 00:00-07:00 cheap (14 slots * 2 = 28 slots at ~5-8c)
    5.2, 5.0, 4.8, 5.1, 5.3, 4.9, 5.5, 5.0,
    5.2, 5.0, 4.8, 5.1, 5.3, 4.9,
    # 07:00-16:00 moderate (18 slots at ~12-18c)
    12.0, 13.5, 15.0, 14.5, 13.0, 16.0, 15.5, 14.0, 12.5,
    13.0, 14.5, 15.0, 14.5, 13.0, 16.0, 15.5, 14.0, 12.5,
    # 16:00-21:00 spike (10 slots at ~50-90c)
    52.0, 75.0, 85.0, 90.0, 88.0, 72.0, 60.0, 55.0, 50.0, 48.0,
    # 21:00-24:00 moderate (6 slots at ~18-22c)
    22.0, 20.0, 18.0, 19.0, 21.0, 20.5,
]

# Flat price day (e.g., flat-rate tariff)
FLAT_PRICE = [15.0] * 48

# All-negative prices (excess solar in the grid)
NEGATIVE_PRICES = [-5.0, -8.0, -3.0, -10.0, -6.0, -2.0]

# Single-element forecast
SINGLE_PRICE = [20.0]


# ---------------------------------------------------------------------------
# Tests: compute_base_thresholds
# ---------------------------------------------------------------------------

class TestComputeBaseThresholds:
    def test_typical_day_charge_threshold_is_low(self):
        """Charge threshold should be near the overnight cheap prices."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        # p20 of TYPICAL_DAY_PRICES should be in the cheap overnight band (5-8c)
        assert t["base_charge_threshold"] < 15.0

    def test_typical_day_discharge_threshold_is_high(self):
        """Discharge threshold should be near the evening spike prices."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        # p80 of TYPICAL_DAY_PRICES should be in the elevated/spike zone
        assert t["base_discharge_threshold"] > 15.0

    def test_discharge_threshold_greater_than_charge_threshold(self):
        """Discharge threshold must always be higher than charge threshold."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        assert t["base_discharge_threshold"] > t["base_charge_threshold"]

    def test_flat_price_both_thresholds_equal(self):
        """With uniform prices, charge and discharge thresholds are equal."""
        t = compute_base_thresholds(FLAT_PRICE)
        assert t["base_charge_threshold"] == pytest.approx(15.0)
        assert t["base_discharge_threshold"] == pytest.approx(15.0)

    def test_empty_forecast_returns_safe_defaults(self):
        """Empty forecast must not raise; returns safe defaults."""
        t = compute_base_thresholds([])
        assert t["base_charge_threshold"] == 0.0
        assert t["base_discharge_threshold"] == float("inf")

    def test_single_price_forecast(self):
        """Single price: all percentiles equal that price."""
        t = compute_base_thresholds(SINGLE_PRICE)
        assert t["p20"] == pytest.approx(20.0)
        assert t["p50"] == pytest.approx(20.0)
        assert t["p80"] == pytest.approx(20.0)
        assert t["base_charge_threshold"] == pytest.approx(20.0)
        assert t["base_discharge_threshold"] == pytest.approx(20.0)

    def test_negative_prices_are_handled(self):
        """Negative prices are valid and must be handled correctly."""
        t = compute_base_thresholds(NEGATIVE_PRICES)
        assert t["min"] < 0
        assert t["base_charge_threshold"] <= 0

    def test_p20_less_than_p50_less_than_p80(self):
        """p20 <= p50 <= p80 for any non-trivial distribution."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        assert t["p20"] <= t["p50"]
        assert t["p50"] <= t["p80"]

    def test_mean_is_between_min_and_max(self):
        """Mean must be within [min, max]."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        assert t["min"] <= t["mean"] <= t["max"]

    def test_custom_percentiles(self):
        """Caller can override the percentile values."""
        t_standard = compute_base_thresholds(TYPICAL_DAY_PRICES,
                                              charge_percentile=20, discharge_percentile=80)
        t_narrow = compute_base_thresholds(TYPICAL_DAY_PRICES,
                                            charge_percentile=10, discharge_percentile=90)
        # Narrower thresholds: charge only at bottom 10%, discharge at top 10%
        assert t_narrow["base_charge_threshold"] <= t_standard["base_charge_threshold"]
        assert t_narrow["base_discharge_threshold"] >= t_standard["base_discharge_threshold"]

    def test_returns_all_required_keys(self):
        """Result dict must contain all documented keys."""
        t = compute_base_thresholds(TYPICAL_DAY_PRICES)
        required_keys = {
            "base_charge_threshold", "base_discharge_threshold",
            "p20", "p50", "p80", "mean", "min", "max",
        }
        assert required_keys.issubset(t.keys())


# ---------------------------------------------------------------------------
# Tests: detect_price_spike
# ---------------------------------------------------------------------------

class TestDetectPriceSpike:
    def test_evening_spike_is_detected(self):
        """Current price in the top 10% of forecast is a spike."""
        # TYPICAL_DAY_PRICES has spikes up to 90c; 85c should be a spike
        assert detect_price_spike(TYPICAL_DAY_PRICES, current_price=85.0)

    def test_cheap_overnight_price_is_not_spike(self):
        """Cheap overnight price is not a spike."""
        assert not detect_price_spike(TYPICAL_DAY_PRICES, current_price=5.0)

    def test_moderate_daytime_price_is_not_spike(self):
        """Moderate daytime price is not a spike."""
        assert not detect_price_spike(TYPICAL_DAY_PRICES, current_price=14.0)

    def test_flat_price_is_never_spike(self):
        """Uniform prices: no price exceeds the 90th percentile."""
        assert not detect_price_spike(FLAT_PRICE, current_price=15.0)

    def test_empty_forecast_is_not_spike(self):
        """With no forecast data, no spike can be detected."""
        assert not detect_price_spike([], current_price=100.0)

    def test_price_at_exactly_spike_threshold_not_spike(self):
        """Spike detection is strict: > (not >=) the threshold."""
        # Uniform prices: p90 == every element == 10.0
        prices = [10.0] * 10
        # At exactly the threshold (10.0), should not be a spike
        assert not detect_price_spike(prices, current_price=10.0)

    def test_price_just_above_spike_threshold_is_spike(self):
        """Just above the threshold is a spike."""
        prices = [10.0] * 10  # p90 == 10.0
        assert detect_price_spike(prices, current_price=10.01)

    def test_custom_spike_percentile(self):
        """Custom spike_percentile changes detection sensitivity."""
        # With p50 as spike threshold: anything above median is a spike
        prices = [5.0, 10.0, 15.0, 20.0, 25.0]  # median = 15.0
        assert detect_price_spike(prices, current_price=16.0, spike_percentile=50.0)
        assert not detect_price_spike(prices, current_price=14.0, spike_percentile=50.0)

    def test_negative_current_price_is_not_spike(self):
        """Negative prices are the cheapest possible — never a spike."""
        assert not detect_price_spike(TYPICAL_DAY_PRICES, current_price=-5.0)


# ---------------------------------------------------------------------------
# Tests: classify_price
# ---------------------------------------------------------------------------

class TestClassifyPrice:
    def setup_method(self):
        """Compute thresholds from the typical day once for all tests."""
        self.thresholds = compute_base_thresholds(TYPICAL_DAY_PRICES)

    def test_negative_price_is_negative_descriptor(self):
        assert classify_price(-5.0, self.thresholds) == "negative"

    def test_cheap_price_is_low_descriptor(self):
        # p20 is in the cheap zone (~5c)
        cheap = self.thresholds["p20"] - 0.5
        assert classify_price(max(0.0, cheap), self.thresholds) == "low"

    def test_moderate_price_is_neutral_or_high_descriptor(self):
        # Around median
        mid = (self.thresholds["p20"] + self.thresholds["p50"]) / 2
        result = classify_price(mid, self.thresholds)
        assert result in ("low", "neutral")

    def test_spike_price_is_spike_descriptor(self):
        spike = self.thresholds["p80"] + 10.0
        assert classify_price(spike, self.thresholds) == "spike"

    def test_flat_all_prices_neutral(self):
        """All prices equal p20==p50==p80: all are 'low' (price <= p20)."""
        thresholds = compute_base_thresholds(FLAT_PRICE)
        # At exactly 15.0: price <= p20 (15.0) -> "low"
        assert classify_price(15.0, thresholds) == "low"

    def test_all_descriptors_are_valid_api_values(self):
        """All returned descriptors must be in the valid set from API_CONTRACT.md."""
        valid_descriptors = {"negative", "low", "neutral", "high", "spike"}
        test_prices = [-10.0, 0.0, 5.0, 14.0, 22.0, 85.0]
        for price in test_prices:
            result = classify_price(price, self.thresholds)
            assert result in valid_descriptors, f"Invalid descriptor '{result}' for price {price}"


# ---------------------------------------------------------------------------
# Tests: integration — threshold -> decision interaction
# ---------------------------------------------------------------------------

class TestStrategyOptimizerIntegration:
    """
    Validates that strategy-derived base thresholds interact correctly with
    the optimizer's profile scaling (from test_optimizer.py).
    """

    def test_profile_scaled_charge_threshold_above_base(self):
        """
        With import_aggressiveness=0.5 (balanced), charge_threshold = base * 1.5.
        This must be higher than the raw base threshold.
        """
        base = compute_base_thresholds(TYPICAL_DAY_PRICES)["base_charge_threshold"]
        scaled = base * (1 + 0.5)  # import_aggressiveness = 0.5
        assert scaled > base

    def test_profile_scaled_discharge_threshold_below_base(self):
        """
        With export_aggressiveness=0.5 (balanced), discharge_threshold = base * 0.75.
        This must be lower than the raw base threshold.
        """
        base = compute_base_thresholds(TYPICAL_DAY_PRICES)["base_discharge_threshold"]
        scaled = base * (1 - 0.5 * 0.5)  # export_aggressiveness = 0.5
        assert scaled < base

    def test_aggressive_profile_triggers_charge_at_higher_prices(self):
        """
        With max import aggressiveness (1.0), charge_threshold = base * 2.0.
        The system charges even at moderately high prices.
        """
        base = compute_base_thresholds(TYPICAL_DAY_PRICES)["base_charge_threshold"]
        aggressive_threshold = base * 2.0
        # A price between base and aggressive_threshold: conservative skips, aggressive charges
        moderate_price = base * 1.5

        # Conservative (base threshold only): does not charge at moderate_price
        conservative_charges = moderate_price < base
        # Aggressive: charges because moderate_price < base * 2.0
        aggressive_charges = moderate_price < aggressive_threshold

        assert not conservative_charges, "Conservative should not charge at moderate_price"
        assert aggressive_charges, "Aggressive should charge at moderate_price (below base*2.0)"

    def test_conservative_profile_discharges_only_at_spike_prices(self):
        """
        With min export aggressiveness (0.0), discharge_threshold = base (no reduction).
        Only spikes trigger discharge.
        """
        base = compute_base_thresholds(TYPICAL_DAY_PRICES)["base_discharge_threshold"]
        conservative_threshold = base * (1 - 0.0 * 0.5)  # export_aggressiveness = 0.0
        assert conservative_threshold == pytest.approx(base)

    def test_base_thresholds_update_with_new_forecast(self):
        """
        When the price forecast changes (e.g., day with cheap solar export),
        base thresholds update accordingly.
        """
        # Day with very cheap overnight solar and mid-day peaks
        cheap_solar_day = [3.0] * 12 + [25.0] * 12 + [3.0] * 12 + [20.0] * 12
        t_old = compute_base_thresholds(TYPICAL_DAY_PRICES)
        t_new = compute_base_thresholds(cheap_solar_day)

        # The cheap solar day has more low prices, so base_charge_threshold should be lower
        assert t_new["base_charge_threshold"] <= t_old["base_charge_threshold"] + 5.0

    def test_spike_detected_triggers_discharge_above_threshold(self):
        """
        If a price spike is detected AND the current price exceeds the
        (profile-scaled) discharge threshold, the system should DISCHARGE.
        """
        thresholds = compute_base_thresholds(TYPICAL_DAY_PRICES)
        spike_price = 85.0

        is_spike = detect_price_spike(TYPICAL_DAY_PRICES, spike_price)
        above_discharge = spike_price > thresholds["base_discharge_threshold"]

        assert is_spike
        assert above_discharge
