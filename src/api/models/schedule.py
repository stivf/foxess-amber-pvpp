from __future__ import annotations
from pydantic import BaseModel
from src.shared.models import ScheduleAction


class ScheduleSlot(BaseModel):
    start_time: str
    end_time: str
    action: str
    reason: str
    estimated_price: float | None
    estimated_solar_w: float | None
    profile_id: str
    profile_name: str


class ScheduleResponse(BaseModel):
    generated_at: str
    slots: list[ScheduleSlot]
    estimated_savings_today: float


class ScheduleOverrideRequest(BaseModel):
    action: ScheduleAction
    end_time: str
    reason: str = ""


class ScheduleOverrideResponse(BaseModel):
    override_id: str
    action: str
    started_at: str
    ends_at: str
    status: str


class ScheduleOverrideCancelResponse(BaseModel):
    status: str
    resumed_action: str
