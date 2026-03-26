from __future__ import annotations
from pydantic import BaseModel
from src.shared.models import BatteryMode


class BatteryState(BaseModel):
    soc: float
    power_w: float
    mode: BatteryMode
    capacity_kwh: float
    min_soc: int
    charge_rate_w: float
    discharge_rate_w: float
    temperature: float | None
    updated_at: str


class BatteryHistoryPoint(BaseModel):
    time: str
    avg_soc: float
    avg_power_w: float
    avg_solar_w: float
    avg_load_w: float
    avg_grid_w: float


class BatteryHistoryResponse(BaseModel):
    interval: str
    data: list[BatteryHistoryPoint]
