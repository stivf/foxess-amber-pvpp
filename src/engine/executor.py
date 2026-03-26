"""
FoxESS command execution via the foxesscloud SDK.

Handles charge/discharge/hold commands with:
- Budget checking before issuing commands
- Error handling and graceful degradation
- Audit trail via optimization_decisions table
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

import structlog

log = structlog.get_logger(__name__)


class FoxESSExecutor:
    """
    Issues work mode commands to the FoxESS inverter via foxesscloud SDK.

    Accepts an optional budget tracker. If provided, checks can_command()
    before issuing any command. Commands are always prioritised over telemetry
    but are suspended at the hard daily limit.
    """

    def __init__(
        self,
        device_sn: str,
        budget: Any | None = None,
    ):
        self.device_sn = device_sn
        self.budget = budget

    def _check_budget(self) -> bool:
        if self.budget is None:
            return True
        if not self.budget.can_command():
            log.error(
                "foxess_executor: command budget exhausted — cannot issue command",
                device_sn=self.device_sn,
            )
            return False
        return True

    def set_work_mode(self, mode: str) -> dict:
        """
        Set the inverter work mode.

        mode must be one of:
          'Self Use', 'Feed-in First', 'Backup', 'Force Charge', 'Force Discharge'
        """
        if not self._check_budget():
            return {"ok": False, "error": "budget_exhausted"}

        try:
            import foxesscloud.openapi as f
            f.set_work_mode(device_sn=self.device_sn, work_mode=mode)
            if self.budget:
                self.budget.record_call("cmd")
            log.info("foxess_executor: set_work_mode", mode=mode, device_sn=self.device_sn)
            return {"ok": True, "mode": mode}
        except Exception as exc:
            log.error("foxess_executor: set_work_mode failed", error=str(exc), mode=mode)
            return {"ok": False, "error": str(exc)}

    def set_charge(self) -> dict:
        """Force-charge mode."""
        return self.set_work_mode("Force Charge")

    def set_discharge(self) -> dict:
        """Force-discharge (feed-in first) mode."""
        return self.set_work_mode("Feed-in First")

    def set_hold(self) -> dict:
        """Self-use mode (hold/moderate)."""
        return self.set_work_mode("Self Use")

    def set_auto(self) -> dict:
        """Self-use mode (system manages automatically)."""
        return self.set_work_mode("Self Use")

    def execute_action(self, action: str) -> dict:
        """
        Execute a schedule action string (CHARGE | DISCHARGE | HOLD | AUTO).
        """
        from src.shared.models import ScheduleAction
        action_upper = action.upper()
        if action_upper == ScheduleAction.CHARGE.value:
            return self.set_charge()
        elif action_upper == ScheduleAction.DISCHARGE.value:
            return self.set_discharge()
        elif action_upper == ScheduleAction.HOLD.value:
            return self.set_hold()
        else:
            return self.set_auto()

    def mark_decision_applied(
        self, conn: sqlite3.Connection, decision_id: int, error: str | None = None
    ) -> None:
        """Update optimization_decisions audit record after execution."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            """
            UPDATE optimization_decisions
            SET applied = ?, applied_at = ?, apply_error = ?
            WHERE id = ?
            """,
            (1 if error is None else 0, now, error, decision_id),
        )
        conn.commit()
