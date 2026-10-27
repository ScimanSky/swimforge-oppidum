"""Tests for the encrypted, expiring MFA client_state blob (no network)."""

from cryptography.fernet import Fernet

from mfa_state import load_state, load_state_entry, serialize_state

STATE = {
    "domain": "garmin.com",
    "flow": "widget",
    "csrf_token": "csrf-123",
    "cookies": [{"name": "SESSION", "value": "secret", "domain": ".garmin.com"}],
}
TTL = 600.0


def test_round_trip_returns_the_original_state():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert isinstance(blob, bytes)
    assert load_state(blob, 1_000.0 + 10, TTL, fernet) == STATE


def test_blob_does_not_contain_the_plaintext_state():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert b"secret" not in blob
    assert b"csrf-123" not in blob


def test_state_is_still_valid_exactly_at_the_ttl_boundary():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert load_state(blob, 1_000.0 + TTL, TTL, fernet) == STATE


def test_expired_state_returns_none():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert load_state(blob, 1_000.0 + TTL + 0.001, TTL, fernet) is None


def test_corrupt_blob_returns_none():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert load_state(b"not-a-fernet-token", 1_000.0, TTL, fernet) is None
    assert load_state(blob[:-5] + b"AAAAA", 1_000.0, TTL, fernet) is None
    assert load_state(b"", 1_000.0, TTL, fernet) is None


def test_wrong_key_returns_none():
    blob = serialize_state(STATE, 1_000.0, Fernet(Fernet.generate_key()))

    assert load_state(blob, 1_000.0, TTL, Fernet(Fernet.generate_key())) is None


def test_valid_token_with_unexpected_payload_returns_none():
    fernet = Fernet(Fernet.generate_key())

    assert load_state(fernet.encrypt(b"not json"), 1_000.0, TTL, fernet) is None
    assert load_state(fernet.encrypt(b"[1, 2]"), 1_000.0, TTL, fernet) is None
    assert (
        load_state(fernet.encrypt(b'{"state": "x", "created_at": 1}'), 1_000.0, TTL, fernet)
        is None
    )
    assert (
        load_state(fernet.encrypt(b'{"state": {}, "created_at": "soon"}'), 1_000.0, TTL, fernet)
        is None
    )


def test_load_state_entry_also_returns_the_creation_time():
    fernet = Fernet(Fernet.generate_key())
    blob = serialize_state(STATE, 1_000.0, fernet)

    assert load_state_entry(blob, 1_200.0, TTL, fernet) == (STATE, 1_000.0)
    assert load_state_entry(blob, 1_000.0 + TTL + 1, TTL, fernet) is None
