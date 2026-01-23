"""
SwimForge Garmin Connect Microservice

This microservice handles authentication and data synchronization with Garmin Connect
using the unofficial python-garminconnect library.

Supports MFA (Multi-Factor Authentication) with a two-step flow:
1. POST /auth/login - Initiates login, returns mfa_required if MFA is needed
2. POST /auth/mfa - Completes login with MFA code

Endpoints:
- POST /auth/login - Authenticate with Garmin Connect (step 1)
- POST /auth/mfa - Complete MFA authentication (step 2)
- POST /auth/logout - Clear stored session
- GET /auth/status - Check authentication status
- GET /activities/swimming - Fetch swimming activities
- POST /sync - Sync swimming activities to SwimForge
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
API_SECRET_KEY = os.getenv("GARMIN_SERVICE_SECRET", "swimforge-garmin-secret-key")
MAIN_API_URL = os.getenv("MAIN_API_URL", "http://localhost:3000")
TOKEN_STORE_DIR = Path(os.getenv("TOKEN_STORE_DIR", "/tmp/garmin_tokens"))

# Ensure token store directory exists
TOKEN_STORE_DIR.mkdir(parents=True, exist_ok=True)

# In-memory session storage
# Structure: {user_id: {"client": Garmin, "email": str, "last_sync": datetime, "mfa_state": Any}}
sessions: Dict[str, Dict[str, Any]] = {}

# Pending MFA sessions (waiting for MFA code)
# Structure: {user_id: {"client": Garmin, "mfa_state": Any, "email": str, "created_at": datetime}}
pending_mfa: Dict[str, Dict[str, Any]] = {}


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


class SyncRequest(BaseModel):
    user_id: str
    days_back: int = 30


class SyncResponse(BaseModel):
    success: bool
    synced_count: int
    activities: List[SwimmingActivity]
    message: Optional[str] = None


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

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Authentication dependency
async def verify_api_key(x_api_key: str = Header(None)):
    if x_api_key != API_SECRET_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return x_api_key


# Helper functions
def get_token_path(user_id: str) -> Path:
    """Get the token file path for a user"""
    return TOKEN_STORE_DIR / f"{user_id}.json"


def get_garmin_client(user_id: str):
    """Get existing Garmin client for user"""
    session = sessions.get(user_id)
    if session and session.get("client"):
        return session["client"]
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


def is_swimming_activity(activity: dict) -> bool:
    """Check if activity is a swimming activity"""
    activity_type = activity.get("activityType", {}).get("typeKey", "").lower()
    return "swim" in activity_type or "pool" in activity_type


def parse_swimming_activity(activity: dict) -> SwimmingActivity:
    """Parse Garmin activity into SwimmingActivity model"""
    activity_type = activity.get("activityType", {}).get("typeKey", "").lower()
    is_open_water = "open_water" in activity_type or "openwater" in activity_type
    
    distance = int(activity.get("distance", 0))
    duration = int(activity.get("duration", 0))
    
    # Calculate pace per 100m
    avg_pace = None
    if distance > 0 and duration > 0:
        avg_pace = int((duration / distance) * 100)
    
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
        swolf_score=activity.get("avgSwolf"),
        laps_count=activity.get("lapCount") or activity.get("totalLaps"),
        is_open_water=is_open_water
    )


def cleanup_expired_mfa():
    """Remove expired MFA sessions (older than 10 minutes)"""
    now = datetime.now()
    expired = []
    for user_id, data in pending_mfa.items():
        created_at = data.get("created_at")
        if created_at and (now - created_at).total_seconds() > 600:  # 10 minutes
            expired.append(user_id)
    for user_id in expired:
        del pending_mfa[user_id]
        logger.info(f"Cleaned up expired MFA session for user {user_id}")


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
async def login(request: LoginRequest, api_key: str = Depends(verify_api_key)):
    """
    Step 1: Authenticate with Garmin Connect
    If MFA is required, returns mfa_required=True and you must call /auth/mfa with the code
    """
    try:
        logger.info(f"Attempting login for user {request.user_id}")
        cleanup_expired_mfa()
        
        # Import garminconnect
        try:
            from garminconnect import Garmin
        except ImportError as e:
            logger.error(f"Failed to import garminconnect: {e}")
            raise HTTPException(
                status_code=500,
                detail="Garmin Connect library not available."
            )
        
        # Delete any existing invalid tokens
        token_path = get_token_path(request.user_id)
        if token_path.exists():
            try:
                token_path.unlink()
                logger.info(f"Deleted existing tokens for user {request.user_id}")
            except Exception:
                pass
        
        # Clear any pending MFA for this user
        if request.user_id in pending_mfa:
            del pending_mfa[request.user_id]
        
        # Create Garmin client with return_on_mfa=True to handle MFA
        client = Garmin(
            email=request.email,
            password=request.password,
            is_cn=False,
            return_on_mfa=True  # This is the key parameter for MFA support
        )
        
        logger.info(f"Attempting Garmin login for user {request.user_id}")
        
        # Attempt login
        result = client.login()
        
        # Check if MFA is required
        # When return_on_mfa=True, login() returns a tuple (status, mfa_state) if MFA is needed
        if isinstance(result, tuple) and len(result) == 2:
            status, mfa_state = result
            if status == "needs_mfa":
                logger.info(f"MFA required for user {request.user_id}")
                
                # Store pending MFA session
                pending_mfa[request.user_id] = {
                    "client": client,
                    "mfa_state": mfa_state,
                    "email": request.email,
                    "created_at": datetime.now()
                }
                
                return LoginResponse(
                    success=False,
                    message="È richiesta l'autenticazione a due fattori (MFA). Controlla la tua email e inserisci il codice ricevuto.",
                    user_id=request.user_id,
                    mfa_required=True
                )
        
        # Login successful without MFA
        logger.info(f"Login successful (no MFA) for user {request.user_id}")
        
        # Save tokens
        try:
            client.garth.dump(str(token_path))
            logger.info(f"Saved tokens for user {request.user_id}")
        except Exception as e:
            logger.warning(f"Could not save tokens: {e}")
        
        # Get display name
        try:
            display_name = client.display_name
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
            mfa_required=False
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_str = str(e)
        logger.error(f"Login error for user {request.user_id}: {error_str}")
        
        # Check for specific errors
        if "401" in error_str or "Unauthorized" in error_str or "Authentication" in error_str:
            raise HTTPException(
                status_code=401,
                detail="Credenziali Garmin non valide. Verifica email e password."
            )
        elif "MFA" in error_str.upper() or "needs_mfa" in error_str.lower():
            raise HTTPException(
                status_code=400,
                detail="È richiesta l'autenticazione MFA ma non è stata gestita correttamente. Riprova."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Errore durante il collegamento: {error_str}"
            )


@app.post("/auth/mfa", response_model=LoginResponse)
async def complete_mfa(request: MFARequest, api_key: str = Depends(verify_api_key)):
    """
    Step 2: Complete MFA authentication with the code received via email
    """
    try:
        logger.info(f"Completing MFA for user {request.user_id}")
        
        # Check if we have a pending MFA session
        if request.user_id not in pending_mfa:
            raise HTTPException(
                status_code=400,
                detail="Nessuna sessione MFA in attesa. Riavvia il processo di login."
            )
        
        mfa_session = pending_mfa[request.user_id]
        client = mfa_session["client"]
        mfa_state = mfa_session["mfa_state"]
        email = mfa_session["email"]
        
        # Check if session is expired (10 minutes)
        created_at = mfa_session.get("created_at")
        if created_at and (datetime.now() - created_at).total_seconds() > 600:
            del pending_mfa[request.user_id]
            raise HTTPException(
                status_code=400,
                detail="La sessione MFA è scaduta. Riavvia il processo di login."
            )
        
        # Complete MFA
        try:
            client.resume_login(mfa_state, request.mfa_code)
            logger.info(f"MFA completed successfully for user {request.user_id}")
        except Exception as mfa_error:
            error_str = str(mfa_error)
            logger.error(f"MFA error for user {request.user_id}: {error_str}")
            
            if "401" in error_str or "403" in error_str or "Invalid" in error_str:
                raise HTTPException(
                    status_code=401,
                    detail="Codice MFA non valido. Verifica il codice e riprova."
                )
            elif "429" in error_str:
                # Clean up on rate limit
                del pending_mfa[request.user_id]
                raise HTTPException(
                    status_code=429,
                    detail="Troppi tentativi. Attendi qualche minuto e riprova."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Errore durante la verifica MFA: {error_str}"
                )
        
        # Clean up pending MFA
        del pending_mfa[request.user_id]
        
        # Save tokens
        token_path = get_token_path(request.user_id)
        try:
            client.garth.dump(str(token_path))
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
            mfa_required=False
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
    
    if user_id in pending_mfa:
        created_at = pending_mfa[user_id].get("created_at")
        if created_at:
            remaining = 600 - (datetime.now() - created_at).total_seconds()
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
    
    if user_id in pending_mfa:
        del pending_mfa[user_id]
    
    # Delete stored tokens
    token_path = get_token_path(user_id)
    try:
        token_path.unlink(missing_ok=True)
    except Exception:
        pass
    
    return {"success": True, "message": "Disconnesso con successo"}


@app.get("/auth/status/{user_id}", response_model=StatusResponse)
async def get_status(user_id: str, api_key: str = Depends(verify_api_key)):
    """Check authentication status for user"""
    session = sessions.get(user_id)
    
    if not session or not session.get("client"):
        # Check if we have stored tokens
        token_path = get_token_path(user_id)
        if token_path.exists():
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
async def get_swimming_activities(
    user_id: str,
    days_back: int = 30,
    api_key: str = Depends(verify_api_key)
):
    """Fetch swimming activities from Garmin Connect"""
    client = get_garmin_client(user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        # Get activities
        start_date = datetime.now() - timedelta(days=days_back)
        
        # Fetch activities (limit to 100)
        activities = client.get_activities(0, 100)
        
        # Filter for swimming activities
        swimming_activities = []
        for activity in activities:
            if is_swimming_activity(activity):
                # Check if within date range
                activity_date = activity.get("startTimeLocal", "")
                if activity_date:
                    try:
                        act_dt = datetime.fromisoformat(activity_date.replace("Z", "+00:00"))
                        if act_dt.replace(tzinfo=None) >= start_date:
                            swimming_activities.append(parse_swimming_activity(activity))
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


@app.post("/sync", response_model=SyncResponse)
async def sync_activities(request: SyncRequest, api_key: str = Depends(verify_api_key)):
    """Sync swimming activities from Garmin Connect"""
    client = get_garmin_client(request.user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Non autenticato. Effettua prima il login."
        )
    
    try:
        # Get swimming activities
        result = await get_swimming_activities(
            request.user_id,
            request.days_back,
            api_key
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
