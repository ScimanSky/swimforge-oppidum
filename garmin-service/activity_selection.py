"""Pick which Garmin activities a sync imports (pure functions, no network)."""

from datetime import datetime, timedelta
from typing import Iterable, List, Optional

MAX_ACTIVITIES_LIMIT = 10


def is_swimming_activity(activity: dict) -> bool:
    """Check if activity is a swimming activity"""
    activity_type = activity.get("activityType", {}).get("typeKey", "").lower()
    return "swim" in activity_type or "pool" in activity_type


def _start_time(activity: dict) -> Optional[datetime]:
    raw = activity.get("startTimeLocal", "")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def select_recent_swims(
    activities: Optional[Iterable[dict]],
    max_activities: Optional[int],
    days_back: int,
    now: datetime,
) -> List[dict]:
    """Return the swimming activities a sync should import.

    Without ``max_activities``: the swims started within ``days_back`` days of
    ``now`` (a swim with no start time is skipped, one with an unparsable start
    time is kept, as the service always did), in Garmin's order.

    With ``max_activities``: the N most recent swims, newest first, regardless of
    ``days_back``; swims without a usable start time sort last.
    """
    swims = [a for a in (activities or []) if is_swimming_activity(a)]

    if max_activities is None:
        start_date = now - timedelta(days=days_back)
        selected = []
        for activity in swims:
            if not activity.get("startTimeLocal", ""):
                continue
            started = _start_time(activity)
            if started is None or started >= start_date:
                selected.append(activity)
        return selected

    # Newest first; undated swims sort as datetime.min (last). sorted() stays
    # stable with reverse=True, so ties keep Garmin's order.
    ordered = sorted(swims, key=lambda a: _start_time(a) or datetime.min, reverse=True)
    return ordered[:max_activities]
