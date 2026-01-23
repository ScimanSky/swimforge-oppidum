"""
SwimForge Garmin Connect Microservice

This microservice handles authentication and data synchronization with Garmin Connect
using the unofficial python-garminconnect library.

Endpoints:
- POST /auth/login - Authenticate with Garmin Connect
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

# In-memory session storage (for demo - use Redis in production)
# Structure: {user_id: {"client": Garmin, "email": str, "last_sync": datetime}}
sessions: Dict[str, Dict[str, Any]] = {}


# Pydantic models
class LoginRequest(BaseModel):
    user_id: str
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[str] = None


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
    logger.info("Starting Garmin Connect Microservice...")
    yield
    logger.info("Shutting down Garmin Connect Microservice...")
    sessions.clear()


# Create FastAPI app
app = FastAPI(
    title="SwimForge Garmin Service",
    description="Microservice for Garmin Connect integration",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately in production
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


def save_tokens(user_id: str, garth_client) -> bool:
    """Save garth tokens to file"""
    try:
        token_path = get_token_path(user_id)
        garth_client.dump(str(token_path))
        logger.info(f"Tokens saved for user {user_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to save tokens for user {user_id}: {e}")
        return False


def load_tokens(user_id: str, garth_client) -> bool:
    """Load garth tokens from file"""
    try:
        token_path = get_token_path(user_id)
        if token_path.exists():
            garth_client.load(str(token_path))
            logger.info(f"Tokens loaded for user {user_id}")
            return True
        return False
    except Exception as e:
        logger.error(f"Failed to load tokens for user {user_id}: {e}")
        return False


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


# API Endpoints
@app.get("/")
async def root():
    return {"service": "SwimForge Garmin Service", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "active_sessions": len(sessions)}


@app.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest, api_key: str = Depends(verify_api_key)):
    """
    Authenticate with Garmin Connect and store session
    """
    try:
        logger.info(f"Attempting login for user {request.user_id}")
        
        # Import here to catch import errors
        try:
            from garminconnect import Garmin, GarminConnectAuthenticationError, GarminConnectConnectionError
        except ImportError as e:
            logger.error(f"Failed to import garminconnect: {e}")
            raise HTTPException(
                status_code=500,
                detail="Garmin Connect library not available. Please try again later."
            )
        
        # Create Garmin client
        client = Garmin(request.email, request.password)
        
        # Try to load existing tokens first
        token_path = get_token_path(request.user_id)
        if token_path.exists():
            try:
                client.garth.load(str(token_path))
                # Verify tokens are still valid
                client.display_name
                logger.info(f"Loaded existing tokens for user {request.user_id}")
                
                # Store session
                sessions[request.user_id] = {
                    "client": client,
                    "email": request.email,
                    "display_name": client.display_name,
                    "last_sync": None,
                    "connected_at": datetime.now().isoformat()
                }
                
                return LoginResponse(
                    success=True,
                    message="Successfully connected using saved tokens",
                    user_id=request.user_id
                )
            except Exception as e:
                logger.info(f"Saved tokens invalid, performing fresh login: {e}")
                # Delete invalid tokens
                token_path.unlink(missing_ok=True)
        
        # Attempt fresh login
        client.login()
        
        # Save tokens for future use
        try:
            client.garth.dump(str(token_path))
            logger.info(f"Saved tokens for user {request.user_id}")
        except Exception as e:
            logger.warning(f"Could not save tokens: {e}")
        
        # Get user profile for display name
        try:
            display_name = client.display_name
        except Exception:
            display_name = None
        
        # Store session
        sessions[request.user_id] = {
            "client": client,
            "email": request.email,
            "display_name": display_name,
            "last_sync": None,
            "connected_at": datetime.now().isoformat()
        }
        
        logger.info(f"Login successful for user {request.user_id}")
        
        return LoginResponse(
            success=True,
            message="Successfully connected to Garmin Connect",
            user_id=request.user_id
        )
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Login error for user {request.user_id}: {error_msg}")
        
        # Handle specific error types
        if "GarminConnectAuthenticationError" in str(type(e).__name__) or "401" in error_msg or "Unauthorized" in error_msg:
            raise HTTPException(
                status_code=401,
                detail="Credenziali Garmin non valide. Verifica email e password."
            )
        elif "GarminConnectConnectionError" in str(type(e).__name__):
            raise HTTPException(
                status_code=503,
                detail="Impossibile connettersi a Garmin. Riprova più tardi."
            )
        elif "MFA" in error_msg or "OAuth1 token" in error_msg:
            raise HTTPException(
                status_code=400,
                detail="Il tuo account Garmin ha l'autenticazione a due fattori (MFA) attiva. Per usare SwimForge, disabilita temporaneamente MFA nelle impostazioni di Garmin Connect, collega l'account, poi riattiva MFA."
            )
        elif "'str' object has no attribute" in error_msg:
            raise HTTPException(
                status_code=500,
                detail="Errore di autenticazione Garmin. Questo può essere causato da MFA attivo o da un problema temporaneo. Prova a disabilitare MFA o riprova più tardi."
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Errore durante il collegamento: {error_msg}"
            )


@app.post("/auth/logout")
async def logout(user_id: str, api_key: str = Depends(verify_api_key)):
    """
    Clear stored session for user
    """
    if user_id in sessions:
        del sessions[user_id]
        logger.info(f"Logged out user {user_id}")
    
    # Delete stored tokens
    token_path = get_token_path(user_id)
    token_path.unlink(missing_ok=True)
    
    return {"success": True, "message": "Successfully disconnected"}


@app.get("/auth/status/{user_id}", response_model=StatusResponse)
async def get_status(user_id: str, api_key: str = Depends(verify_api_key)):
    """
    Check authentication status for user
    """
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
    """
    Fetch swimming activities from Garmin Connect
    """
    client = get_garmin_client(user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please login first."
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
            detail=f"Error fetching activities: {str(e)}"
        )


@app.post("/sync", response_model=SyncResponse)
async def sync_activities(request: SyncRequest, api_key: str = Depends(verify_api_key)):
    """
    Sync swimming activities from Garmin Connect
    """
    client = get_garmin_client(request.user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please login first."
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
            message=f"Synced {len(activities)} swimming activities"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error syncing activities for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error syncing activities: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
