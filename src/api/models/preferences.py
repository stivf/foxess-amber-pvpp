from __future__ import annotations
from pydantic import BaseModel, Field


class NotificationPreferences(BaseModel):
    price_spike: bool = True
    battery_low: bool = True
    schedule_change: bool = False
    daily_summary: bool = True


class Preferences(BaseModel):
    min_soc: int = Field(default=20, ge=0, le=100)
    auto_mode_enabled: bool = True
    notifications: NotificationPreferences = NotificationPreferences()


class PreferencesPatch(BaseModel):
    min_soc: int | None = Field(default=None, ge=0, le=100)
    auto_mode_enabled: bool | None = None
    notifications: NotificationPreferences | None = None
