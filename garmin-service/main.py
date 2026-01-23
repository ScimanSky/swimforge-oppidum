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

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from garminconnect import Garmin, GarminConnectAuthenticationError, GarminConnectConnectionError
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
API_SECRET_KEY = os.getenv("GARMIN_SERVICE_SECRET", "swimforge-garmin-secret-key")
MAIN_API_URL = os.getenv("MAIN_API_URL", "http://localhost:3000")

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
def get_garmin_client(user_id: str) -> Optional[Garmin]:
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
        
        # Create Garmin client
        client = Garmin(request.email, request.password)
        
        # Attempt login
        client.login()
        
        # Get user profile for display name
        try:
            profile = client.get_full_name()
            display_name = profile if isinstance(profile, str) else None
        except:
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
        
    except GarminConnectAuthenticationError as e:
        logger.error(f"Authentication failed for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid Garmin credentials. Please check your email and password."
        )
    except GarminConnectConnectionError as e:
        logger.error(f"Connection error for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=503,
            detail="Unable to connect to Garmin. Please try again later."
        )
    except Exception as e:
        logger.error(f"Unexpected error during login for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred: {str(e)}"
        )


@app.post("/auth/logout")
async def logout(user_id: str, api_key: str = Depends(verify_api_key)):
    """
    Clear stored session for user
    """
    if user_id in sessions:
        del sessions[user_id]
        logger.info(f"Logged out user {user_id}")
        return {"success": True, "message": "Successfully disconnected"}
    
    return {"success": True, "message": "No active session found"}


@app.get("/auth/status/{user_id}", response_model=StatusResponse)
async def get_status(user_id: str, api_key: str = Depends(verify_api_key)):
    """
    Check authentication status for user
    """
    session = sessions.get(user_id)
    
    if not session or not session.get("client"):
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
        end_date = datetime.now()
        
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
                    except:
                        swimming_activities.append(parse_swimming_activity(activity))
        
        logger.info(f"Found {len(swimming_activities)} swimming activities for user {user_id}")
        
        return {
            "success": True,
            "count": len(swimming_activities),
            "activities": [a.model_dump() for a in swimming_activities]
        }
        
    except GarminConnectAuthenticationError:
        # Session expired, remove it
        if user_id in sessions:
            del sessions[user_id]
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please login again."
        )
    except Exception as e:
        logger.error(f"Error fetching activities for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching activities: {str(e)}"
        )


@app.post("/sync", response_model=SyncResponse)
async def sync_activities(request: SyncRequest, api_key: str = Depends(verify_api_key)):
    """
    Sync swimming activities from Garmin to SwimForge
    """
    client = get_garmin_client(request.user_id)
    
    if not client:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please login first."
        )
    
    try:
        # Get activities
        activities = client.get_activities(0, 100)
        
        # Filter for swimming activities within date range
        start_date = datetime.now() - timedelta(days=request.days_back)
        swimming_activities = []
        
        for activity in activities:
            if is_swimming_activity(activity):
                activity_date = activity.get("startTimeLocal", "")
                if activity_date:
                    try:
                        act_dt = datetime.fromisoformat(activity_date.replace("Z", "+00:00"))
                        if act_dt.replace(tzinfo=None) >= start_date:
                            swimming_activities.append(parse_swimming_activity(activity))
                    except:
                        swimming_activities.append(parse_swimming_activity(activity))
        
        # Update last sync time
        if request.user_id in sessions:
            sessions[request.user_id]["last_sync"] = datetime.now().isoformat()
        
        logger.info(f"Synced {len(swimming_activities)} activities for user {request.user_id}")
        
        return SyncResponse(
            success=True,
            synced_count=len(swimming_activities),
            activities=swimming_activities,
            message=f"Successfully synced {len(swimming_activities)} swimming activities"
        )
        
    except GarminConnectAuthenticationError:
        if request.user_id in sessions:
            del sessions[request.user_id]
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please login again."
        )
    except Exception as e:
        logger.error(f"Error syncing activities for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error syncing activities: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
