from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Security
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============ MODELS ============

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str
    email: str
    name: str
    has_subscription: bool = False
    created_at: datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class Device(BaseModel):
    id: str
    user_id: str
    name: str
    ip_address: str
    led_count: int = 119
    is_online: bool = False
    created_at: datetime

class DeviceCreate(BaseModel):
    name: str
    ip_address: str
    led_count: int = 119

class DeviceControl(BaseModel):
    on: Optional[bool] = None
    brightness: Optional[int] = None  # 0-255
    color: Optional[List[int]] = None  # [R, G, B]
    preset_id: Optional[str] = None

class Group(BaseModel):
    id: str
    user_id: str
    name: str
    device_ids: List[str]
    created_at: datetime

class GroupCreate(BaseModel):
    name: str
    device_ids: List[str]

class Preset(BaseModel):
    id: str
    name: str
    effect_id: int
    speed: int = 128
    intensity: int = 128
    palette: int = 0
    is_premium: bool = False
    description: str


# ============ PRE-PROGRAMMED PRESETS ============
PRESETS = [
    # Free presets
    {
        "id": "solid",
        "name": "Solid Color",
        "effect_id": 0,
        "speed": 128,
        "intensity": 128,
        "palette": 0,
        "is_premium": False,
        "description": "Solid color - use color picker"
    },
    {
        "id": "blink",
        "name": "Blink",
        "effect_id": 1,
        "speed": 128,
        "intensity": 128,
        "palette": 0,
        "is_premium": False,
        "description": "Simple blinking effect"
    },
    # Premium presets
    {
        "id": "rainbow",
        "name": "Rainbow",
        "effect_id": 9,
        "speed": 128,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "Classic rainbow cycle"
    },
    {
        "id": "fire",
        "name": "Fire Flicker",
        "effect_id": 12,
        "speed": 180,
        "intensity": 200,
        "palette": 0,
        "is_premium": True,
        "description": "Flickering fire effect"
    },
    {
        "id": "theater",
        "name": "Theater Chase",
        "effect_id": 6,
        "speed": 150,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "Theater chase effect"
    },
    {
        "id": "scanner",
        "name": "Scanner",
        "effect_id": 8,
        "speed": 100,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "KITT scanner effect"
    },
    {
        "id": "twinkle",
        "name": "Twinkle",
        "effect_id": 44,
        "speed": 128,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "Twinkling stars effect"
    },
    {
        "id": "plasma",
        "name": "Plasma",
        "effect_id": 52,
        "speed": 128,
        "intensity": 128,
        "palette": 11,
        "is_premium": True,
        "description": "Plasma effect"
    },
    {
        "id": "ripple",
        "name": "Ripple",
        "effect_id": 70,
        "speed": 128,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "Ripple waves effect"
    },
    {
        "id": "breathing",
        "name": "Breathing",
        "effect_id": 2,
        "speed": 60,
        "intensity": 128,
        "palette": 0,
        "is_premium": True,
        "description": "Smooth breathing effect"
    },
]


# ============ AUTH UTILITIES ============

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


# ============ WLED UTILITIES ============

async def send_wled_command(ip_address: str, state_data: dict) -> dict:
    """Send command to WLED device"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                f"http://{ip_address}/json/state",
                json=state_data
            )
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"WLED returned status {response.status_code}"}
    except httpx.TimeoutException:
        return {"success": False, "error": "Device timeout - check if device is online"}
    except Exception as e:
        return {"success": False, "error": str(e)}

async def get_wled_state(ip_address: str) -> dict:
    """Get current state from WLED device"""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"http://{ip_address}/json/state")
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"WLED returned status {response.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============ AUTH ROUTES ============

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    user_doc = {
        "email": user_data.email,
        "password": hashed_password,
        "name": user_data.name,
        "has_subscription": False,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    
    # Create token
    access_token = create_access_token({"sub": str(result.inserted_id)})
    
    user = User(
        id=str(result.inserted_id),
        email=user_doc["email"],
        name=user_doc["name"],
        has_subscription=user_doc["has_subscription"],
        created_at=user_doc["created_at"]
    )
    
    return Token(access_token=access_token, token_type="bearer", user=user)

@api_router.post("/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    user = await db.users.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    access_token = create_access_token({"sub": str(user["_id"])})
    
    user_obj = User(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        has_subscription=user.get("has_subscription", False),
        created_at=user["created_at"]
    )
    
    return Token(access_token=access_token, token_type="bearer", user=user_obj)

@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(
        id=str(current_user["_id"]),
        email=current_user["email"],
        name=current_user["name"],
        has_subscription=current_user.get("has_subscription", False),
        created_at=current_user["created_at"]
    )

@api_router.post("/auth/upgrade-subscription")
async def upgrade_subscription(current_user: dict = Depends(get_current_user)):
    """Mock subscription upgrade - in production integrate with payment gateway"""
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"has_subscription": True}}
    )
    return {"message": "Subscription activated successfully"}


# ============ DEVICE ROUTES ============

@api_router.post("/devices", response_model=Device)
async def create_device(device_data: DeviceCreate, current_user: dict = Depends(get_current_user)):
    # Check if device is reachable
    state = await get_wled_state(device_data.ip_address)
    is_online = state.get("success", False)
    
    device_doc = {
        "user_id": str(current_user["_id"]),
        "name": device_data.name,
        "ip_address": device_data.ip_address,
        "led_count": device_data.led_count,
        "is_online": is_online,
        "created_at": datetime.utcnow()
    }
    
    result = await db.devices.insert_one(device_doc)
    device_doc["_id"] = result.inserted_id
    
    return Device(
        id=str(result.inserted_id),
        user_id=device_doc["user_id"],
        name=device_doc["name"],
        ip_address=device_doc["ip_address"],
        led_count=device_doc["led_count"],
        is_online=device_doc["is_online"],
        created_at=device_doc["created_at"]
    )

@api_router.get("/devices", response_model=List[Device])
async def get_devices(current_user: dict = Depends(get_current_user)):
    devices = await db.devices.find({"user_id": str(current_user["_id"])}).to_list(1000)
    
    # Update online status for each device
    for device in devices:
        state = await get_wled_state(device["ip_address"])
        device["is_online"] = state.get("success", False)
        await db.devices.update_one(
            {"_id": device["_id"]},
            {"$set": {"is_online": device["is_online"]}}
        )
    
    return [
        Device(
            id=str(device["_id"]),
            user_id=device["user_id"],
            name=device["name"],
            ip_address=device["ip_address"],
            led_count=device["led_count"],
            is_online=device["is_online"],
            created_at=device["created_at"]
        )
        for device in devices
    ]

@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check online status
    state = await get_wled_state(device["ip_address"])
    device["is_online"] = state.get("success", False)
    
    return Device(
        id=str(device["_id"]),
        user_id=device["user_id"],
        name=device["name"],
        ip_address=device["ip_address"],
        led_count=device["led_count"],
        is_online=device["is_online"],
        created_at=device["created_at"]
    )

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.devices.delete_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Remove device from all groups
    await db.groups.update_many(
        {"user_id": str(current_user["_id"])},
        {"$pull": {"device_ids": device_id}}
    )
    
    return {"message": "Device deleted successfully"}


# ============ DEVICE CONTROL ROUTES ============

@api_router.post("/devices/{device_id}/control")
async def control_device(
    device_id: str,
    control: DeviceControl,
    current_user: dict = Depends(get_current_user)
):
    device = await db.devices.find_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    # Check subscription for premium presets
    if control.preset_id:
        preset = next((p for p in PRESETS if p["id"] == control.preset_id), None)
        if preset and preset["is_premium"] and not current_user.get("has_subscription", False):
            raise HTTPException(status_code=403, detail="This preset requires a premium subscription")
    
    # Build WLED state command
    state_data = {}
    
    if control.on is not None:
        state_data["on"] = control.on
    
    if control.brightness is not None:
        state_data["bri"] = control.brightness
    
    if control.color is not None:
        state_data["seg"] = [{"col": [control.color]}]
    
    if control.preset_id:
        preset = next((p for p in PRESETS if p["id"] == control.preset_id), None)
        if preset:
            state_data["seg"] = [{
                "fx": preset["effect_id"],
                "sx": preset["speed"],
                "ix": preset["intensity"],
                "pal": preset["palette"]
            }]
    
    # Send command to WLED
    result = await send_wled_command(device["ip_address"], state_data)
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to control device"))
    
    return {"message": "Device controlled successfully", "state": result.get("data")}

@api_router.get("/devices/{device_id}/state")
async def get_device_state(device_id: str, current_user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    state = await get_wled_state(device["ip_address"])
    
    if not state.get("success"):
        raise HTTPException(status_code=500, detail=state.get("error", "Failed to get device state"))
    
    return state.get("data")


# ============ GROUP ROUTES ============

@api_router.post("/groups", response_model=Group)
async def create_group(group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    # Verify all devices belong to user
    for device_id in group_data.device_ids:
        device = await db.devices.find_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
        if not device:
            raise HTTPException(status_code=400, detail=f"Device {device_id} not found")
    
    group_doc = {
        "user_id": str(current_user["_id"]),
        "name": group_data.name,
        "device_ids": group_data.device_ids,
        "created_at": datetime.utcnow()
    }
    
    result = await db.groups.insert_one(group_doc)
    group_doc["_id"] = result.inserted_id
    
    return Group(
        id=str(result.inserted_id),
        user_id=group_doc["user_id"],
        name=group_doc["name"],
        device_ids=group_doc["device_ids"],
        created_at=group_doc["created_at"]
    )

@api_router.get("/groups", response_model=List[Group])
async def get_groups(current_user: dict = Depends(get_current_user)):
    groups = await db.groups.find({"user_id": str(current_user["_id"])}).to_list(1000)
    return [
        Group(
            id=str(group["_id"]),
            user_id=group["user_id"],
            name=group["name"],
            device_ids=group["device_ids"],
            created_at=group["created_at"]
        )
        for group in groups
    ]

@api_router.put("/groups/{group_id}", response_model=Group)
async def update_group(group_id: str, group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    # Verify all devices belong to user
    for device_id in group_data.device_ids:
        device = await db.devices.find_one({"_id": ObjectId(device_id), "user_id": str(current_user["_id"])})
        if not device:
            raise HTTPException(status_code=400, detail=f"Device {device_id} not found")
    
    result = await db.groups.update_one(
        {"_id": ObjectId(group_id), "user_id": str(current_user["_id"])},
        {"$set": {"name": group_data.name, "device_ids": group_data.device_ids}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group = await db.groups.find_one({"_id": ObjectId(group_id)})
    
    return Group(
        id=str(group["_id"]),
        user_id=group["user_id"],
        name=group["name"],
        device_ids=group["device_ids"],
        created_at=group["created_at"]
    )

@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.groups.delete_one({"_id": ObjectId(group_id), "user_id": str(current_user["_id"])})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Group not found")
    
    return {"message": "Group deleted successfully"}

@api_router.post("/groups/{group_id}/control")
async def control_group(
    group_id: str,
    control: DeviceControl,
    current_user: dict = Depends(get_current_user)
):
    group = await db.groups.find_one({"_id": ObjectId(group_id), "user_id": str(current_user["_id"])})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check subscription for premium presets
    if control.preset_id:
        preset = next((p for p in PRESETS if p["id"] == control.preset_id), None)
        if preset and preset["is_premium"] and not current_user.get("has_subscription", False):
            raise HTTPException(status_code=403, detail="This preset requires a premium subscription")
    
    # Control all devices in group
    results = []
    for device_id in group["device_ids"]:
        device = await db.devices.find_one({"_id": ObjectId(device_id)})
        if not device:
            continue
        
        # Build WLED state command
        state_data = {}
        
        if control.on is not None:
            state_data["on"] = control.on
        
        if control.brightness is not None:
            state_data["bri"] = control.brightness
        
        if control.color is not None:
            state_data["seg"] = [{"col": [control.color]}]
        
        if control.preset_id:
            preset = next((p for p in PRESETS if p["id"] == control.preset_id), None)
            if preset:
                state_data["seg"] = [{
                    "fx": preset["effect_id"],
                    "sx": preset["speed"],
                    "ix": preset["intensity"],
                    "pal": preset["palette"]
                }]
        
        result = await send_wled_command(device["ip_address"], state_data)
        results.append({
            "device_id": str(device["_id"]),
            "device_name": device["name"],
            "success": result.get("success"),
            "error": result.get("error")
        })
    
    return {"message": "Group control executed", "results": results}


# ============ PRESET ROUTES ============

@api_router.get("/presets", response_model=List[Preset])
async def get_presets():
    return [Preset(**preset) for preset in PRESETS]


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
