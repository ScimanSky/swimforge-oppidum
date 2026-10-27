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
WRONG_CODE = "000000"


class FakeInnerClient:
    def __init__(self):
        self._tokenstore_path = None

    def load(self, path):
        self._tokenstore_path = path

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
            self.client.load(tokenstore)
            return None, None
        if FakeGarmin.login_error is not None:
            raise FakeGarmin.login_error
        return FakeGarmin.login_result

    def resume_login(self, client_state, mfa_code):
        FakeGarmin.resume_calls.append((self, client_state, mfa_code))
        if mfa_code == WRONG_CODE:
            raise garminconnect.GarminConnectAuthenticationError("MFA verification failed")
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


def submit_code(client, code, user_id="42"):
    return client.post("/auth/mfa", json={"user_id": user_id, "mfa_code": code}, headers=HEADERS)


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

    # Refreshed tokens are written back: the session is bound to its token store.
    session_client = main.sessions["42"]["client"]
    assert session_client is instance
    assert session_client.client._tokenstore_path == str(token_root / "42")


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


def test_login_without_mfa_binds_session_to_token_store(service):
    main, client, token_root = service
    FakeGarmin.login_result = (None, None)

    response = start_login(client)
    assert response.status_code == 200
    assert response.json()["success"] is True
    session_client = main.sessions["42"]["client"]
    assert session_client.client._tokenstore_path == str(token_root / "42")
    assert session_client.password is None


def test_mfa_resume_binds_session_to_token_store_and_drops_password(service):
    main, client, token_root = service
    start_login(client)
    original = main.pending_mfa["42"]["client"]

    assert submit_code(client, "123456").status_code == 200
    assert main.sessions["42"]["client"] is original
    assert original.client._tokenstore_path == str(token_root / "42")
    assert original.password is None


def test_wrong_code_keeps_in_memory_session_and_retry_succeeds(service):
    main, client, token_root = service
    start_login(client)
    original = main.pending_mfa["42"]["client"]

    response = submit_code(client, WRONG_CODE)
    assert response.status_code == 401
    assert main.pending_mfa["42"]["client"] is original
    assert (token_root / "42" / "mfa_state.bin").exists()

    assert submit_code(client, "123456").status_code == 200
    assert [call[0] for call in FakeGarmin.resume_calls] == [original, original]
    assert "42" not in main.pending_mfa
    assert not (token_root / "42" / "mfa_state.bin").exists()


def test_wrong_code_keeps_session_resumed_from_disk_and_retry_succeeds(service):
    main, client, token_root = service
    start_login(client)
    main.pending_mfa.clear()  # restart

    response = submit_code(client, WRONG_CODE)
    assert response.status_code == 401
    restored = main.pending_mfa["42"]["client"]
    assert restored.email is None  # fresh Garmin() built from the persisted state
    assert (token_root / "42" / "mfa_state.bin").exists()

    assert submit_code(client, "123456").status_code == 200
    # The retry reuses the restored instance, with the persisted state.
    assert [call[0] for call in FakeGarmin.resume_calls] == [restored, restored]
    assert all(call[1] == STATE for call in FakeGarmin.resume_calls)
    assert not (token_root / "42" / "mfa_state.bin").exists()


def test_logout_deletes_persisted_mfa_state(service):
    main, client, token_root = service
    start_login(client)
    state_file = token_root / "42" / "mfa_state.bin"
    assert state_file.exists()

    response = client.post("/auth/logout", params={"user_id": "42"}, headers=HEADERS)
    assert response.status_code == 200
    assert not state_file.exists()
    assert "42" not in main.pending_mfa


def test_mfa_status_without_pending_session(service):
    _, client, _ = service
    response = client.get("/auth/mfa-status/42", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"pending": False, "remaining_seconds": 0}


def test_restore_keeps_http_errors(service):
    _, client, _ = service
    response = client.post(
        "/auth/restore",
        json={"user_id": "../x", "token_data": json.dumps(TOKENS)},
        headers=HEADERS,
    )
    assert response.status_code == 400


def test_save_client_tokens_binds_the_real_library_client(service, monkeypatch):
    """With the real python-garminconnect Client (local file I/O only, no network)."""
    main, _, token_root = service
    monkeypatch.undo()  # restore the real garminconnect.Garmin
    garmin = garminconnect.Garmin()
    assert garmin.client._tokenstore_path is None
    garmin.client.di_token = TOKENS["di_token"]
    garmin.client.di_refresh_token = TOKENS["di_refresh_token"]
    garmin.client.di_client_id = TOKENS["di_client_id"]

    token_dir = token_root / "9"
    token_data = main.save_client_tokens(garmin, token_dir)

    assert json.loads(token_data) == TOKENS
    assert garmin.client._tokenstore_path == str(token_dir)
    assert stat.S_IMODE((token_dir / "garmin_tokens.json").stat().st_mode) == 0o600
