"""
Threshold calculation from price distributions.

Computes base charge/discharge thresholds from the 24h price forecast
using percentiles, then applies aggressiveness profile adjustments.
"""

from __future__ import annotations

import statistics
from typing import Any


def compute_base_thresholds(
    price_forecast: list[dict],
    charge_percentile: float = 25.0,
    discharge_percentile: float = 75.0,
) -> dict:
    """
    Derive base charge/discharge thresholds from the price forecast distribution.

    Args:
        price_forecast:       List of price dicts with 'per_kwh' key (general channel only).
        charge_percentile:    Percentile below which we should charge (default: 25th).
        discharge_percentile: Percentile above which we should discharge (default: 75th).

    Returns:
        {
          charge_threshold_ckwh:    float,
          discharge_threshold_ckwh: float,
          min_price:                float,
          max_price:                float,
          median_price:             float,
        }
    """
    general_prices = [
        p["per_kwh"]
        for p in price_forecast
        if p.get("channel_type", "general") == "general" and p.get("per_kwh") is not None
    ]

    if not general_prices:
        # Fallback to config defaults
        return {
            "charge_threshold_ckwh": 10.0,
            "discharge_threshold_ckwh": 30.0,
            "min_price": 0.0,
            "max_price": 0.0,
            "median_price": 0.0,
        }

    sorted_prices = sorted(general_prices)
    n = len(sorted_prices)

    def percentile(p: float) -> float:
        idx = (p / 100.0) * (n - 1)
        lower = int(idx)
        upper = min(lower + 1, n - 1)
        frac = idx - lower
        return sorted_prices[lower] * (1 - frac) + sorted_prices[upper] * frac

    return {
        "charge_threshold_ckwh": round(percentile(charge_percentile), 2),
        "discharge_threshold_ckwh": round(percentile(discharge_percentile), 2),
        "min_price": round(sorted_prices[0], 2),
        "max_price": round(sorted_prices[-1], 2),
        "median_price": round(statistics.median(sorted_prices), 2),
    }


def apply_profile_to_thresholds(
    base_charge_threshold: float,
    base_discharge_threshold: float,
    base_min_soc: int,
    export_aggressiveness: float,
    preservation_aggressiveness: float,
    import_aggressiveness: float,
) -> dict:
    """
    Apply aggressiveness profile to base thresholds.

    Algorithm (ARCHITECTURE.md §4.4):
      charge_threshold    = base_charge_threshold * (1 + import_aggressiveness)
      discharge_threshold = base_discharge_threshold * (1 - export_aggressiveness * 0.5)
      effective_min_soc   = base_min_soc + (100 - base_min_soc) * preservation_aggressiveness * 0.5

    Returns:
        {
          charge_threshold_ckwh:    float,
          discharge_threshold_ckwh: float,
          effective_min_soc:        float,
        }
    """
    charge_threshold = base_charge_threshold * (1.0 + import_aggressiveness)
    discharge_threshold = base_discharge_threshold * (1.0 - export_aggressiveness * 0.5)
    effective_min_soc = base_min_soc + (100 - base_min_soc) * preservation_aggressiveness * 0.5

    return {
        "charge_threshold_ckwh": round(max(0.0, charge_threshold), 2),
        "discharge_threshold_ckwh": round(max(0.0, discharge_threshold), 2),
        "effective_min_soc": round(min(100.0, effective_min_soc), 1),
    }
