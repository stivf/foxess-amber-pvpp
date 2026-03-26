"""
WebSocket connection manager and event dispatch.

Events (server -> client):
  battery.update, price.update, price.spike, schedule.update,
  profile.change, system.alert

Client -> server:
  ping -> pong
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

log = structlog.get_logger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        log.info("websocket.connected", total=len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections = [c for c in self._connections if c != ws]
        log.info("websocket.disconnected", total=len(self._connections))

    async def send(self, ws: WebSocket, data: dict) -> None:
        try:
            await ws.send_json(data)
        except Exception as exc:
            log.warning("websocket.send_failed", error=str(exc))
            self.disconnect(ws)

    async def broadcast(self, data: dict) -> None:
        if not self._connections:
            return
        dead = []
        for ws in list(self._connections):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    # ── Typed broadcast helpers ──────────────────────────────────────────────

    async def broadcast_battery_update(
        self,
        soc: float,
        power_w: float,
        mode: str,
        solar_w: float,
        load_w: float,
        grid_w: float,
        temperature: float | None,
    ) -> None:
        await self.broadcast({
            "type": "battery.update",
            "data": {
                "soc": soc,
                "power_w": power_w,
                "mode": mode,
                "solar_w": solar_w,
                "load_w": load_w,
                "grid_w": grid_w,
                "temperature": temperature,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

    async def broadcast_price_update(
        self,
        current_per_kwh: float,
        feed_in_per_kwh: float,
        descriptor: str,
        renewables_pct: float | None,
    ) -> None:
        await self.broadcast({
            "type": "price.update",
            "data": {
                "current_per_kwh": current_per_kwh,
                "feed_in_per_kwh": feed_in_per_kwh,
                "descriptor": descriptor,
                "renewables_pct": renewables_pct,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

    async def broadcast_price_spike(
        self,
        current_per_kwh: float,
        descriptor: str,
        expected_duration_minutes: int,
        action_taken: str,
    ) -> None:
        await self.broadcast({
            "type": "price.spike",
            "data": {
                "current_per_kwh": current_per_kwh,
                "descriptor": descriptor,
                "expected_duration_minutes": expected_duration_minutes,
                "action_taken": action_taken,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

    async def broadcast_schedule_update(
        self,
        action: str,
        is_override: bool,
        next_change_at: str | None,
        next_action: str | None,
    ) -> None:
        await self.broadcast({
            "type": "schedule.update",
            "data": {
                "current_action": action,
                "is_override": is_override,
                "next_change_at": next_change_at,
                "next_action": next_action,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

    async def broadcast_profile_change(
        self,
        profile_id: str,
        profile_name: str,
        source: str,
        rule_name: str | None,
        active_until: str | None,
    ) -> None:
        await self.broadcast({
            "type": "profile.change",
            "data": {
                "profile_id": profile_id,
                "profile_name": profile_name,
                "source": source,
                "rule_name": rule_name,
                "active_until": active_until,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

    async def broadcast_system_alert(self, severity: str, message: str) -> None:
        await self.broadcast({
            "type": "system.alert",
            "data": {
                "severity": severity,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })


# Singleton connection manager
manager = ConnectionManager()


async def websocket_endpoint(ws: WebSocket, token: str | None, api_key: str) -> None:
    """
    Handle a WebSocket connection lifecycle.

    Authentication: token query parameter must match the API key.
    """
    if token != api_key:
        await ws.close(code=4001, reason="Unauthorized")
        return

    await manager.connect(ws)
    try:
        # Send initial snapshot on connect
        from src.api.state import get_current_schedule
        from src.engine.scheduler import get_current_action

        schedule = get_current_schedule()
        action_info = get_current_action(schedule)
        await manager.send(ws, {
            "type": "schedule.update",
            "data": {
                "current_action": action_info["current_action"],
                "is_override": action_info["is_override"],
                "next_change_at": action_info["next_change_at"],
                "next_action": action_info["next_action"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })

        while True:
            try:
                data = await asyncio.wait_for(ws.receive_json(), timeout=60.0)
            except asyncio.TimeoutError:
                # Send keepalive ping
                await manager.send(ws, {"type": "ping"})
                continue

            if data.get("type") == "ping":
                await manager.send(ws, {"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("websocket.error", error=str(exc))
    finally:
        manager.disconnect(ws)
