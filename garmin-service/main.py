"""
SwimForge Garmin Connect Microservice - Garth Version

This version uses garth directly for authentication to avoid garminconnect bugs.
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
import garth

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
API_SECRET_KEY = os.getenv("GARMIN_SERVICE_SECRET", "swimforge-garmin-secret-key")
TOKEN_STORE_DIR = Path(os.getenv("TOKEN_STORE_DIR", "/tmp/garmin_tokens"))

# Ensure token store directory exists
TOKEN_STORE_DIR.mkdir(parents=True, exist_ok=True)

# In-memory session storage
sessions: Dict[str, Dict[str, Any]] = {}
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


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Garmin Service with Garth authentication...")
    yield
    logger.info("Shutting down Garmin Service...")
    sessions.clear()
    pending_mfa.clear()


# Create FastAPI app
app = FastAPI(
    title="SwimForge Garmin Service (Garth)",
    description="Microservice for Garmin Connect with Garth authentication",
    version="3.0.0",
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


def get_token_path(user_id: str) -> Path:
    """Get the token file path for a user"""
    return TOKEN_STORE_DIR / f"{user_id}.json"


def cleanup_expired_mfa():
    """Remove expired MFA sessions (older than 10 minutes)"""
    now = datetime.now()
    expired = []
    for user_id, data in pending_mfa.items():
        created_at = data.get("created_at")
        if created_at and (now - created_at).total_seconds() > 600:
            expired.append(user_id)
    for user_id in expired:
        del pending_mfa[user_id]
        logger.info(f"Cleaned up expired MFA session for user {user_id}")


# API Endpoints
@app.get("/")
async def root():
    return {"service": "SwimForge Garmin Service", "version": "3.0.0", "auth": "garth"}


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
    Step 1: Authenticate with Garmin Connect using Garth
    """
    try:
        logger.info(f"Attempting login for user {request.user_id}")
        cleanup_expired_mfa()
        
        # Clear any pending MFA for this user
        if request.user_id in pending_mfa:
            del pending_mfa[request.user_id]
        
        # Clear any existing session
        if request.user_id in sessions:
            del sessions[request.user_id]
        
        # Configure garth
        garth.configure(domain="garmin.com")
        
        try:
            # Attempt login with garth
            logger.info(f"Calling garth.login for user {request.user_id}")
            garth.login(request.email, request.password)
            
            # If we get here without exception, login was successful
            logger.info(f"Login successful for user {request.user_id}")
            
            # Save tokens
            token_path = get_token_path(request.user_id)
            try:
                garth.save(str(token_path))
                logger.info(f"Saved tokens for user {request.user_id}")
            except Exception as e:
                logger.warning(f"Could not save tokens: {e}")
            
            # Store session
            sessions[request.user_id] = {
                "email": request.email,
                "connected_at": datetime.now().isoformat(),
                "last_sync": None
            }
            
            return LoginResponse(
                success=True,
                message="Connesso a Garmin Connect con successo!",
                user_id=request.user_id,
                mfa_required=False
            )
            
        except garth.exc.GarthHTTPError as e:
            error_msg = str(e).lower()
            logger.info(f"Garth HTTP error for user {request.user_id}: {e}")
            
            # Check if MFA is required
            if "mfa" in error_msg or "verification" in error_msg or "code" in error_msg:
                logger.info(f"MFA required for user {request.user_id}")
                
                # Store pending MFA session
                pending_mfa[request.user_id] = {
                    "email": request.email,
                    "password": request.password,
                    "created_at": datetime.now()
                }
                
                return LoginResponse(
                    success=False,
                    message="È richiesta l'autenticazione a due fattori (MFA). Controlla la tua email e inserisci il codice ricevuto.",
                    user_id=request.user_id,
                    mfa_required=True
                )
            elif "401" in str(e) or "403" in str(e):
                raise HTTPException(
                    status_code=401,
                    detail="Credenziali Garmin non valide. Verifica email e password."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Errore durante il collegamento: {str(e)}"
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error for user {request.user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore durante il collegamento: {str(e)}"
        )


@app.post("/auth/mfa", response_model=LoginResponse)
async def complete_mfa(request: MFARequest, api_key: str = Depends(verify_api_key)):
    """
    Step 2: Complete MFA authentication with the code
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
        email = mfa_session["email"]
        password = mfa_session["password"]
        
        # Check if session is expired
        created_at = mfa_session.get("created_at")
        if created_at and (datetime.now() - created_at).total_seconds() > 600:
            del pending_mfa[request.user_id]
            raise HTTPException(
                status_code=400,
                detail="La sessione MFA è scaduta. Riavvia il processo di login."
            )
        
        # Configure garth
        garth.configure(domain="garmin.com")
        
        try:
            # Complete MFA with garth
            logger.info(f"Calling garth.login with MFA code for user {request.user_id}")
            garth.login(email, password)
            
            # Now submit the MFA code
            garth.client.post(
                "https://sso.garmin.com/sso/verifyMFA/loginEnterMfaCode",
                json={"mfaCode": request.mfa_code, "embedWidget": False}
            )
            
            logger.info(f"MFA completed successfully for user {request.user_id}")
            
            # Clean up pending MFA
            del pending_mfa[request.user_id]
            
            # Save tokens
            token_path = get_token_path(request.user_id)
            try:
                garth.save(str(token_path))
                logger.info(f"Saved tokens for user {request.user_id}")
            except Exception as e:
                logger.warning(f"Could not save tokens: {e}")
            
            # Store session
            sessions[request.user_id] = {
                "email": email,
                "connected_at": datetime.now().isoformat(),
                "last_sync": None
            }
            
            return LoginResponse(
                success=True,
                message="Connesso a Garmin Connect con successo!",
                user_id=request.user_id,
                mfa_required=False
            )
            
        except Exception as mfa_error:
            logger.error(f"MFA error for user {request.user_id}: {mfa_error}")
            error_str = str(mfa_error).lower()
            
            if "401" in error_str or "403" in error_str or "invalid" in error_str:
                raise HTTPException(
                    status_code=401,
                    detail="Codice MFA non valido. Verifica il codice e riprova."
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Errore durante la verifica MFA: {str(mfa_error)}"
                )
                
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MFA completion error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Errore durante la verifica MFA: {str(e)}"
        )


@app.get("/auth/status/{user_id}")
async def get_status(user_id: str):
    """Get authentication status for a user"""
    session = sessions.get(user_id)
    if session:
        return StatusResponse(
            connected=True,
            email=session.get("email"),
            last_sync=session.get("last_sync")
        )
    return StatusResponse(connected=False)


@app.post("/auth/logout")
async def logout(user_id: str, api_key: str = Depends(verify_api_key)):
    """Logout and clear session"""
    if user_id in sessions:
        del sessions[user_id]
    if user_id in pending_mfa:
        del pending_mfa[user_id]
    
    # Delete token file
    token_path = get_token_path(user_id)
    if token_path.exists():
        token_path.unlink()
    
    return {"success": True, "message": "Logged out successfully"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
