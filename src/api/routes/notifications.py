"""Push notification device registration endpoints."""
from __future__ import annotations

import sqlite3
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.api.dependencies import Auth, DbConn

router = APIRouter()

# In-memory device registry (production would use a DB table or push service)
_devices: dict[str, dict] = {}


class NotificationRegisterRequest(BaseModel):
    device_token: str
    platform: Literal["ios", "android"]


@router.post("/notifications/register")
def register_device(auth: Auth, body: NotificationRegisterRequest):
    device_id = f"dev_{uuid.uuid4().hex[:8]}"
    _devices[device_id] = {
        "device_id": device_id,
        "device_token": body.device_token,
        "platform": body.platform,
    }
    return {"registered": True, "device_id": device_id}


@router.delete("/notifications/register/{device_id}", status_code=204)
def unregister_device(auth: Auth, device_id: str):
    if device_id not in _devices:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Device not found"}})
    del _devices[device_id]
