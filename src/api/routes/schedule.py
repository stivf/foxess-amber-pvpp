"""Schedule endpoints."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from src.api.dependencies import Auth, DbConn, AppSettings
from src.api.models.schedule import ScheduleOverrideRequest, ScheduleOverrideResponse, ScheduleOverrideCancelResponse
from src.engine import scheduler as sched
from src.api.state import get_current_schedule

router = APIRouter()


@router.get("/schedule")
def get_schedule(auth: Auth, db: DbConn, settings: AppSettings):
    from src.api.state import get_schedule_metadata
    schedule, metadata = get_schedule_metadata()

    slots = []
    for slot in schedule:
        slots.append({
            "start_time": slot.get("start_time"),
            "end_time": slot.get("end_time"),
            "action": slot.get("action", "AUTO"),
            "reason": slot.get("reason", ""),
            "estimated_price": slot.get("estimated_price"),
            "estimated_solar_w": slot.get("estimated_solar_w"),
            "profile_id": slot.get("profile_id", "prof_default"),
            "profile_name": slot.get("profile_name", "Balanced"),
        })

    return {
        "generated_at": metadata.get("generated_at", datetime.now(timezone.utc).isoformat()),
        "slots": slots,
        "estimated_savings_today": metadata.get("estimated_savings_today", 0.0),
    }


@router.post("/schedule/override", response_model=ScheduleOverrideResponse)
def create_override(auth: Auth, db: DbConn, settings: AppSettings, body: ScheduleOverrideRequest):
    existing = sched.get_active_override()
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "OVERRIDE_ACTIVE", "message": "An override is already active. Cancel it first."}},
        )

    override = sched.set_override(
        action=body.action.value,
        end_time=body.end_time,
        reason=body.reason,
    )

    # Attempt to execute the override action on the inverter
    from src.api.state import get_executor
    executor = get_executor()
    if executor:
        try:
            executor.execute_action(body.action.value)
        except Exception:
            pass  # Log but don't fail the API call

    from src.api.websocket import manager
    from src.api.state import broadcast
    broadcast(manager.broadcast_schedule_update(
        action=body.action.value,
        is_override=True,
        next_change_at=body.end_time,
        next_action=None,
    ))

    return ScheduleOverrideResponse(
        override_id=override["override_id"],
        action=override["action"],
        started_at=override["started_at"],
        ends_at=override["ends_at"],
        status=override["status"],
    )


@router.delete("/schedule/override", response_model=ScheduleOverrideCancelResponse)
def cancel_override(auth: Auth, db: DbConn, settings: AppSettings):
    existing = sched.get_active_override()
    if not existing:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "No active override to cancel"}},
        )

    current_schedule = get_current_schedule()
    result = sched.cancel_override(current_schedule)

    from src.api.state import get_executor
    executor = get_executor()
    if executor:
        try:
            executor.set_auto()
        except Exception:
            pass

    return ScheduleOverrideCancelResponse(
        status=result["status"],
        resumed_action=result["resumed_action"],
    )
