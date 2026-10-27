"""Endpoint tests for the Garmin auth flow with a fake Garmin client (no network)."""

import importlib
import json
import os
import stat

import garminconnect
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

API_KEY = "test-secret"
HEADERS = {"X-API-Key": API_KEY}
STATE = {"domain": "garmin.com", "flow": "widget", "cookies": [{"name": "S", "value": "v"}]}
TOKENS = {"di_token": "access", "di_refresh_token": "refresh", "di_client_id": "id"}


class FakeInnerClient:
    def dump(self, path):
        token_file = os.path.join(path, "garmin_tokens.json")
        fd = os.open(token_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as handle:
            handle.write(json.dumps(TOKENS))


class FakeGarmin:
    """Stands in for garminconnect.Garmin; records calls on the class."""

    login_result = ("needs_mfa", STATE)
    login_error = None
    resume_calls = []

    def __init__(self, email=None, password=None, is_cn=False, return_on_mfa=False):
        self.email = email
        self.password = password
        self.client = FakeInnerClient()
        self.display_name = "swimmer"

    def login(self, tokenstore=None):
        if tokenstore is not None:
            return None, None
        if FakeGarmin.login_error is not None:
            raise FakeGarmin.login_error
        return FakeGarmin.login_result

    def resume_login(self, client_state, mfa_code):
        FakeGarmin.resume_calls.append((self, client_state, mfa_code))
        return None, None


@pytest.fixture
def service(tmp_path, monkeypatch):
    monkeypatch.setenv("GARMIN_SERVICE_SECRET", API_KEY)
    monkeypatch.setenv("TOKEN_STORE_DIR", str(tmp_path))
    monkeypatch.setenv("GARMIN_STATE_KEY", Fernet.generate_key().decode())
    monkeypatch.setattr(garminconnect, "Garmin", FakeGarmin)
    FakeGarmin.login_result = ("needs_mfa", STATE)
    FakeGarmin.login_error = None
    FakeGarmin.resume_calls = []
    import main

    main = importlib.reload(main)
    yield main, TestClient(main.app), tmp_path


def start_login(client, user_id="42"):
    return client.post(
        "/auth/login",
        json={"user_id": user_id, "email": "a@example.com", "password": "pw"},
        headers=HEADERS,
    )


def test_mfa_state_is_persisted_encrypted_and_resumed_after_restart(service):
    main, client, token_root = service

    response = start_login(client)
    assert response.status_code == 200
    assert response.json()["mfa_required"] is True

    state_file = token_root / "42" / "mfa_state.bin"
    assert state_file.exists()
    assert stat.S_IMODE(state_file.stat().st_mode) == 0o600
    assert stat.S_IMODE((token_root / "42").stat().st_mode) == 0o700
    assert b"cookies" not in state_file.read_bytes()

    # Simulate a restart: the in-memory pending session is gone.
    main.pending_mfa.clear()
    status = client.get("/auth/mfa-status/42", headers=HEADERS).json()
    assert status["pending"] is True
    assert 0 < status["remaining_seconds"] <= 600

    response = client.post("/auth/mfa", json={"user_id": "42", "mfa_code": "123456"}, headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert json.loads(body["token_data"]) == TOKENS

    (instance, resumed_state, code) = FakeGarmin.resume_calls[-1]
    assert resumed_state == STATE and code == "123456"
    assert instance.email is None  # a fresh Garmin(), not the original instance
    assert not state_file.exists()
    token_file = token_root / "42" / "garmin_tokens.json"
    assert stat.S_IMODE(token_file.stat().st_mode) == 0o600


def test_expired_persisted_state_is_rejected_and_deleted(service):
    main, client, token_root = service
    start_login(client)
    main.pending_mfa.clear()

    state_file = token_root / "42" / "mfa_state.bin"
    state_file.write_bytes(main.serialize_state(STATE, 0.0, main.state_fernet))

    response = client.post("/auth/mfa", json={"user_id": "42", "mfa_code": "1"}, headers=HEADERS)
    assert response.status_code == 400
    assert not state_file.exists()
    assert FakeGarmin.resume_calls == []


def test_cleanup_deletes_stale_state_files(service):
    main, client, token_root = service
    start_login(client)
    main.pending_mfa.clear()
    state_file = token_root / "42" / "mfa_state.bin"
    os.utime(state_file, (0, 0))

    client.get("/health")
    assert not state_file.exists()


def test_legacy_single_file_token_store_is_migrated(service):
    main, client, token_root = service
    (token_root / "7.json").write_text(json.dumps(TOKENS))

    response = start_login(client, user_id="7")
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert json.loads(response.json()["token_data"]) == TOKENS
    assert not (token_root / "7.json").exists()
    assert (token_root / "7" / "garmin_tokens.json").exists()


def test_http_427_maps_to_403_without_retry(service):
    main, client, _ = service
    FakeGarmin.login_error = garminconnect.GarminConnectTooManyRequestsError(
        "Widget embed GET returned 427"
    )

    response = start_login(client)
    assert response.status_code == 403
    assert response.json()["detail"] == "Garmin ha bloccato il login automatico, riprova più tardi"

    # Cooldown: the next attempt is refused before reaching Garmin.
    FakeGarmin.login_error = None
    assert start_login(client).status_code == 429


def test_generic_rate_limit_summary_stays_429(service):
    main, client, _ = service
    FakeGarmin.login_error = garminconnect.GarminConnectTooManyRequestsError(
        "All login strategies rate limited or blocked (HTTP 429/427). Try again later."
    )

    response = start_login(client)
    assert response.status_code == 429


def test_invalid_user_id_is_rejected(service):
    _, client, _ = service
    assert start_login(client, user_id="../etc").status_code == 400
    assert start_login(client, user_id="42\n").status_code == 400


def test_without_state_key_mfa_stays_in_memory(service, monkeypatch):
    main, client, token_root = service
    monkeypatch.delenv("GARMIN_STATE_KEY")
    main = importlib.reload(main)
    client = TestClient(main.app)

    assert main.state_fernet is None
    assert start_login(client).json()["mfa_required"] is True
    assert not (token_root / "42" / "mfa_state.bin").exists()
    response = client.post("/auth/mfa", json={"user_id": "42", "mfa_code": "1"}, headers=HEADERS)
    assert response.status_code == 200
