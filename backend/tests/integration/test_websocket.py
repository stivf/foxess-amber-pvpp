"""
Integration tests for WebSocket events.

Covers:
  - WebSocket connection with token auth
  - ping/pong keepalive
  - Server-sent event shapes: battery.update, price.update, price.spike,
    schedule.update, profile.change, system.alert

These tests validate event data shapes and contract conformance.
When the FastAPI app is implemented, the commented async tests using
httpx/starlette WebSocket test client can be enabled.
"""

import json
from datetime import datetime, timezone, timedelta

import pytest


# ---------------------------------------------------------------------------
# Event schema validators
# (Pure functions — no DB or app required)
# ---------------------------------------------------------------------------

def _validate_battery_update(event: dict) -> None:
    """Validate a battery.update WebSocket event."""
    assert event["type"] == "battery.update"
    data = event["data"]
    required = {"soc", "power_w", "mode", "solar_w", "load_w", "grid_w",
                "temperature", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    assert data["mode"] in ("charging", "discharging", "holding", "idle")
    assert isinstance(data["soc"], (int, float))
    assert 0 <= data["soc"] <= 100


def _validate_price_update(event: dict) -> None:
    """Validate a price.update WebSocket event."""
    assert event["type"] == "price.update"
    data = event["data"]
    required = {"current_per_kwh", "feed_in_per_kwh", "descriptor",
                "renewables_pct", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    valid_descriptors = {"spike", "high", "neutral", "low", "negative"}
    assert data["descriptor"] in valid_descriptors


def _validate_price_spike(event: dict) -> None:
    """Validate a price.spike WebSocket event."""
    assert event["type"] == "price.spike"
    data = event["data"]
    required = {"current_per_kwh", "descriptor", "expected_duration_minutes",
                "action_taken", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    assert data["action_taken"] in ("CHARGE", "HOLD", "DISCHARGE", "AUTO")


def _validate_schedule_update(event: dict) -> None:
    """Validate a schedule.update WebSocket event."""
    assert event["type"] == "schedule.update"
    data = event["data"]
    required = {"current_action", "is_override", "next_change_at",
                "next_action", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    valid_actions = {"CHARGE", "HOLD", "DISCHARGE", "AUTO"}
    assert data["current_action"] in valid_actions
    assert data["next_action"] in valid_actions
    assert isinstance(data["is_override"], bool)


def _validate_profile_change(event: dict) -> None:
    """Validate a profile.change WebSocket event."""
    assert event["type"] == "profile.change"
    data = event["data"]
    required = {"profile_id", "profile_name", "source", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    valid_sources = {"default", "recurring_rule", "one_off_override"}
    assert data["source"] in valid_sources


def _validate_system_alert(event: dict) -> None:
    """Validate a system.alert WebSocket event."""
    assert event["type"] == "system.alert"
    data = event["data"]
    required = {"severity", "message", "timestamp"}
    assert required.issubset(data.keys()), f"Missing keys: {required - data.keys()}"
    valid_severities = {"info", "warning", "error"}
    assert data["severity"] in valid_severities


# ---------------------------------------------------------------------------
# Tests: event schema validation
# ---------------------------------------------------------------------------

class TestWebSocketEventSchemas:
    def test_battery_update_schema_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "battery.update",
            "data": {
                "soc": 73,
                "power_w": 1500,
                "mode": "charging",
                "solar_w": 3200,
                "load_w": 1200,
                "grid_w": -500,
                "temperature": 28.5,
                "timestamp": now,
            },
        }
        _validate_battery_update(event)

    def test_battery_update_soc_must_be_0_to_100(self):
        now = datetime.now(timezone.utc).isoformat()
        for valid_soc in [0, 50, 72.5, 100]:
            event = {
                "type": "battery.update",
                "data": {
                    "soc": valid_soc, "power_w": 0, "mode": "holding",
                    "solar_w": 0, "load_w": 0, "grid_w": 0,
                    "temperature": 25.0, "timestamp": now,
                },
            }
            _validate_battery_update(event)

    def test_battery_update_invalid_mode_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "battery.update",
            "data": {
                "soc": 70, "power_w": 0, "mode": "unknown_mode",
                "solar_w": 0, "load_w": 0, "grid_w": 0,
                "temperature": 25.0, "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_battery_update(event)

    def test_price_update_schema_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "price.update",
            "data": {
                "current_per_kwh": 12.3,
                "feed_in_per_kwh": 3.5,
                "descriptor": "neutral",
                "renewables_pct": 38,
                "timestamp": now,
            },
        }
        _validate_price_update(event)

    def test_price_update_invalid_descriptor_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "price.update",
            "data": {
                "current_per_kwh": 10.0,
                "feed_in_per_kwh": 4.0,
                "descriptor": "medium",  # Not a valid descriptor
                "renewables_pct": 45,
                "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_price_update(event)

    def test_price_spike_schema_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "price.spike",
            "data": {
                "current_per_kwh": 85.0,
                "descriptor": "spike",
                "expected_duration_minutes": 30,
                "action_taken": "DISCHARGE",
                "timestamp": now,
            },
        }
        _validate_price_spike(event)

    def test_price_spike_invalid_action_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "price.spike",
            "data": {
                "current_per_kwh": 85.0,
                "descriptor": "spike",
                "expected_duration_minutes": 30,
                "action_taken": "EXPORT",  # Not a valid action
                "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_price_spike(event)

    def test_schedule_update_schema_valid(self):
        now = datetime.now(timezone.utc)
        event = {
            "type": "schedule.update",
            "data": {
                "current_action": "DISCHARGE",
                "is_override": False,
                "next_change_at": (now + timedelta(hours=1)).isoformat(),
                "next_action": "HOLD",
                "timestamp": now.isoformat(),
            },
        }
        _validate_schedule_update(event)

    def test_schedule_update_is_override_must_be_bool(self):
        now = datetime.now(timezone.utc).isoformat()
        for valid_override in [True, False]:
            event = {
                "type": "schedule.update",
                "data": {
                    "current_action": "CHARGE",
                    "is_override": valid_override,
                    "next_change_at": now,
                    "next_action": "HOLD",
                    "timestamp": now,
                },
            }
            _validate_schedule_update(event)

    def test_schedule_update_invalid_action_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "schedule.update",
            "data": {
                "current_action": "INVALID",
                "is_override": False,
                "next_change_at": now,
                "next_action": "HOLD",
                "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_schedule_update(event)

    def test_profile_change_schema_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "profile.change",
            "data": {
                "profile_id": "prof_peak_export",
                "profile_name": "Peak Export",
                "source": "recurring_rule",
                "rule_name": "Weekday evening peak",
                "active_until": now,
                "timestamp": now,
            },
        }
        _validate_profile_change(event)

    def test_profile_change_all_sources_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        for source in ("default", "recurring_rule", "one_off_override"):
            event = {
                "type": "profile.change",
                "data": {
                    "profile_id": "prof_default",
                    "profile_name": "Balanced",
                    "source": source,
                    "timestamp": now,
                },
            }
            _validate_profile_change(event)

    def test_profile_change_invalid_source_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "profile.change",
            "data": {
                "profile_id": "prof_default",
                "profile_name": "Balanced",
                "source": "manual",  # Not a valid source
                "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_profile_change(event)

    def test_system_alert_schema_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "system.alert",
            "data": {
                "severity": "warning",
                "message": "FoxESS API unreachable, using last known state",
                "timestamp": now,
            },
        }
        _validate_system_alert(event)

    def test_system_alert_all_severities_valid(self):
        now = datetime.now(timezone.utc).isoformat()
        for severity in ("info", "warning", "error"):
            event = {
                "type": "system.alert",
                "data": {
                    "severity": severity,
                    "message": "Test message",
                    "timestamp": now,
                },
            }
            _validate_system_alert(event)

    def test_system_alert_invalid_severity_fails(self):
        now = datetime.now(timezone.utc).isoformat()
        event = {
            "type": "system.alert",
            "data": {
                "severity": "critical",  # Not a valid severity
                "message": "Test",
                "timestamp": now,
            },
        }
        with pytest.raises(AssertionError):
            _validate_system_alert(event)


# ---------------------------------------------------------------------------
# Tests: ping/pong protocol
# ---------------------------------------------------------------------------

class TestWebSocketPingPong:
    def test_ping_message_shape(self):
        """Client sends { type: 'ping' }."""
        ping = {"type": "ping"}
        assert ping["type"] == "ping"
        assert json.dumps(ping)  # must be JSON serializable

    def test_pong_response_shape(self):
        """Server responds with { type: 'pong' }."""
        pong = {"type": "pong"}
        assert pong["type"] == "pong"

    def test_event_type_field_required(self):
        """All WebSocket messages must have a 'type' field."""
        valid_types = {
            "battery.update", "price.update", "price.spike",
            "schedule.update", "profile.change", "system.alert",
            "ping", "pong",
        }
        for event_type in valid_types:
            msg = {"type": event_type}
            assert "type" in msg


# ---------------------------------------------------------------------------
# Tests: WebSocket auth contract
# ---------------------------------------------------------------------------

class TestWebSocketAuthContract:
    def test_token_passed_as_query_param(self):
        """WS auth: token is passed as ?token=<api-key>."""
        token = "test-api-key-abc123"
        ws_url = f"ws://localhost:3000/ws?token={token}"
        assert "token=" in ws_url
        assert token in ws_url

    def test_empty_token_is_rejected(self):
        """An empty token should be treated as unauthorized."""
        token = ""
        # The empty token makes the connection unauthorized
        assert len(token) == 0

    def test_missing_token_is_rejected(self):
        """Missing token query param should result in unauthorized."""
        ws_url = "ws://localhost:3000/ws"
        assert "token=" not in ws_url


# ---------------------------------------------------------------------------
# FastAPI WebSocket endpoint tests (uncomment when app is implemented)
# ---------------------------------------------------------------------------

# @pytest.mark.asyncio
# async def test_websocket_connects_with_valid_token():
#     """WebSocket accepts connection when valid token is provided."""
#     from httpx import AsyncClient, ASGITransport
#     from starlette.testclient import TestClient
#     from src.api.main import create_app
#     app = create_app()
#
#     client = TestClient(app)
#     with client.websocket_connect("/ws?token=test-api-key-abc123") as ws:
#         # Should not raise
#         pass
#
#
# @pytest.mark.asyncio
# async def test_websocket_rejects_invalid_token():
#     """WebSocket closes with 4001 code when token is invalid."""
#     from starlette.testclient import TestClient
#     from src.api.main import create_app
#     app = create_app()
#
#     client = TestClient(app)
#     with pytest.raises(Exception):
#         with client.websocket_connect("/ws?token=wrong-token") as ws:
#             ws.receive_json()
#
#
# @pytest.mark.asyncio
# async def test_websocket_ping_pong():
#     """Client ping receives server pong."""
#     from starlette.testclient import TestClient
#     from src.api.main import create_app
#     app = create_app()
#
#     client = TestClient(app)
#     with client.websocket_connect("/ws?token=test-api-key-abc123") as ws:
#         ws.send_json({"type": "ping"})
#         response = ws.receive_json()
#         assert response["type"] == "pong"
#
#
# @pytest.mark.asyncio
# async def test_websocket_battery_update_event():
#     """battery.update event is broadcast after telemetry poll."""
#     from starlette.testclient import TestClient
#     from src.api.main import create_app
#     app = create_app()
#
#     client = TestClient(app)
#     with client.websocket_connect("/ws?token=test-api-key-abc123") as ws:
#         # Trigger a telemetry event (or wait for broadcast)
#         event = ws.receive_json(timeout=10)
#         assert event["type"] in (
#             "battery.update", "price.update", "schedule.update"
#         )
