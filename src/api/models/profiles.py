from __future__ import annotations
from pydantic import BaseModel, Field


class Profile(BaseModel):
    id: str
    name: str
    export_aggressiveness: float = Field(ge=0.0, le=1.0)
    preservation_aggressiveness: float = Field(ge=0.0, le=1.0)
    import_aggressiveness: float = Field(ge=0.0, le=1.0)
    is_default: bool
    created_at: str
    updated_at: str


class ProfileCreate(BaseModel):
    name: str
    export_aggressiveness: float = Field(default=0.5, ge=0.0, le=1.0)
    preservation_aggressiveness: float = Field(default=0.5, ge=0.0, le=1.0)
    import_aggressiveness: float = Field(default=0.5, ge=0.0, le=1.0)


class ProfilePatch(BaseModel):
    name: str | None = None
    export_aggressiveness: float | None = Field(default=None, ge=0.0, le=1.0)
    preservation_aggressiveness: float | None = Field(default=None, ge=0.0, le=1.0)
    import_aggressiveness: float | None = Field(default=None, ge=0.0, le=1.0)


class ProfilesResponse(BaseModel):
    profiles: list[Profile]


class CalendarRule(BaseModel):
    id: str
    profile_id: str
    profile_name: str
    name: str
    days_of_week: list[int]
    start_time: str
    end_time: str
    priority: int
    enabled: bool
    created_at: str


class CalendarRuleCreate(BaseModel):
    profile_id: str
    name: str
    days_of_week: list[int] = Field(min_length=1, max_length=7)
    start_time: str
    end_time: str
    priority: int = 0


class CalendarRulePatch(BaseModel):
    profile_id: str | None = None
    name: str | None = None
    days_of_week: list[int] | None = None
    start_time: str | None = None
    end_time: str | None = None
    priority: int | None = None
    enabled: bool | None = None


class CalendarRulesResponse(BaseModel):
    rules: list[CalendarRule]


class CalendarOverride(BaseModel):
    id: str
    profile_id: str
    profile_name: str
    name: str
    start_datetime: str
    end_datetime: str
    created_at: str


class CalendarOverrideCreate(BaseModel):
    profile_id: str
    name: str
    start_datetime: str
    end_datetime: str


class CalendarOverridesResponse(BaseModel):
    overrides: list[CalendarOverride]


class ActiveProfileSummary(BaseModel):
    id: str
    name: str
    export_aggressiveness: float
    preservation_aggressiveness: float
    import_aggressiveness: float


class NextProfileSummary(BaseModel):
    id: str
    name: str
    starts_at: str


class ActiveProfileResponse(BaseModel):
    profile: ActiveProfileSummary
    source: str
    rule_id: str | None = None
    rule_name: str | None = None
    active_until: str | None = None
    next_profile: NextProfileSummary | None = None
