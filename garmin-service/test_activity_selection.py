"""Tests for picking which Garmin activities a sync imports (no network)."""

from datetime import datetime

import pytest

from activity_selection import select_recent_swims

NOW = datetime(2026, 10, 29, 12, 0, 0)


def swim(activity_id, start, type_key="lap_swimming"):
    return {
        "activityId": activity_id,
        "activityType": {"typeKey": type_key},
        "startTimeLocal": start,
    }


def run(activity_id, start):
    return swim(activity_id, start, type_key="running")


def ids(activities):
    return [a["activityId"] for a in activities]


def test_without_a_cap_keeps_the_swims_inside_the_day_window():
    activities = [
        swim(1, "2026-10-28 07:00:00"),
        run(2, "2026-10-27 07:00:00"),
        swim(3, "2026-10-20 07:00:00", type_key="open_water_swimming"),
        swim(4, "2026-09-01 07:00:00"),  # older than 30 days
    ]

    assert ids(select_recent_swims(activities, None, 30, NOW)) == [1, 3]


def test_without_a_cap_skips_swims_without_a_start_time():
    activities = [swim(1, "2026-10-28 07:00:00"), swim(2, "")]

    assert ids(select_recent_swims(activities, None, 30, NOW)) == [1]


def test_without_a_cap_keeps_swims_whose_start_time_cannot_be_parsed():
    # Same as before the cap existed: an unparsable date does not drop the swim.
    activities = [swim(1, "not a date")]

    assert ids(select_recent_swims(activities, None, 30, NOW)) == [1]


def test_cap_takes_the_most_recent_swims_and_ignores_the_day_window():
    activities = [
        swim(1, "2026-10-28 07:00:00"),
        run(2, "2026-10-28 18:00:00"),
        swim(3, "2026-10-25 07:00:00"),
        swim(4, "2026-06-01 07:00:00"),  # far outside 30 days, still counted
        swim(5, "2026-05-01 07:00:00"),
    ]

    assert ids(select_recent_swims(activities, 3, 30, NOW)) == [1, 3, 4]


def test_cap_sorts_newest_first_even_if_garmin_does_not():
    activities = [
        swim(1, "2026-10-20 07:00:00"),
        swim(2, "2026-10-28 07:00:00"),
        swim(3, "2026-10-24 07:00:00"),
    ]

    assert ids(select_recent_swims(activities, 2, 30, NOW)) == [2, 3]


def test_cap_of_one_returns_only_the_last_swim():
    activities = [run(1, "2026-10-29 07:00:00"), swim(2, "2026-10-27 07:00:00"), swim(3, "2026-10-26 07:00:00")]

    assert ids(select_recent_swims(activities, 1, 30, NOW)) == [2]


def test_cap_larger_than_the_available_swims_returns_them_all():
    activities = [swim(1, "2026-10-28 07:00:00"), swim(2, "2026-10-27 07:00:00")]

    assert ids(select_recent_swims(activities, 10, 30, NOW)) == [1, 2]


def test_cap_puts_swims_without_a_usable_date_last():
    activities = [swim(1, ""), swim(2, "2026-10-27 07:00:00"), swim(3, "garbage")]

    assert ids(select_recent_swims(activities, 2, 30, NOW)) == [2, 1]


def test_handles_a_missing_activity_list():
    assert select_recent_swims(None, 5, 30, NOW) == []
    assert select_recent_swims(None, None, 30, NOW) == []


@pytest.mark.parametrize("bad", [0, -1, 11])
def test_sync_request_rejects_a_cap_outside_1_to_10(bad, monkeypatch):
    monkeypatch.setenv("GARMIN_SERVICE_SECRET", "test-secret")
    from pydantic import ValidationError

    import main

    with pytest.raises(ValidationError):
        main.SyncRequest(user_id="42", max_activities=bad)


def test_sync_request_cap_is_optional(monkeypatch):
    monkeypatch.setenv("GARMIN_SERVICE_SECRET", "test-secret")
    import main

    assert main.SyncRequest(user_id="42").max_activities is None
    assert main.SyncRequest(user_id="42", max_activities=5).max_activities == 5


class FakeActivitiesClient:
    def __init__(self, activities):
        self.activities = activities
        self.hr_zone_calls = []

    def get_activities(self, start, limit):
        return self.activities

    def get_activity_hr_in_timezones(self, activity_id):
        self.hr_zone_calls.append(activity_id)
        return None


@pytest.fixture
def sync_service(tmp_path, monkeypatch):
    import importlib

    from cryptography.fernet import Fernet
    from fastapi.testclient import TestClient

    monkeypatch.setenv("GARMIN_SERVICE_SECRET", "test-secret")
    monkeypatch.setenv("TOKEN_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("GARMIN_STATE_KEY", Fernet.generate_key().decode())
    import main

    main = importlib.reload(main)
    fake = FakeActivitiesClient(
        [
            {
                "activityId": 100 + day,
                "activityType": {"typeKey": "lap_swimming"},
                "startTimeLocal": f"2026-06-{day:02d} 07:00:00",
                "distance": 1500,
                "movingDuration": 1800,
            }
            for day in range(20, 0, -1)  # 20 swims, newest first, all months old
        ]
    )
    monkeypatch.setattr(main, "get_garmin_client", lambda user_id: fake)
    return TestClient(main.app), fake


def post_sync(client, body):
    return client.post("/sync", json={"user_id": "42", **body}, headers={"X-API-Key": "test-secret"})


def test_sync_with_a_cap_imports_and_queries_only_the_last_n_swims(sync_service):
    client, fake = sync_service

    response = post_sync(client, {"days_back": 30, "max_activities": 5})

    assert response.status_code == 200
    body = response.json()
    assert body["synced_count"] == 5
    assert [a["activity_id"] for a in body["activities"]] == ["120", "119", "118", "117", "116"]
    assert fake.hr_zone_calls == [120, 119, 118, 117, 116]


def test_sync_without_a_cap_keeps_the_day_window(sync_service):
    client, fake = sync_service

    response = post_sync(client, {"days_back": 30})

    assert response.status_code == 200
    assert response.json()["synced_count"] == 0  # every fake swim is months old
    assert fake.hr_zone_calls == []


def test_sync_rejects_a_cap_above_10(sync_service):
    client, fake = sync_service

    assert post_sync(client, {"max_activities": 11}).status_code == 422
    assert fake.hr_zone_calls == []
