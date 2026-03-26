"""Profiles and calendar endpoints."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query

from src.api.dependencies import Auth, DbConn, AppSettings
from src.api.models.profiles import (
    ProfileCreate, ProfilePatch, ProfilesResponse,
    CalendarRuleCreate, CalendarRulePatch, CalendarRulesResponse,
    CalendarOverrideCreate, CalendarOverridesResponse,
    ActiveProfileResponse, ActiveProfileSummary, NextProfileSummary,
)
from src.engine import profiles as profile_engine

router = APIRouter()


# ── Profiles ──────────────────────────────────────────────────────────────────

@router.get("/profiles", response_model=ProfilesResponse)
def list_profiles(auth: Auth, db: DbConn):
    raw = profile_engine.get_all_profiles(db)
    profiles = []
    for p in raw:
        profiles.append({**p, "is_default": bool(p["is_default"])})
    return {"profiles": profiles}


@router.get("/profiles/{profile_id}")
def get_profile(auth: Auth, db: DbConn, profile_id: str):
    p = profile_engine.get_profile(db, profile_id)
    if not p:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    return {**p, "is_default": bool(p["is_default"])}


@router.post("/profiles", status_code=201)
def create_profile(auth: Auth, db: DbConn, body: ProfileCreate):
    p = profile_engine.create_profile(
        db,
        name=body.name,
        export_aggressiveness=body.export_aggressiveness,
        preservation_aggressiveness=body.preservation_aggressiveness,
        import_aggressiveness=body.import_aggressiveness,
    )
    return {**p, "is_default": bool(p["is_default"])}


@router.patch("/profiles/{profile_id}")
def update_profile(auth: Auth, db: DbConn, profile_id: str, body: ProfilePatch):
    existing = profile_engine.get_profile(db, profile_id)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    updates = body.model_dump(exclude_none=True)
    p = profile_engine.update_profile(db, profile_id, updates)
    return {**p, "is_default": bool(p["is_default"])}


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(auth: Auth, db: DbConn, profile_id: str):
    result = profile_engine.delete_profile(db, profile_id)
    if result.get("error") == "not_found":
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    if result.get("error") in ("is_default", "has_rules"):
        msg = "Cannot delete default profile" if result["error"] == "is_default" else "Profile has active calendar rules"
        raise HTTPException(status_code=409, detail={"error": {"code": "CONFLICT", "message": msg}})


@router.post("/profiles/{profile_id}/set-default")
def set_default_profile(auth: Auth, db: DbConn, profile_id: str):
    existing = profile_engine.get_profile(db, profile_id)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    p = profile_engine.set_default_profile(db, profile_id)
    return {**p, "is_default": bool(p["is_default"])}


# ── Calendar Rules ────────────────────────────────────────────────────────────

@router.get("/calendar/rules", response_model=CalendarRulesResponse)
def list_rules(auth: Auth, db: DbConn):
    return {"rules": profile_engine.get_all_rules(db)}


@router.post("/calendar/rules", status_code=201)
def create_rule(auth: Auth, db: DbConn, body: CalendarRuleCreate):
    # Validate profile exists
    if not profile_engine.get_profile(db, body.profile_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    rule = profile_engine.create_rule(
        db,
        profile_id=body.profile_id,
        name=body.name,
        days_of_week=body.days_of_week,
        start_time=body.start_time,
        end_time=body.end_time,
        priority=body.priority,
    )
    return rule


@router.patch("/calendar/rules/{rule_id}")
def update_rule(auth: Auth, db: DbConn, rule_id: str, body: CalendarRulePatch):
    existing = profile_engine.get_rule(db, rule_id)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Rule not found"}})
    updates = body.model_dump(exclude_none=True)
    return profile_engine.update_rule(db, rule_id, updates)


@router.delete("/calendar/rules/{rule_id}", status_code=204)
def delete_rule(auth: Auth, db: DbConn, rule_id: str):
    if not profile_engine.delete_rule(db, rule_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Rule not found"}})


# ── Calendar Overrides ────────────────────────────────────────────────────────

@router.get("/calendar/overrides", response_model=CalendarOverridesResponse)
def list_overrides(
    auth: Auth,
    db: DbConn,
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
):
    overrides = profile_engine.get_overrides(db, from_dt=from_, to_dt=to)
    return {"overrides": overrides}


@router.post("/calendar/overrides", status_code=201)
def create_override(auth: Auth, db: DbConn, body: CalendarOverrideCreate):
    if not profile_engine.get_profile(db, body.profile_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Profile not found"}})
    override = profile_engine.create_override(
        db,
        profile_id=body.profile_id,
        name=body.name,
        start_datetime=body.start_datetime,
        end_datetime=body.end_datetime,
    )
    return override


@router.delete("/calendar/overrides/{override_id}", status_code=204)
def delete_override(auth: Auth, db: DbConn, override_id: str):
    if not profile_engine.delete_override(db, override_id):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Override not found"}})


# ── Active Profile ─────────────────────────────────────────────────────────────

@router.get("/calendar/active", response_model=ActiveProfileResponse)
def get_active_profile(auth: Auth, db: DbConn):
    resolution = profile_engine.resolve_active_profile(db)
    profile = resolution.get("profile") or {}

    return ActiveProfileResponse(
        profile=ActiveProfileSummary(
            id=profile.get("id", "prof_default"),
            name=profile.get("name", "Balanced"),
            export_aggressiveness=profile.get("export_aggressiveness", 0.5),
            preservation_aggressiveness=profile.get("preservation_aggressiveness", 0.5),
            import_aggressiveness=profile.get("import_aggressiveness", 0.5),
        ),
        source=resolution.get("source", "default"),
        rule_id=resolution.get("rule_id"),
        rule_name=resolution.get("rule_name"),
        active_until=resolution.get("active_until"),
        next_profile=None,
    )
