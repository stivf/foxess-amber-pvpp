from __future__ import annotations
from pydantic import BaseModel


class DailyBreakdown(BaseModel):
    date: str
    savings_dollars: float
    solar_kwh: float
    import_kwh: float
    export_kwh: float


class SavingsResponse(BaseModel):
    period: str
    from_: str
    to: str
    total_savings_dollars: float
    grid_import_kwh: float
    grid_export_kwh: float
    solar_generation_kwh: float
    self_consumption_pct: float
    battery_cycles: int
    avg_buy_price: float
    avg_sell_price: float
    breakdown: list[DailyBreakdown]

    model_config = {"populate_by_name": True}
