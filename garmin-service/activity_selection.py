"""Pick which Garmin activities a sync imports (pure functions, no network)."""

from datetime import datetime, timedelta
from typing import Iterable, List, Optional

MAX_ACTIVITIES_LIMIT = 10


def is_swimming_activity(activity: dict) -> bool:
    """Check if activity is a swimming activity"""
    activity_type = activity.get("activityType", {}).get("typeKey", "").lower()
    return "swim" in activity_type or "pool" in activity_type


def _parse_time(raw: object) -> Optional[datetime]:
    if not isinstance(raw, str) or not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _start_instant(activity: dict) -> Optional[datetime]:
    """Comparable start time: GMT when usable (correct across time zones), else local."""
    return _parse_time(activity.get("startTimeGMT")) or _parse_time(activity.get("startTimeLocal"))


def select_recent_swims(
    activities: Optional[Iterable[dict]],
    max_activities: Optional[int],
    days_back: int,
    now: datetime,
) -> List[dict]:
    """Return the swimming activities a sync should import.

    Without ``max_activities``: the swims started within ``days_back`` days of
    ``now`` by local start time (a swim with no start time is skipped, one with
    an unparsable start time is kept, as the service always did), in Garmin's
    order.

    With ``max_activities``: the N most recent swims, newest first by GMT start
    time (local start time when GMT is unusable), regardless of ``days_back``;
    swims without any usable start time are dropped.
    """
    swims = [a for a in (activities or []) if is_swimming_activity(a)]

    if max_activities is None:
        start_date = now - timedelta(days=days_back)
        selected = []
        for activity in swims:
            if not activity.get("startTimeLocal", ""):
                continue
            started = _parse_time(activity.get("startTimeLocal"))
            if started is None or started >= start_date:
                selected.append(activity)
        return selected

    dated = [(started, a) for a in swims if (started := _start_instant(a)) is not None]
    # sorted() stays stable with reverse=True, so ties keep Garmin's order.
    dated.sort(key=lambda pair: pair[0], reverse=True)
    return [activity for _, activity in dated[:max_activities]]
