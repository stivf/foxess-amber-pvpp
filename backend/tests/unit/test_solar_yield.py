"""
Unit tests for the PV yield estimation formula in solar_forecast_collector.py.

Formula: yield_Wh = GHI (W/m²) × (panel_capacity_W / 1000) × efficiency × interval_hours
"""

import pytest
from src.pipeline.solar_forecast_collector import estimate_pv_yield


class TestEstimatePvYield:
    def test_standard_conditions(self):
        """At STC (1000 W/m²) with 6.6kW panels and 80% efficiency for 1h."""
        result = estimate_pv_yield(
            ghi_wm2=1000.0,
            panel_capacity_w=6600.0,
            interval_minutes=60,
            system_efficiency=0.80,
        )
        # 1000 * (6600/1000) * 0.80 * 1.0 = 1000 * 6.6 * 0.80 = 5280.0
        assert result == pytest.approx(5280.0)

    def test_zero_ghi_returns_zero(self):
        """No sunlight -> no yield."""
        result = estimate_pv_yield(0.0, 6600.0, 60)
        assert result == 0.0

    def test_negative_ghi_returns_zero(self):
        """Negative GHI (sensor noise) should return zero."""
        result = estimate_pv_yield(-10.0, 6600.0, 60)
        assert result == 0.0

    def test_half_hour_interval(self):
        """30-minute interval produces half the hourly yield."""
        hourly = estimate_pv_yield(500.0, 6600.0, 60)
        half_hourly = estimate_pv_yield(500.0, 6600.0, 30)
        assert half_hourly == pytest.approx(hourly / 2)

    def test_higher_efficiency_increases_yield(self):
        low = estimate_pv_yield(500.0, 6600.0, 60, system_efficiency=0.70)
        high = estimate_pv_yield(500.0, 6600.0, 60, system_efficiency=0.90)
        assert high > low

    def test_proportional_to_panel_capacity(self):
        small = estimate_pv_yield(500.0, 3000.0, 60)
        large = estimate_pv_yield(500.0, 6000.0, 60)
        assert large == pytest.approx(small * 2)

    def test_proportional_to_ghi(self):
        low_sun = estimate_pv_yield(200.0, 6600.0, 60)
        high_sun = estimate_pv_yield(600.0, 6600.0, 60)
        assert high_sun == pytest.approx(low_sun * 3)

    def test_typical_overcast_day(self):
        """Overcast: GHI ~100 W/m², 6.6kW, 80% eff, 1h."""
        result = estimate_pv_yield(100.0, 6600.0, 60, 0.80)
        # 100 * 6.6 * 0.80 = 528 Wh
        assert result == pytest.approx(528.0)

    def test_default_efficiency_is_80_percent(self):
        """The default system_efficiency should be 0.80."""
        with_default = estimate_pv_yield(500.0, 6600.0, 60)
        explicit = estimate_pv_yield(500.0, 6600.0, 60, system_efficiency=0.80)
        assert with_default == pytest.approx(explicit)
