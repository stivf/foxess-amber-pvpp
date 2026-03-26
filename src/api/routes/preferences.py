"""Preferences endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from src.api.dependencies import Auth, DbConn
from src.api.models.preferences import Preferences, PreferencesPatch, NotificationPreferences

router = APIRouter()


def _save_config(db, key: str, value: str) -> None:
    db.execute(
        """
        INSERT INTO system_config (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value,
            updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        """,
        (key, value),
    )


def _load_preferences(db) -> dict:
    rows = db.execute(
        "SELECT key, value FROM system_config WHERE key LIKE 'user_%' OR key LIKE 'notif_%'"
    ).fetchall()
    data = {r["key"]: r["value"] for r in rows}

    return {
        "min_soc": int(data.get("user_min_soc", 20)),
        "auto_mode_enabled": data.get("user_auto_mode_enabled", "true").lower() == "true",
        "notifications": {
            "price_spike": data.get("notif_price_spike", "true").lower() == "true",
            "battery_low": data.get("notif_battery_low", "true").lower() == "true",
            "schedule_change": data.get("notif_schedule_change", "false").lower() == "true",
            "daily_summary": data.get("notif_daily_summary", "true").lower() == "true",
        },
    }


@router.get("/preferences")
def get_preferences(auth: Auth, db: DbConn):
    return _load_preferences(db)


@router.patch("/preferences")
def update_preferences(auth: Auth, db: DbConn, body: PreferencesPatch):
    if body.min_soc is not None:
        _save_config(db, "user_min_soc", str(body.min_soc))
    if body.auto_mode_enabled is not None:
        _save_config(db, "user_auto_mode_enabled", str(body.auto_mode_enabled).lower())
    if body.notifications is not None:
        notif = body.notifications
        _save_config(db, "notif_price_spike", str(notif.price_spike).lower())
        _save_config(db, "notif_battery_low", str(notif.battery_low).lower())
        _save_config(db, "notif_schedule_change", str(notif.schedule_change).lower())
        _save_config(db, "notif_daily_summary", str(notif.daily_summary).lower())
    db.commit()
    return _load_preferences(db)
