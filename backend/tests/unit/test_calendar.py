"""
Unit tests for the calendar resolution algorithm.

The resolution priority is:
  1. One-off override (exact datetime match)
  2. Recurring rule (day-of-week + time range, narrowest window wins ties)
  3. Default profile

These tests use pure Python data structures and do NOT touch the database.
They define the expected behaviour that src/engine/profiles.py must implement.
"""

from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Reference implementation of the calendar resolution algorithm.
# When src/engine/profiles.py is written, it should match this behaviour.
# Tests import from this module so they remain runnable before the engine
# module exists.
# ---------------------------------------------------------------------------

def resolve_profile(
    slot_dt: datetime,
    default_profile: dict,
    recurring_rules: list[dict],
    one_off_overrides: list[dict],
) -> tuple[dict, str]:
    """
    Resolve the active profile for a given UTC datetime slot.

    Args:
        slot_dt:           UTC datetime of the schedule slot being resolved.
        default_profile:   Profile dict to use when no rule matches.
        recurring_rules:   List of rule dicts with fields:
                             profile, days_of_week (list[int] 0=Mon), start_time (HH:MM),
                             end_time (HH:MM), priority (int), enabled (bool)
        one_off_overrides: List of override dicts with fields:
                             profile, start_datetime (ISO8601 str), end_datetime (ISO8601 str)

    Returns:
        (profile_dict, source)  where source is "default", "recurring_rule", or "one_off_override"
    """
    # Step 1: Check one-off overrides
    for override in one_off_overrides:
        start = datetime.fromisoformat(override["start_datetime"])
        end = datetime.fromisoformat(override["end_datetime"])
        # Normalise to UTC if naive (treat as UTC for test purposes)
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        if start <= slot_dt < end:
            return override["profile"], "one_off_override"

    # Step 2: Check recurring rules (find best match — highest priority, then narrowest window)
    day_of_week = slot_dt.weekday()  # 0=Mon, 6=Sun
    slot_time = slot_dt.strftime("%H:%M")

    matching_rules = []
    for rule in recurring_rules:
        if not rule.get("enabled", True):
            continue
        if day_of_week not in rule["days_of_week"]:
            continue
        # Compare times lexicographically (HH:MM strings are comparable)
        if rule["start_time"] <= slot_time < rule["end_time"]:
            window_minutes = _window_minutes(rule["start_time"], rule["end_time"])
            matching_rules.append((rule["priority"], -window_minutes, rule))

    if matching_rules:
        # Sort: highest priority first, then narrowest window (smallest window_minutes = -window_minutes largest)
        matching_rules.sort(reverse=True)
        best_rule = matching_rules[0][2]
        return best_rule["profile"], "recurring_rule"

    # Step 3: Fall back to default
    return default_profile, "default"


def _window_minutes(start_time: str, end_time: str) -> int:
    """Return the duration of a HH:MM..HH:MM window in minutes."""
    sh, sm = map(int, start_time.split(":"))
    eh, em = map(int, end_time.split(":"))
    return (eh * 60 + em) - (sh * 60 + sm)


# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

PROFILE_DEFAULT = {"id": "prof_default", "name": "Balanced"}
PROFILE_PEAK = {"id": "prof_peak", "name": "Peak Export"}
PROFILE_CHEAP = {"id": "prof_cheap", "name": "Cheap Charge"}
PROFILE_PRESERVE = {"id": "prof_preserve", "name": "Preserve"}


# ---------------------------------------------------------------------------
# Tests: one-off overrides
# ---------------------------------------------------------------------------

class TestOneOffOverrides:
    def test_override_takes_priority_over_default(self):
        slot = datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc)
        overrides = [
            {
                "profile": PROFILE_PRESERVE,
                "start_datetime": "2026-03-31T00:00:00+00:00",
                "end_datetime": "2026-03-31T23:59:59+00:00",
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, [], overrides)
        assert profile == PROFILE_PRESERVE
        assert source == "one_off_override"

    def test_override_takes_priority_over_recurring_rule(self):
        slot = datetime(2026, 3, 31, 17, 0, tzinfo=timezone.utc)  # Tuesday 5pm
        recurring = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [1],  # Tuesday
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 10,
                "enabled": True,
            }
        ]
        overrides = [
            {
                "profile": PROFILE_PRESERVE,
                "start_datetime": "2026-03-31T00:00:00+00:00",
                "end_datetime": "2026-04-01T00:00:00+00:00",
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, recurring, overrides)
        assert profile == PROFILE_PRESERVE
        assert source == "one_off_override"

    def test_override_boundary_start_is_inclusive(self):
        """Override should apply AT the start datetime."""
        slot = datetime(2026, 3, 31, 18, 0, tzinfo=timezone.utc)
        overrides = [
            {
                "profile": PROFILE_PRESERVE,
                "start_datetime": "2026-03-31T18:00:00+00:00",
                "end_datetime": "2026-03-31T20:00:00+00:00",
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, [], overrides)
        assert profile == PROFILE_PRESERVE
        assert source == "one_off_override"

    def test_override_boundary_end_is_exclusive(self):
        """Override should NOT apply AT the end datetime."""
        slot = datetime(2026, 3, 31, 20, 0, tzinfo=timezone.utc)
        overrides = [
            {
                "profile": PROFILE_PRESERVE,
                "start_datetime": "2026-03-31T18:00:00+00:00",
                "end_datetime": "2026-03-31T20:00:00+00:00",
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, [], overrides)
        assert profile == PROFILE_DEFAULT
        assert source == "default"

    def test_override_outside_range_not_applied(self):
        slot = datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc)
        overrides = [
            {
                "profile": PROFILE_PRESERVE,
                "start_datetime": "2026-03-31T00:00:00+00:00",
                "end_datetime": "2026-04-01T00:00:00+00:00",
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, [], overrides)
        assert profile == PROFILE_DEFAULT
        assert source == "default"


# ---------------------------------------------------------------------------
# Tests: recurring rules
# ---------------------------------------------------------------------------

class TestRecurringRules:
    def test_rule_matches_day_and_time(self):
        # Monday 17:00 UTC
        slot = datetime(2026, 3, 23, 17, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0, 1, 2, 3, 4],  # Mon-Fri
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_PEAK
        assert source == "recurring_rule"

    def test_rule_does_not_match_wrong_day(self):
        # Saturday = weekday 5
        slot = datetime(2026, 3, 28, 17, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0, 1, 2, 3, 4],  # Mon-Fri only
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_DEFAULT
        assert source == "default"

    def test_rule_start_is_inclusive(self):
        slot = datetime(2026, 3, 23, 16, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_PEAK

    def test_rule_end_is_exclusive(self):
        slot = datetime(2026, 3, 23, 20, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_DEFAULT

    def test_disabled_rule_is_ignored(self):
        slot = datetime(2026, 3, 23, 17, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": False,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_DEFAULT
        assert source == "default"

    def test_higher_priority_wins_on_overlap(self):
        slot = datetime(2026, 3, 23, 17, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_CHEAP,
                "days_of_week": [0],
                "start_time": "14:00",
                "end_time": "20:00",
                "priority": 5,
                "enabled": True,
            },
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 10,  # Higher priority
                "enabled": True,
            },
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_PEAK
        assert source == "recurring_rule"

    def test_narrower_window_wins_on_same_priority(self):
        """When two rules have the same priority, the narrower one wins."""
        slot = datetime(2026, 3, 23, 17, 0, tzinfo=timezone.utc)
        rules = [
            {
                "profile": PROFILE_CHEAP,
                "days_of_week": [0],
                "start_time": "09:00",
                "end_time": "21:00",  # 12h window
                "priority": 5,
                "enabled": True,
            },
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",  # 4h window — narrower
                "priority": 5,
                "enabled": True,
            },
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_PEAK

    def test_no_matching_rule_falls_back_to_default(self):
        slot = datetime(2026, 3, 23, 3, 0, tzinfo=timezone.utc)  # 3am Mon
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0],
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_DEFAULT
        assert source == "default"

    def test_multiple_days_in_rule(self):
        for weekday, slot_date in [(5, "2026-03-28"), (6, "2026-03-29")]:  # Sat, Sun
            slot = datetime.fromisoformat(f"{slot_date}T10:00:00+00:00")
            rules = [
                {
                    "profile": PROFILE_CHEAP,
                    "days_of_week": [5, 6],  # Weekend
                    "start_time": "08:00",
                    "end_time": "12:00",
                    "priority": 0,
                    "enabled": True,
                }
            ]
            profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
            assert profile == PROFILE_CHEAP, f"Expected weekend rule to match on {slot_date}"


# ---------------------------------------------------------------------------
# Tests: default fallback
# ---------------------------------------------------------------------------

class TestDefaultFallback:
    def test_returns_default_when_no_rules(self):
        slot = datetime(2026, 3, 25, 12, 0, tzinfo=timezone.utc)
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, [], [])
        assert profile == PROFILE_DEFAULT
        assert source == "default"

    def test_returns_default_when_no_rules_match(self):
        slot = datetime(2026, 3, 25, 12, 0, tzinfo=timezone.utc)  # Wednesday noon
        rules = [
            {
                "profile": PROFILE_PEAK,
                "days_of_week": [0, 1],  # Mon, Tue only
                "start_time": "16:00",
                "end_time": "20:00",
                "priority": 0,
                "enabled": True,
            }
        ]
        profile, source = resolve_profile(slot, PROFILE_DEFAULT, rules, [])
        assert profile == PROFILE_DEFAULT
        assert source == "default"
