"""
SwimForge Garmin Connect Microservice

This microservice handles authentication and data synchronization with Garmin Connect
using the unofficial python-garminconnect library.

Supports MFA (Multi-Factor Authentication) with a two-step flow:
1. POST /auth/login - Initiates login, returns mfa_required if MFA is needed
2. POST /auth/mfa - Completes login with MFA code

Requires python-garminconnect >= 0.3.20 (no garth). Tokens live in a per-user
token store directory (<TOKEN_STORE_DIR>/<user_id>/garmin_tokens.json). A pending
MFA login (the library's client_state) is also written, Fernet-encrypted with
GARMIN_STATE_KEY, to <TOKEN_STORE_DIR>/<user_id>/mfa_state.bin so the MFA code
can be submitted after a restart. See GARMIN_AUTH_NOTES.md.

Endpoints:
- POST /auth/login - Authenticate with Garmin Connect (step 1)
- POST /auth/mfa - Complete MFA authentication (step 2)
- POST /auth/logout - Clear stored session
- GET /auth/status - Check authentication status
- GET /activities/swimming - Fetch swimming activities
- POST /sync - Sync swimming activities to SwimForge
"""

import os
import re
import time
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi import FastAPI, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from dotenv import load_dotenv

from activity_selection import MAX_ACTIVITIES_LIMIT, select_recent_swims
from mfa_state import load_state_entry, serialize_state

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
API_SECRET_KEY = os.getenv("GARMIN_SERVICE_SECRET")
if not API_SECRET_KEY:
    raise RuntimeError("GARMIN_SERVICE_SECRET is required")
MAIN_API_URL = os.getenv("MAIN_API_URL", "http://localhost:3000")
TOKEN_STORE_DIR = Path(os.getenv("TOKEN_STORE_DIR", "/tmp/garmin_tokens"))
CORS_ALLOW_ORIGINS_RAW = os.getenv("GARMIN_CORS_ALLOW_ORIGINS", "")
CORS_ALLOW_CREDENTIALS_RAW = os.getenv("GARMIN_CORS_ALLOW_CREDENTIALS", "false")

# Ensure token store directory exists and is owner-only.
TOKEN_STORE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
with suppress(OSError):
    TOKEN_STORE_DIR.chmod(0o700)

# Per-user token store layout: <TOKEN_STORE_DIR>/<user_id>/{garmin_tokens.json,mfa_state.bin}
TOKEN_FILENAME = "garmin_tokens.json"  # name used by python-garminconnect's token store
MFA_STATE_FILENAME = "mfa_state.bin"
MFA_STATE_TTL_SECONDS = 600  # 10 minutes, same as the in-memory pending_mfa expiry
USER_ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")


def load_state_fernet() -> Optional[Fernet]:
    """Return the Fernet used to encrypt pending MFA state, or None.

    The service had no encryption key of its own, so it reads GARMIN_STATE_KEY
    (a base64 Fernet key). Without a valid key pending MFA logins stay in
    memory only (lost on restart) instead of crashing the service.
    """
    raw_key = os.getenv("GARMIN_STATE_KEY", "").strip()
    if not raw_key:
        logger.warning(
            "GARMIN_STATE_KEY is not set: pending Garmin MFA logins are kept in memory "
            "only and are lost if the service restarts before the code is entered."
        )
        return None
    try:
        return Fernet(raw_key.encode("utf-8"))
    except (ValueError, TypeError):
        logger.warning(
            "GARMIN_STATE_KEY is not a valid Fernet key (32 url-safe base64-encoded bytes): "
            "pending Garmin MFA logins are kept in memory only."
        )
        return None


state_fernet: Optional[Fernet] = load_state_fernet()

# In-memory session storage
# Structure: {user_id: {"client": Garmin, "email": str, "last_sync": datetime, "mfa_state": Any}}
sessions: Dict[str, Dict[str, Any]] = {}

# Pending MFA sessions (waiting for MFA code)
# Structure: {user_id: {"client": Garmin, "mfa_state": Any, "email": str, "created_at": datetime}}
pending_mfa: Dict[str, Dict[str, Any]] = {}

# Per-user cooldown after upstream Garmin 429 responses
login_rate_limited_until: Dict[str, datetime] = {}
RATE_LIMIT_COOLDOWN_SECONDS = int(os.getenv("GARMIN_RATE_LIMIT_COOLDOWN_SECONDS", "900"))


def is_rate_limit_error(error: str) -> bool:
    lowered = error.lower()
    return (
        "429" in lowered
        or "too many requests" in lowered
        or "rate limit" in lowered
    )


# 427 is the non-standard status Garmin's SSO uses when it blocks an automated
# login outright. Matches "returned 427" / "status=427" but not the library's
# generic "(HTTP 429/427)" summary, which stays on the 429 path.
LOGIN_BLOCKED_STATUS_RE = re.compile(r"(?<![\d/])427(?![\d/])")
LOGIN_BLOCKED_MESSAGE = "Garmin ha bloccato il login automatico, riprova più tardi"


def is_login_blocked_error(error: BaseException) -> bool:
    """True if the error (or anything it was raised from) is an HTTP 427."""
    seen = set()
    current: Optional[BaseException] = error
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        status = getattr(getattr(current, "response", None), "status_code", None)
        if status == 427 or LOGIN_BLOCKED_STATUS_RE.search(str(current)):
            return True
        current = current.__cause__ or current.__context__
    return False


def set_rate_limit_cooldown(user_id: str) -> int:
    now = datetime.now()
    blocked_until = now + timedelta(seconds=RATE_LIMIT_COOLDOWN_SECONDS)
    login_rate_limited_until[user_id] = blocked_until
    return RATE_LIMIT_COOLDOWN_SECONDS


def get_rate_limit_remaining_seconds(user_id: str) -> int:
    now = datetime.now()
    blocked_until = login_rate_limited_until.get(user_id)
    if not blocked_until:
        return 0
    remaining = int((blocked_until - now).total_seconds())
    if remaining <= 0:
        login_rate_limited_until.pop(user_id, None)
        return 0
    return remaining


def login_blocked_exception(user_id: str) -> HTTPException:
    """403 for a Garmin 427 block. Never retried: the cooldown also stops new attempts."""
    retry_after = set_rate_limit_cooldown(user_id)
    return HTTPException(
        status_code=403,
        detail=LOGIN_BLOCKED_MESSAGE,
        headers={"Retry-After": str(retry_after)},
    )


def parse_csv_origins(value: str) -> List[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def parse_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


cors_allow_origins = parse_csv_origins(CORS_ALLOW_ORIGINS_RAW)
cors_allow_credentials = parse_bool(CORS_ALLOW_CREDENTIALS_RAW)

if cors_allow_credentials and "*" in cors_allow_origins:
    raise RuntimeError(
        "Invalid CORS config: GARMIN_CORS_ALLOW_CREDENTIALS=true cannot be used with wildcard origin"
    )


# Pydantic models
class LoginRequest(BaseModel):
    user_id: str
    email: EmailStr
    password: str


class MFARequest(BaseModel):
    user_id: str
    mfa_code: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[str] = None
    mfa_required: bool = False
    token_data: Optional[str] = None


class StatusResponse(BaseModel):
    connected: bool
    email: Optional[str] = None
    last_sync: Optional[str] = None
    display_name: Optional[str] = None


class SwimmingActivity(BaseModel):
    activity_id: str
    activity_name: str
    start_time: str
    distance_meters: int
    duration_seconds: int
    pool_length: Optional[int] = None
    stroke_type: str = "mixed"
    avg_pace_per_100m: Optional[int] = None
    calories: Optional[int] = None
    avg_heart_rate: Optional[int] = None
    max_heart_rate: Optional[int] = None
    swolf_score: Optional[int] = None
    laps_count: Optional[int] = None
    is_open_water: bool = False
    avg_stroke_distance: Optional[int] = None  # cm per bracciata
    avg_strokes: Optional[int] = None  # bracciate per vasca
    avg_stroke_cadence: Optional[int] = None  # bracciate per minuto
    training_effect: Optional[int] = None  # 0-50 (moltiplicato per 10)
    anaerobic_training_effect: Optional[int] = None  # 0-50
    vo2_max_value: Optional[int] = None  # ml/kg/min
    recovery_time_hours: Optional[int] = None  # ore
    resting_heart_rate: Optional[int] = None  # bpm
    avg_stress: Optional[int] = None  # 0-100
    hr_zone_1_seconds: Optional[int] = None
    hr_zone_2_seconds: Optional[int] = None
    hr_zone_3_seconds: Optional[int] = None
    hr_zone_4_seconds: Optional[int] = None
    hr_zone_5_seconds: Optional[int] = None
    raw_data: Optional[dict] = None


class SyncRequest(BaseModel):
    user_id: str
    days_back: int = 30
    # When set, import the N most recent swims (newest first) and ignore days_back.
    max_activities: Optional[int] = Field(default=None, ge=1, le=MAX_ACTIVITIES_LIMIT)


class SyncResponse(BaseModel):
    success: bool
    synced_count: int
    activities: List[SwimmingActivity]
    message: Optional[str] = None


class RestoreRequest(BaseModel):
    user_id: str
    token_data: str


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Garmin Connect Microservice with MFA support...")
    yield
    logger.info("Shutting down Garmin Connect Microservice...")
    sessions.clear()
    pending_mfa.clear()


# Create FastAPI app
app = FastAPI(
    title="SwimForge Garmin Service",
    description="Microservice for Garmin Connect integration with MFA support",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware (disabled by default; enable only with explicit allowlist)
if cors_allow_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allow_origins,
        allow_credentials=cors_allow_credentials,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-API-Key"],
    )
    logger.info(
        "Garmin CORS enabled for %s origin(s), credentials=%s",
        len(cors_allow_origins),
        cors_allow_credentials,
    )
else:
    logger.info("Garmin CORS disabled (GARMIN_CORS_ALLOW_ORIGINS not set)")


# Authentication dependency
async def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# Helper functions
def get_token_dir(user_id: str) -> Path:
    """Per-user token store directory: <TOKEN_STORE_DIR>/<user_id>/"""
    if not USER_ID_RE.fullmatch(user_id or ""):
        raise HTTPException(status_code=400, detail="user_id non valido")
    return TOKEN_STORE_DIR / user_id


def get_token_file(token_dir: Path) -> Path:
    return token_dir / TOKEN_FILENAME


def get_mfa_state_file(token_dir: Path) -> Path:
    return token_dir / MFA_STATE_FILENAME


def secure_token_dir(token_dir: Path) -> None:
    """Create the token directory as 0700 and tighten its files to 0600."""
    token_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    with suppress(OSError):
        token_dir.chmod(0o700)
    for path in (get_token_file(token_dir), get_mfa_state_file(token_dir)):
        if path.exists() and not path.is_symlink():
            with suppress(OSError):
                path.chmod(0o600)


def migrate_legacy_token_file(user_id: str, token_dir: Path) -> None:
    """Move a pre-0.3.20 <TOKEN_STORE_DIR>/<user_id>.json into <user_id>/garmin_tokens.json.

    The old single-file store held the same JSON (di_token, di_refresh_token,
    di_client_id) that the library now reads from garmin_tokens.json.
    """
    legacy_file = TOKEN_STORE_DIR / f"{user_id}.json"
    if not legacy_file.is_file() or legacy_file.is_symlink():
        return
    token_file = get_token_file(token_dir)
    try:
        if token_file.exists():
            legacy_file.unlink()
        else:
            secure_token_dir(token_dir)
            os.replace(legacy_file, token_file)
            with suppress(OSError):
                token_file.chmod(0o600)
            logger.info(f"Migrated legacy Garmin token file for user {user_id}")
    except OSError as err:
        logger.warning(f"Could not migrate legacy Garmin token file for user {user_id}: {err}")


def ensure_token_dir(user_id: str, create: bool = True) -> Path:
    """Return the user's token directory, migrated from the old single-file layout.

    With create=True the directory is created (0700) and its files tightened to
    0600; read-only callers pass create=False to avoid creating empty dirs.
    """
    token_dir = get_token_dir(user_id)
    migrate_legacy_token_file(user_id, token_dir)
    if create or token_dir.exists():
        secure_token_dir(token_dir)
    return token_dir


def write_private_file(path: Path, data: bytes) -> None:
    """Write data with owner-only permissions regardless of umask, refusing symlinks."""
    secure_token_dir(path.parent)

    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW

    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)

    with suppress(OSError):
        path.chmod(0o600)


def read_private_file(path: Path) -> bytes:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as handle:
        return handle.read()


def write_token_data_securely(token_dir: Path, token_data: str) -> str:
    """Write a token payload (as returned to the main API) into the user's token store."""
    token_file = get_token_file(token_dir)
    write_private_file(token_file, token_data.encode("utf-8"))
    return token_file.read_text()


def read_token_data(token_dir: Path) -> Optional[str]:
    token_file = get_token_file(token_dir)
    if not token_file.exists():
        return None
    secure_token_dir(token_dir)
    return token_file.read_text()


def save_client_tokens(client: Any, token_dir: Path) -> Optional[str]:
    """Persist Garmin tokens into the user's token store and return the payload.

    With return_on_mfa=True neither Garmin.login() nor Garmin.resume_login()
    writes the token store or records it on the client (only a non-MFA-mode
    login with a tokenstore does). So the tokens are written with the library's
    Client.dump(), which creates <dir>/garmin_tokens.json as 0600 in a 0700 dir,
    and read back with Client.load() (local file only, no network), which sets
    the client's token store path: from then on the library writes refreshed DI
    tokens back to <dir>/garmin_tokens.json for this in-memory session too.
    """
    secure_token_dir(token_dir)
    client.client.dump(str(token_dir))
    try:
        client.client.load(str(token_dir))
    except Exception as err:
        logger.warning(f"Could not bind Garmin session to its token store: {err}")
    secure_token_dir(token_dir)
    return read_token_data(token_dir)


def login_from_token_store(token_dir: Path) -> Any:
    """Log in from <token_dir>/garmin_tokens.json (no credentials, no MFA)."""
    from garminconnect import Garmin

    client = Garmin()
    client.login(tokenstore=str(token_dir))
    return client


def persist_mfa_state(user_id: str, client_state: Any) -> None:
    """Store the pending MFA client_state encrypted on disk (best effort)."""
    if state_fernet is None or not isinstance(client_state, dict):
        return
    try:
        token_dir = ensure_token_dir(user_id)
        blob = serialize_state(client_state, time.time(), state_fernet)
        write_private_file(get_mfa_state_file(token_dir), blob)
    except Exception as err:
        # Never log the state itself: it holds Garmin session cookies.
        logger.warning(f"Could not persist MFA state for user {user_id}: {type(err).__name__}")


def load_persisted_mfa_state(user_id: str) -> Optional[Tuple[dict, float]]:
    """Return (client_state, created_at) from mfa_state.bin if valid and fresh.

    An expired, corrupt or undecryptable file is deleted.
    """
    if state_fernet is None:
        return None
    state_file = get_mfa_state_file(get_token_dir(user_id))
    if not state_file.exists():
        return None
    try:
        blob = read_private_file(state_file)
    except OSError as err:
        logger.warning(f"Could not read MFA state for user {user_id}: {err}")
        return None
    entry = load_state_entry(blob, time.time(), MFA_STATE_TTL_SECONDS, state_fernet)
    if entry is None:
        logger.info(f"Discarding expired or unreadable MFA state for user {user_id}")
        delete_mfa_state(user_id)
    return entry


def delete_mfa_state(user_id: str) -> None:
    with suppress(OSError):
        get_mfa_state_file(get_token_dir(user_id)).unlink(missing_ok=True)


def clear_pending_mfa(user_id: str) -> None:
    pending_mfa.pop(user_id, None)
    delete_mfa_state(user_id)


def get_garmin_client(user_id: str):
    """Get existing Garmin client for user"""
    session = sessions.get(user_id)
    if session and session.get("client"):
        return session["client"]
    # Try to restore session from token store (after deploy/restart)
    token_dir = ensure_token_dir(user_id, create=False)
    if get_token_file(token_dir).exists():
        try:
            client = login_from_token_store(token_dir)
            try:
                display_name = client.display_name
            except Exception:
                display_name = None
            sessions[user_id] = {
                "client": client,
                "email": None,
                "display_name": display_name,
                "last_sync": None,
                "connected_at": datetime.now().isoformat()
            }
            logger.info(f"Restored Garmin session from tokens for user {user_id}")
            return client
        except Exception as e:
            logger.warning(f"Failed to restore Garmin session for user {user_id}: {e}")
    return None


def safe_garmin_call(method, *args):
    """Safely call Garmin Connect methods without breaking the whole response."""
    if method is None:
        return None
    try:
        return method(*args)
    except Exception as err:
        logger.warning(f"Garmin call {getattr(method, '__name__', str(method))} failed: {err}")
        return None


def determine_stroke_type(activity_name: str, activity_type: str) -> str:
    """Determine stroke type from activity name"""
    name = activity_name.lower()
    
    if "stile" in name or "crawl" in name or "freestyle" in name:
        return "freestyle"
    if "dorso" in name or "back" in name:
        return "backstroke"
    if "rana" in name or "breast" in name:
        return "breaststroke"
    if "delfino" in name or "farfalla" in name or "butterfly" in name:
        return "butterfly"
    
    return "mixed"


def parse_swimming_activity(activity: dict, hr_zones_data: Optional[dict] = None) -> SwimmingActivity:
    """Parse Garmin activity into SwimmingActivity model"""
    activity_type = activity.get("activityType", {}).get("typeKey", "").lower()
    is_open_water = "open_water" in activity_type or "openwater" in activity_type
    
    # Log the full activity JSON to see all available fields
    logger.info(f"Activity JSON keys: {list(activity.keys())}")
    logger.info(f"Duration fields: duration={activity.get('duration')}, activeDuration={activity.get('activeDuration')}, movingDuration={activity.get('movingDuration')}, elapsedDuration={activity.get('elapsedDuration')}")
    
    distance = int(activity.get("distance", 0))
    # Use movingDuration (moving time) instead of duration (total time with pauses)
    # activeDuration doesn't exist for swimming activities, use movingDuration
    duration = int(activity.get("movingDuration") or activity.get("duration", 0))
    
    # Calculate pace per 100m
    avg_pace = None
    if distance > 0 and duration > 0:
        avg_pace = int((duration / distance) * 100)
    
    # Extract new technical data
    avg_stroke_distance = activity.get("avgStrokeDistance")
    if avg_stroke_distance:
        avg_stroke_distance = int(avg_stroke_distance * 100)  # Convert m to cm
    
    avg_strokes = activity.get("avgStrokes")
    if avg_strokes:
        avg_strokes = int(round(avg_strokes))
    
    avg_stroke_cadence = activity.get("avgStrokeCadenceRpm") or activity.get("avgStrokeCadence")
    if avg_stroke_cadence:
        avg_stroke_cadence = int(round(avg_stroke_cadence))
    
    # Extract training effect (multiply by 10 to store as integer)
    training_effect = activity.get("aerobicTrainingEffect")
    if training_effect:
        training_effect = int(training_effect * 10)
    
    anaerobic_te = activity.get("anaerobicTrainingEffect")
    if anaerobic_te:
        anaerobic_te = int(anaerobic_te * 10)
    
    # Extract physiological data
    vo2_max = activity.get("vO2MaxValue")
    if vo2_max:
        vo2_max = int(round(vo2_max))
    
    recovery_time = activity.get("recoveryTime")  # in minutes
    if recovery_time:
        recovery_time = int(recovery_time / 60)  # Convert to hours
    
    resting_hr = activity.get("restingHeartRate")
    if resting_hr:
        resting_hr = int(round(resting_hr))
    
    avg_stress = activity.get("averageStress")
    if avg_stress:
        avg_stress = int(round(avg_stress))
    
    raw_data = {
        "activity": activity,
        "hr_zones": hr_zones_data or {},
    }

    return SwimmingActivity(
        activity_id=str(activity.get("activityId", "")),
        activity_name=activity.get("activityName", "Swimming"),
        start_time=activity.get("startTimeLocal", activity.get("startTimeGMT", "")),
        distance_meters=distance,
        duration_seconds=duration,
        pool_length=activity.get("poolLength"),
        stroke_type=determine_stroke_type(
            activity.get("activityName", ""),
            activity_type
        ),
        avg_pace_per_100m=avg_pace,
        calories=activity.get("calories"),
        avg_heart_rate=activity.get("averageHR"),
        max_heart_rate=activity.get("maxHR"),
        swolf_score=activity.get("averageSwolf"),
        laps_count=activity.get("lapCount") or activity.get("totalLaps"),
        avg_stroke_distance=avg_stroke_distance,
        avg_strokes=avg_strokes,
        avg_stroke_cadence=avg_stroke_cadence,
        training_effect=training_effect,
        anaerobic_training_effect=anaerobic_te,
        vo2_max_value=vo2_max,
        recovery_time_hours=recovery_time,
        resting_heart_rate=resting_hr,
        avg_stress=avg_stress,
        is_open_water=is_open_water,
        hr_zone_1_seconds=hr_zones_data.get("zone1") if hr_zones_data else None,
        hr_zone_2_seconds=hr_zones_data.get("zone2") if hr_zones_data else None,
        hr_zone_3_seconds=hr_zones_data.get("zone3") if hr_zones_data else None,
        hr_zone_4_seconds=hr_zones_data.get("zone4") if hr_zones_data else None,
        hr_zone_5_seconds=hr_zones_data.get("zone5") if hr_zones_data else None,
        raw_data=raw_data
    )


def cleanup_expired_mfa():
    """Remove expired MFA sessions (older than 10 minutes)"""
    now = datetime.now()
    expired = []
    for user_id, data in list(pending_mfa.items()):
        created_at = data.get("created_at")
        if created_at and (now - created_at).total_seconds() > 600:  # 10 minutes
            expired.append(user_id)
    for user_id in expired:
        clear_pending_mfa(user_id)
        logger.info(f"Cleaned up expired MFA session for user {user_id}")

    # Encrypted MFA states whose in-memory entry is gone (e.g. after a restart).
    # The file is written when the MFA login starts, so its mtime is its age.
    cutoff = now.timestamp() - MFA_STATE_TTL_SECONDS
    for state_file in TOKEN_STORE_DIR.glob(f"*/{MFA_STATE_FILENAME}"):
        with suppress(OSError):
            if state_file.stat().st_mtime < cutoff:
                state_file.unlink()
                logger.info(f"Deleted expired MFA state file for user {state_file.parent.name}")

    expired_rate_limits = []
    for user_id, blocked_until in list(login_rate_limited_until.items()):
        if blocked_until <= now:
            expired_rate_limits.append(user_id)
    for user_id in expired_rate_limits:
        login_rate_limited_until.pop(user_id, None)


# API Endpoints
@app.get("/")
async def root():
    return {"service": "SwimForge Garmin Service", "version": "2.0.0", "mfa_support": True}


@app.get("/health")
async def health_check():
    cleanup_expired_mfa()
    return {
        "status": "healthy",
        "active_sessions": len(sessions),
        "pending_mfa": len(pending_mfa)
    }


@app.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest, api_key: str = Depends(verify_api_key)):
    """
    Step 1: Authenticate with Garmin Connect
    If MFA is required, returns mfa_required=True and you must call /auth/mfa with the code
    """
    try:
        logger.info(f"Attempting login for user {request.user_id}")
        cleanup_expired_mfa()
        remaining = get_rate_limit_remaining_seconds(request.user_id)
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail=(
                    "Garmin ha temporaneamente limitato i tentativi di accesso. "
                    f"Attendi {remaining} secondi prima di riprovare."
                ),
                headers={"Retry-After": str(remaining)},
            )
        
        # Import garminconnect
        try:
            from garminconnect import Garmin, GarminConnectTooManyRequestsError
        except ImportError as e:
            logger.error(f"Failed to import garminconnect: {e}")
            raise HTTPException(
                status_code=500,
                detail="Garmin Connect library not available."
            )

        token_dir = ensure_token_dir(request.user_id)
        token_file = get_token_file(token_dir)

        # Try token-based restore first (same pattern used by upstream examples):
        # this avoids unnecessary credential logins that can trigger Garmin rate limits.
        if token_file.exists():
            try:
                client_from_token = login_from_token_store(token_dir)

                try:
                    display_name = client_from_token.display_name
                except Exception:
                    display_name = request.email

                sessions[request.user_id] = {
                    "client": client_from_token,
                    "email": request.email,
                    "display_name": display_name,
                    "last_sync": None,
                    "connected_at": datetime.now().isoformat()
                }

                token_data = None
                try:
                    token_data = read_token_data(token_dir)
                except Exception as read_err:
                    logger.warning(f"Could not read token data for user {request.user_id}: {read_err}")

                logger.info(f"Reused stored Garmin tokens for user {request.user_id}")
                return LoginResponse(
                    success=True,
                    message="Connesso a Garmin Connect con token esistente.",
                    user_id=request.user_id,
                    mfa_required=False,
                    token_data=token_data
                )
            except GarminConnectTooManyRequestsError as rate_err:
                logger.warning(f"Token restore rate-limited for user {request.user_id}: {rate_err}")
                if is_login_blocked_error(rate_err):
                    raise login_blocked_exception(request.user_id)
                retry_after = set_rate_limit_cooldown(request.user_id)
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "Garmin sta limitando temporaneamente i tentativi di accesso da questo server. "
                        "Attendi qualche minuto e riprova."
                    ),
                    headers={"Retry-After": str(retry_after)},
                )
            except Exception as token_err:
                logger.warning(f"Stored token restore failed for user {request.user_id}: {token_err}")
                try:
                    token_file.unlink()
                    logger.info(f"Deleted invalid tokens for user {request.user_id}")
                except Exception:
                    pass

        # Clear any pending MFA for this user (in memory and on disk)
        clear_pending_mfa(request.user_id)
        
        # Create Garmin client with return_on_mfa=True
        client = Garmin(
            email=request.email,
            password=request.password,
            is_cn=False,
            return_on_mfa=True
        )
        
        logger.info(f"Attempting Garmin login for user {request.user_id}")

        # With return_on_mfa=True the library never prompts: it returns
        # ("needs_mfa", client_state) and resume_login() finishes the login later,
        # on this instance or on a fresh Garmin() built from client_state.
        try:
            result = client.login()
        except GarminConnectTooManyRequestsError as rate_err:
            logger.warning(f"Login rate-limited for user {request.user_id}: {rate_err}")
            if is_login_blocked_error(rate_err):
                raise login_blocked_exception(request.user_id)
            retry_after = set_rate_limit_cooldown(request.user_id)
            raise HTTPException(
                status_code=429,
                detail=(
                    "Garmin sta limitando temporaneamente i tentativi di accesso da questo server. "
                    "Attendi qualche minuto e riprova."
                ),
                headers={"Retry-After": str(retry_after)},
            )

        status, mfa_state = result if isinstance(result, tuple) and len(result) == 2 else (None, None)
        if status == "needs_mfa":
            logger.info(f"MFA required for user {request.user_id}")

            pending_mfa[request.user_id] = {
                "client": client,
                "mfa_state": mfa_state,
                "email": request.email,
                "created_at": datetime.now()
            }
            # Survives a restart: /auth/mfa can resume from the encrypted file.
            persist_mfa_state(request.user_id, mfa_state)

            return LoginResponse(
                success=False,
                message="È richiesta l'autenticazione a due fattori (MFA). Controlla la tua email e inserisci il codice ricevuto.",
                user_id=request.user_id,
                mfa_required=True
            )

        # Login successful without MFA
        logger.info(f"Login successful (no MFA) for user {request.user_id}")
        # In return_on_mfa mode the library keeps the password on the object;
        # the session no longer needs it.
        client.password = None
        
        # Save tokens
        token_data = None
        try:
            token_data = save_client_tokens(client, token_dir)
            logger.info(f"Saved tokens for user {request.user_id}")
        except Exception as e:
            logger.warning(f"Could not save tokens: {e}")
        
        # Get display name (return_on_mfa mode does not load the profile up front)
        try:
            display_name = client.display_name or request.email
        except Exception:
            display_name = request.email
        
        # Store session
        sessions[request.user_id] = {
            "client": client,
            "email": request.email,
            "display_name": display_name,
            "last_sync": None,
            "connected_at": datetime.now().isoformat()
        }
        
        return LoginResponse(
            success=True,
            message="Connesso a Garmin Connect con successo!",
            user_id=request.user_id,
            mfa_required=False,
            token_data=token_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Login error for user {request.user_id}: {error_str}")
        
        # Check for specific errors
        if is_login_blocked_error(e):
            raise login_blocked_exception(request.user_id)
        elif "401" in error_str or "Unauthorized" in error_str or "Authentication" in error_str:
            raise HTTPException(
                status_code=401,
                detail="Credenziali Garmin non valide. Verifica email e password."
            )
        elif is_rate_limit_error(error_str):
            retry_after = set_rate_limit_cooldown(request.user_id)
            raise HTTPException(
                status_code=429,
                detail=(
                    "Garmin sta limitando temporaneamente i tentativi di login da questo IP. "
                    "Attendi qualche minuto e riprova con un solo tentativo."
                ),
                headers={"Retry-After": str(retry_after)},
            )
        elif "MFA" in error_str.upper() or "needs_mfa" in error_str.lower():
            raise HTTPException(
                status_code=400,
                detail="È richiesta l'autenticazione MFA ma non è stata gestita correttamente. Riprova."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Errore durante il collegamento a Garmin. Riprova tra qualche minuto."
            )


@app.post("/auth/mfa", response_model=LoginResponse)
def complete_mfa(request: MFARequest, api_key: str = Depends(verify_api_key)):
    """
    Step 2: Complete MFA authentication with the code received via email
    """
    try:
        logger.info(f"Completing MFA for user {request.user_id}")
        
        # Check if we have a pending MFA session: in memory, or (after a restart)
        # the encrypted client_state written by /auth/login.
        mfa_session = pending_mfa.get(request.user_id)
        if mfa_session is None:
            persisted = load_persisted_mfa_state(request.user_id)
            if persisted is None:
                raise HTTPException(
                    status_code=400,
                    detail="Nessuna sessione MFA in attesa. Riavvia il processo di login."
                )
            from garminconnect import Garmin

            persisted_state, persisted_created_at = persisted
            # resume_login() rebuilds the pending SSO login from client_state on
            # any Garmin instance. Keeping the instance in pending_mfa lets a
            # wrong code be retried on it, as with the original instance.
            mfa_session = {
                "client": Garmin(),
                "mfa_state": persisted_state,
                "email": None,
                "created_at": datetime.fromtimestamp(persisted_created_at),
            }
            pending_mfa[request.user_id] = mfa_session
            logger.info(f"Resuming MFA for user {request.user_id} from persisted state")

        client = mfa_session["client"]
        mfa_state = mfa_session["mfa_state"]
        email = mfa_session["email"]
        
        # Check if session is expired (10 minutes)
        created_at = mfa_session.get("created_at")
        if created_at and (datetime.now() - created_at).total_seconds() > MFA_STATE_TTL_SECONDS:
            clear_pending_mfa(request.user_id)
            raise HTTPException(
                status_code=400,
                detail="La sessione MFA è scaduta. Riavvia il processo di login."
            )
        
        # Complete MFA using resume_login
        try:
            logger.info(f"Completing MFA with resume_login for user {request.user_id}")
            
            # Use resume_login to complete MFA authentication
            client.resume_login(mfa_state, request.mfa_code)
            # The original instance still holds the password; the session no longer needs it.
            client.password = None
            
            logger.info(f"MFA completed successfully for user {request.user_id}")
                
        except HTTPException:
            raise
        except Exception as mfa_error:
            from garminconnect import GarminConnectAuthenticationError

            error_str = str(mfa_error)
            logger.error(f"MFA error for user {request.user_id}: {error_str}")
            
            if is_login_blocked_error(mfa_error):
                clear_pending_mfa(request.user_id)
                raise login_blocked_exception(request.user_id)
            elif isinstance(mfa_error, GarminConnectAuthenticationError) or "401" in error_str or "403" in error_str or "Invalid" in error_str or "incorrect" in error_str.lower():
                raise HTTPException(
                    status_code=401,
                    detail="Codice MFA non valido. Verifica il codice e riprova."
                )
            elif is_rate_limit_error(error_str):
                # Clean up on rate limit
                clear_pending_mfa(request.user_id)
                retry_after = set_rate_limit_cooldown(request.user_id)
                raise HTTPException(
                    status_code=429,
                    detail="Troppi tentativi. Attendi qualche minuto e riprova.",
                    headers={"Retry-After": str(retry_after)},
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Errore durante la verifica MFA: {error_str}"
                )
        
        # Clean up pending MFA (in memory and on disk)
        clear_pending_mfa(request.user_id)
        
        # Save tokens
        token_dir = ensure_token_dir(request.user_id)
        token_data = None
        try:
            token_data = save_client_tokens(client, token_dir)
            logger.info(f"Saved tokens for user {request.user_id}")
        except Exception as e:
            logger.warning(f"Could not save tokens: {e}")
        
        # Get display name
        try:
            display_name = client.display_name
        except Exception:
            display_name = email
        
        # Store session
        sessions[request.user_id] = {
            "client": client,
            "email": email,
            "display_name": display_name,
            "last_sync": None,
            "connected_at": datetime.now().isoformat()
        }
        
        return LoginResponse(
            success=True,
            message="Connesso a Garmin Connect con successo!",
            user_id=request.user_id,
            mfa_required=False,
            token_data=token_data
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected MFA error for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore imprevisto: {str(e)}"
        )


@app.get("/auth/mfa-status/{user_id}")
async def get_mfa_status(user_id: str, api_key: str = Depends(verify_api_key)):
    """Check if there's a pending MFA session for a user"""
    cleanup_expired_mfa()
    
    pending = pending_mfa.get(user_id)
    if pending is not None:
        created_at = pending.get("created_at")
        if created_at:
            remaining = MFA_STATE_TTL_SECONDS - (datetime.now() - created_at).total_seconds()
            return {
                "pending": True,
                "remaining_seconds": max(0, int(remaining))
            }
    else:
        persisted = load_persisted_mfa_state(user_id)
        if persisted is not None:
            remaining = MFA_STATE_TTL_SECONDS - (time.time() - persisted[1])
            return {
                "pending": True,
                "remaining_seconds": max(0, int(remaining))
            }
    
    return {"pending": False, "remaining_seconds": 0}


@app.post("/auth/logout")
async def logout(user_id: str, api_key: str = Depends(verify_api_key)):
    """Clear stored session for user"""
    if user_id in sessions:
        del sessions[user_id]
        logger.info(f"Logged out user {user_id}")
    
    clear_pending_mfa(user_id)
    
    # Delete stored tokens (and any leftover pre-0.3.20 single-file store)
    token_file = get_token_file(get_token_dir(user_id))
    for path in (token_file, TOKEN_STORE_DIR / f"{user_id}.json"):
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass
    
    return {"success": True, "message": "Disconnesso con successo"}


@app.post("/auth/restore")
def restore_session(
    request: RestoreRequest,
    api_key: str = Depends(verify_api_key)
):
    """Restore Garmin session from token data stored in DB."""
    try:
        token_dir = ensure_token_dir(request.user_id)
        write_token_data_securely(token_dir, request.token_data)

        try:
            client = login_from_token_store(token_dir)
        except ImportError as e:
            logger.error(f"Failed to import garminconnect: {e}")
            raise HTTPException(
                status_code=500,
                detail="Garmin Connect library not available."
            )

        try:
            display_name = client.display_name
        except Exception:
            display_name = None

        sessions[request.user_id] = {
            "client": client,
            "email": None,
            "display_name": display_name,
            "last_sync": None,
            "connected_at": datetime.now().isoformat()
        }

        return {"success": True, "message": "Sessione Garmin ripristinata"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to restore session for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel ripristino della sessione Garmin: {str(e)}"
        )


@app.get("/auth/status/{user_id}", response_model=StatusResponse)
async def get_status(user_id: str, api_key: str = Depends(verify_api_key)):
    """Check authentication status for user"""
    session = sessions.get(user_id)
    
    if not session or not session.get("client"):
        # Check if we have stored tokens
        if get_token_file(ensure_token_dir(user_id, create=False)).exists():
            return StatusResponse(
                connected=True,
                email=None,
                last_sync=None,
                display_name="(Token salvato)"
            )
        return StatusResponse(connected=False)
    
    return StatusResponse(
        connected=True,
        email=session.get("email"),
        last_sync=session.get("last_sync"),
        display_name=session.get("display_name")
    )


@app.get("/activities/swimming/{user_id}")
def get_swimming_activities(
    user_id: str,
    days_back: int = 30,
    api_key: str = Depends(verify_api_key),
    max_activities: Optional[int] = Query(default=None, ge=1, le=MAX_ACTIVITIES_LIMIT),
):
    """Fetch swimming activities from Garmin Connect (the last max_activities swims when given)"""
    client = get_garmin_client(user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        # Fetch activities (limit to 100), then pick the swims to import before
        # any per-activity Garmin call (HR zones), so a capped sync costs less.
        activities = client.get_activities(0, 100)
        selected = select_recent_swims(activities, max_activities, days_back, datetime.now())
        if max_activities is not None:
            logger.info(f"Sync capped to the last {max_activities} swims for user {user_id}: {len(selected)} selected")

        swimming_activities = []
        for activity in selected:
            hr_zones_data = None
            try:
                activity_id = activity.get("activityId")
                if activity_id:
                    hr_zones_response = client.get_activity_hr_in_timezones(activity_id)
                    if hr_zones_response:
                        # Handle both list and dict responses
                        if isinstance(hr_zones_response, list):
                            # If it's a list, convert it to a dict by zone number
                            hr_zones_data = {
                                "zone1": 0,
                                "zone2": 0,
                                "zone3": 0,
                                "zone4": 0,
                                "zone5": 0
                            }
                            for zone in hr_zones_response:
                                if isinstance(zone, dict):
                                    zone_num = zone.get("zoneNumber")
                                    time_in_seconds = zone.get("secsInZone", 0)
                                    if zone_num and 1 <= zone_num <= 5:
                                        hr_zones_data[f"zone{zone_num}"] = time_in_seconds
                        elif isinstance(hr_zones_response, dict):
                            # If it's a dict, extract directly
                            hr_zones_data = {
                                "zone1": hr_zones_response.get("zone1TimeInSeconds", 0),
                                "zone2": hr_zones_response.get("zone2TimeInSeconds", 0),
                                "zone3": hr_zones_response.get("zone3TimeInSeconds", 0),
                                "zone4": hr_zones_response.get("zone4TimeInSeconds", 0),
                                "zone5": hr_zones_response.get("zone5TimeInSeconds", 0)
                            }
                        logger.info(f"HR zones for activity {activity_id}: {hr_zones_data}")
            except Exception as hr_err:
                logger.warning(f"Could not fetch HR zones for activity {activity.get('activityId')}: {hr_err}")
            try:
                swimming_activities.append(parse_swimming_activity(activity, hr_zones_data))
            except Exception:
                swimming_activities.append(parse_swimming_activity(activity))

        logger.info(f"Found {len(swimming_activities)} swimming activities for user {user_id}")
        
        return {
            "success": True,
            "count": len(swimming_activities),
            "activities": [a.model_dump() for a in swimming_activities]
        }
        
    except Exception as e:
        logger.error(f"Error fetching activities for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero delle attività: {str(e)}"
        )


@app.get("/activity/{activity_id}/hr-zones")
def get_activity_hr_zones(
    activity_id: str,
    user_id: str = Header(None, alias="user-id"),
    api_key: str = Depends(verify_api_key)
):
    """Get HR zones data for a specific activity"""
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="user-id header is required"
        )
    
    client = get_garmin_client(user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        logger.info(f"Fetching HR zones for activity {activity_id}")
        hr_zones_response = client.get_activity_hr_in_timezones(activity_id)
        
        logger.info(f"HR zones response type: {type(hr_zones_response)}")
        logger.info(f"HR zones response: {hr_zones_response}")
        
        if not hr_zones_response:
            return {
                "zone1": 0,
                "zone2": 0,
                "zone3": 0,
                "zone4": 0,
                "zone5": 0
            }
        
        # Handle both list and dict responses
        if isinstance(hr_zones_response, list):
            # If it's a list, convert it to a dict by zone number
            hr_zones_data = {
                "zone1": 0,
                "zone2": 0,
                "zone3": 0,
                "zone4": 0,
                "zone5": 0
            }
            for zone in hr_zones_response:
                if isinstance(zone, dict):
                    zone_num = zone.get("zoneNumber")
                    time_in_seconds = zone.get("secsInZone", 0)
                    if zone_num and 1 <= zone_num <= 5:
                        hr_zones_data[f"zone{zone_num}"] = time_in_seconds
        elif isinstance(hr_zones_response, dict):
            # If it's a dict, extract directly
            hr_zones_data = {
                "zone1": hr_zones_response.get("zone1TimeInSeconds", 0),
                "zone2": hr_zones_response.get("zone2TimeInSeconds", 0),
                "zone3": hr_zones_response.get("zone3TimeInSeconds", 0),
                "zone4": hr_zones_response.get("zone4TimeInSeconds", 0),
                "zone5": hr_zones_response.get("zone5TimeInSeconds", 0)
            }
        else:
            # Unknown format, return zeros
            hr_zones_data = {
                "zone1": 0,
                "zone2": 0,
                "zone3": 0,
                "zone4": 0,
                "zone5": 0
            }
        
        logger.info(f"HR zones for activity {activity_id}: {hr_zones_data}")
        return hr_zones_data
        
    except Exception as e:
        logger.error(f"Error fetching HR zones for activity {activity_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero delle zone HR: {str(e)}"
        )


@app.get("/activity/{activity_id}/details")
def get_activity_details(
    activity_id: str,
    user_id: str = Header(None, alias="user-id"),
    api_key: str = Depends(verify_api_key)
):
    """Get detailed data for a specific activity including SWOLF"""
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="user-id header is required"
        )
    
    client = get_garmin_client(user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        logger.info(f"Fetching details for activity {activity_id}")
        # get_activity_evaluation() does not exist in python-garminconnect 0.3.x;
        # the activity summary carries the average SWOLF.
        activity_details = client.get_activity(activity_id)
        
        if not isinstance(activity_details, dict) or not activity_details:
            return {
                "swolf_score": None
            }
        
        # Extract SWOLF score (top level or inside summaryDTO)
        summary = activity_details.get("summaryDTO")
        swolf_score = activity_details.get("averageSwolf")
        if swolf_score is None and isinstance(summary, dict):
            swolf_score = summary.get("averageSwolf")
        
        return {
            "swolf_score": swolf_score
        }
        
    except Exception as e:
        logger.error(f"Error fetching details for activity {activity_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero dei dettagli: {str(e)}"
        )


@app.get("/activity/{activity_id}/full")
def get_activity_full_details(
    activity_id: str,
    user_id: str = Header(None, alias="user-id"),
    api_key: str = Depends(verify_api_key)
):
    """Get full Garmin activity details (splits, typed splits, weather, gear, zones, etc)."""
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="user-id header is required"
        )

    client = get_garmin_client(user_id)

    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )

    logger.info(f"Fetching full Garmin details for activity {activity_id}")

    details = safe_garmin_call(getattr(client, "get_activity_details", None), activity_id)
    activity = safe_garmin_call(getattr(client, "get_activity", None), activity_id)
    splits = safe_garmin_call(getattr(client, "get_activity_splits", None), activity_id)
    typed_splits = safe_garmin_call(getattr(client, "get_activity_typed_splits", None), activity_id)
    split_summaries = safe_garmin_call(getattr(client, "get_activity_split_summaries", None), activity_id)
    weather = safe_garmin_call(getattr(client, "get_activity_weather", None), activity_id)
    hr_zones = safe_garmin_call(getattr(client, "get_activity_hr_in_timezones", None), activity_id)
    power_zones = safe_garmin_call(getattr(client, "get_activity_power_in_timezones", None), activity_id)
    gear = safe_garmin_call(getattr(client, "get_activity_gear", None), activity_id)
    exercise_sets = safe_garmin_call(getattr(client, "get_activity_exercise_sets", None), activity_id)

    return {
        "activity": activity,
        "details": details,
        "splits": splits,
        "typed_splits": typed_splits,
        "split_summaries": split_summaries,
        "weather": weather,
        "hr_zones": hr_zones,
        "power_zones": power_zones,
        "gear": gear,
        "exercise_sets": exercise_sets,
    }


@app.post("/sync", response_model=SyncResponse)
def sync_activities(request: SyncRequest, api_key: str = Depends(verify_api_key)):
    """Sync swimming activities from Garmin Connect"""
    client = get_garmin_client(request.user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        # Get swimming activities
        result = get_swimming_activities(
            request.user_id,
            request.days_back,
            api_key,
            max_activities=request.max_activities,
        )
        
        # Update last sync time
        if request.user_id in sessions:
            sessions[request.user_id]["last_sync"] = datetime.now().isoformat()
        
        activities = [SwimmingActivity(**a) for a in result["activities"]]
        
        return SyncResponse(
            success=True,
            synced_count=len(activities),
            activities=activities,
            message=f"Sincronizzate {len(activities)} attività di nuoto"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing activities for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore nella sincronizzazione: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
