"""Encrypted, expiring storage format for a pending Garmin MFA login.

``Garmin.login()`` with ``return_on_mfa=True`` returns ``("needs_mfa",
client_state)``. ``client_state`` is a JSON-serialisable dict holding the
Garmin SSO session cookies, so it is as sensitive as a password. These helpers
turn it into a Fernet-encrypted blob (with its creation time) that can be kept
on disk until the user types the MFA code, possibly after a restart, and read
it back only while it is still fresh.

Pure functions: no I/O, no clock, no network.
"""

import json
import math
from typing import Any, Optional, Tuple

from cryptography.fernet import Fernet, InvalidToken


def serialize_state(state: dict, now: float, fernet: Fernet) -> bytes:
    """Encrypt ``{"state": state, "created_at": now}`` with ``fernet``."""
    payload = json.dumps({"state": state, "created_at": float(now)}, separators=(",", ":"))
    return fernet.encrypt(payload.encode("utf-8"))


def load_state_entry(
    blob: bytes, now: float, ttl_seconds: float, fernet: Fernet
) -> Optional[Tuple[dict, float]]:
    """Return ``(state, created_at)`` if ``blob`` is valid and not expired.

    Returns ``None`` (never raises) for an expired entry, a corrupt or truncated
    blob, a blob encrypted with another key, or an unexpected payload shape.
    """
    try:
        raw = fernet.decrypt(blob)
        data: Any = json.loads(raw.decode("utf-8"))
    except (InvalidToken, TypeError, ValueError):
        return None

    if not isinstance(data, dict):
        return None
    state = data.get("state")
    created_at = data.get("created_at")
    if not isinstance(state, dict):
        return None
    if isinstance(created_at, bool) or not isinstance(created_at, (int, float)):
        return None
    created_at = float(created_at)
    if not math.isfinite(created_at):
        return None
    if now > created_at + ttl_seconds:
        return None
    return state, created_at


def load_state(blob: bytes, now: float, ttl_seconds: float, fernet: Fernet) -> Optional[dict]:
    """Return the stored state if ``blob`` is valid and not expired, else ``None``."""
    entry = load_state_entry(blob, now, ttl_seconds, fernet)
    return entry[0] if entry else None
