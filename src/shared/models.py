"""
Shared domain types used across api/, engine/, and pipeline/ modules.

Keep this module free of circular imports — it imports nothing from the project.
"""

from __future__ import annotations

from enum import Enum


class ScheduleAction(str, Enum):
    CHARGE = "CHARGE"
    HOLD = "HOLD"
    DISCHARGE = "DISCHARGE"
    AUTO = "AUTO"


class BatteryMode(str, Enum):
    CHARGING = "charging"
    DISCHARGING = "discharging"
    HOLDING = "holding"
    IDLE = "idle"


class PriceDescriptor(str, Enum):
    SPIKE = "spike"
    HIGH = "high"
    NEUTRAL = "neutral"
    LOW = "low"
    NEGATIVE = "negative"


class SpikeStatus(str, Enum):
    NONE = "none"
    POTENTIAL = "potential"
    SPIKE = "spike"


class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ProfileSource(str, Enum):
    DEFAULT = "default"
    RECURRING_RULE = "recurring_rule"
    ONE_OFF_OVERRIDE = "one_off_override"


class FoxESSBudgetState(str, Enum):
    NORMAL = "normal"        # < 80% used
    WARNING = "warning"      # 80–95% used
    CRITICAL = "critical"    # 95–100% used
    EXHAUSTED = "exhausted"  # 100% used


# Work mode strings returned by FoxESS SDK
FOXESS_MODE_SELF_USE = "Self Use"
FOXESS_MODE_FEED_IN_FIRST = "Feed-in First"
FOXESS_MODE_BACKUP = "Backup"
FOXESS_MODE_FORCE_CHARGE = "Force Charge"
FOXESS_MODE_FORCE_DISCHARGE = "Force Discharge"


def foxess_mode_to_battery_mode(work_mode: str | None) -> BatteryMode:
    """Map a FoxESS work mode string to our BatteryMode enum."""
    if work_mode is None:
        return BatteryMode.IDLE
    mode_map = {
        FOXESS_MODE_FORCE_CHARGE: BatteryMode.CHARGING,
        FOXESS_MODE_FORCE_DISCHARGE: BatteryMode.DISCHARGING,
        FOXESS_MODE_FEED_IN_FIRST: BatteryMode.DISCHARGING,
        FOXESS_MODE_SELF_USE: BatteryMode.HOLDING,
        FOXESS_MODE_BACKUP: BatteryMode.HOLDING,
    }
    return mode_map.get(work_mode, BatteryMode.IDLE)
