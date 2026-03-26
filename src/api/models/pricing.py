from __future__ import annotations
from pydantic import BaseModel
from src.shared.models import PriceDescriptor, SpikeStatus


class CurrentPrice(BaseModel):
    per_kwh: float
    feed_in_per_kwh: float
    descriptor: str
    renewables_pct: float | None
    spike_status: str
    updated_at: str


class ForecastInterval(BaseModel):
    start_time: str
    end_time: str
    per_kwh: float
    descriptor: str | None
    renewables_pct: float | None


class PricingCurrentResponse(BaseModel):
    current: CurrentPrice
    forecast: list[ForecastInterval]


class PriceHistoryPoint(BaseModel):
    time: str
    avg_per_kwh: float
    min_per_kwh: float
    max_per_kwh: float
    avg_feed_in: float


class PriceHistoryResponse(BaseModel):
    interval: str
    data: list[PriceHistoryPoint]
