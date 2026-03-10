# server.py
#
# Architecture:
#   App <-> Backend : auth, subscriptions, hub registry, cloud presets
#   App <-> Hub (WLED JSON API, local network) : LED control directly
#   Hub <-> Devices : DDP frames (configured in WLED hub via cfg.json type=80)
#
# Run:
#   uvicorn server:app --host 0.0.0.0 --port 8000

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import secrets
from pathlib import Path
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import jwt
from passlib.context import CryptContext
import httpx

from presets import PRESETS, find_preset

# ================== BOOT ==================

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("wled-backend")

# ================== SECURITY ==================

SECRET_KEY = os.environ.get("SECRET_KEY", "change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=True)

# ================== HTTPX ==================

HTTP_TIMEOUT = httpx.Timeout(connect=2.5, read=4.0, write=4.0, pool=2.5)
HTTP_LIMITS = httpx.Limits(max_keepalive_connections=20, max_connections=50)
http_client: Optional[httpx.AsyncClient] = None

# ================== UTILS ==================

def oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id format")


def utcnow() -> datetime:
    return datetime.utcnow()


def _parse_iso_z(s: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


# ================== WLED EFFECT MAPPING ==================

_ENGINE_TO_WLED_FX: Dict[str, int] = {
    "solid":          0,
    "blink":          1,
    "breathe":        2,
    "colorwipe":      3,
    "wipe_random":    4,
    "colorloop":      8,
    "rainbow":        9,
    "fade":           10,
    "strobe":         12,
    "dissolve":       21,
    "chase_rainbow":  28,
    "sparkle":        40,
    "bouncing_balls": 53,
    "lightning":      57,
    "scanner":        11,
    "running":        16,
    "twinkle":        17,
    "fireworks":      42,
    "fire_sync":       66,
    "meteor":          76,
    "comet":           25,
    "ripple":          79,
    "wipe_rev":        5,
    "strobe_rainbow":  13,
    "twinkle_random":  18,
    "twinkle_fade":    19,
    "colorful":        35,
    "juggle":          38,
    "sparkle_dark":    41,
    "rain":            45,
    "scanner_dual":    51,
    "halloween_eyes":  65,
    "fire_flicker":    67,
    "gradient":        68,
    "meteor_smooth":   77,
    "colorwaves":      88,
    "bpm":             90,
    "fill_noise":      91,
    "sunrise":         100,
    "twinklefox":      109,
    "twinklefox_party": 110,
    "heartbeat":       112,
    "candle":          116,
    "starburst":       117,
    "pacifica":        126,
    "fireworks1d":     44,
    "off":             0,
}


def _engine_to_fx(engine: str) -> int:
    return _ENGINE_TO_WLED_FX.get((engine or "solid").lower().strip(), 0)


# ================== MODELS ==================

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
    pro_trials: Dict[str, str] = {}
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str
    user: User


class StartPackTrial(BaseModel):
    pack_id: str
    minutes: int = 60


# --- Hub ---

class Hub(BaseModel):
    id: str
    user_id: str
    name: str
    ip_address: str
    mdns_name: Optional[str] = None
    hub_id: Optional[str] = None
    firmware_version: Optional[str] = None
    is_online: bool = False
    created_at: datetime
    hub_secret: Optional[str] = None   # returned only on creation


class HubCreate(BaseModel):
    name: str
    ip_address: Optional[str] = ""    # optional — hub will self-report via checkin
    mdns_name: Optional[str] = None
    hub_id: Optional[str] = None
    firmware_version: Optional[str] = None


class HubCheckin(BaseModel):
    hub_secret: str
    ip_address: str


# --- Device (kinkiet) ---

class Device(BaseModel):
    id: str
    user_id: str
    hub_id: str
    name: str
    ip_address: str
    led_count: int = 30
    location: Optional[str] = None
    created_at: datetime


class DeviceCreate(BaseModel):
    hub_id: Optional[str] = None
    name: str
    ip_address: str
    led_count: int = 30
    location: Optional[str] = None


# --- Group ---

class Group(BaseModel):
    id: str
    user_id: str
    name: str
    device_ids: List[str]
    created_at: datetime


class GroupCreate(BaseModel):
    name: str
    device_ids: List[str]


# --- Preset ---

class Preset(BaseModel):
    id: str
    name: str
    engine: str
    wled_fx: int           # WLED effect ID (mapped from engine)
    bri: int = 255
    color: List[int] = [255, 255, 255]
    sx: int = 128
    ix: int = 128
    pal: int = 0
    palette_size: int = 1
    palette_default: List[List[int]] = [[255, 255, 255]]
    color_locked: bool = False   # True = hub ignores col (algorithmic effect like fire/rainbow)
    is_premium: bool = False
    pack_id: Optional[str] = None
    description: str = ""


# ================== AUTH HELPERS ==================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def user_has_pack_access(current_user: dict, pack_id: str) -> bool:
    if current_user.get("has_subscription", False):
        return True
    trials = current_user.get("pro_trials", {}) or {}
    raw_until = trials.get(pack_id)
    if not raw_until:
        return False
    until = _parse_iso_z(raw_until)
    if not until:
        return False
    return until > utcnow()


def assert_preset_access_or_403(current_user: dict, preset_id: str):
    preset = find_preset(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found")
    if not preset.get("is_premium", False):
        return
    pack_id = preset.get("pack_id")
    if not pack_id:
        raise HTTPException(status_code=500, detail="Preset misconfigured (missing pack_id)")
    if not user_has_pack_access(current_user, pack_id):
        raise HTTPException(status_code=403, detail="This preset pack requires premium or an active trial")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        user = await db.users.find_one({"_id": oid(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        if "pro_trials" not in user:
            user["pro_trials"] = {}
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


# ================== WLED PROBE ==================

async def _wled_online(ip: str) -> bool:
    global http_client
    try:
        r = await http_client.get(f"http://{ip}/json/info")
        return r.status_code == 200
    except Exception:
        return False


# ================== DB HELPERS ==================

async def _load_hub_or_404(hub_id: str, current_user: dict) -> dict:
    hub = await db.hubs.find_one({"_id": oid(hub_id), "user_id": str(current_user["_id"])})
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")
    return hub


async def _load_device_or_404(device_id: str, current_user: dict) -> dict:
    device = await db.devices.find_one({"_id": oid(device_id), "user_id": str(current_user["_id"])})
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


async def _load_group_or_404(group_id: str, current_user: dict) -> dict:
    group = await db.groups.find_one({"_id": oid(group_id), "user_id": str(current_user["_id"])})
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return group


def _hub_to_model(h: dict, include_secret: bool = False) -> Hub:
    return Hub(
        id=str(h["_id"]),
        user_id=h["user_id"],
        name=h["name"],
        ip_address=h.get("ip_address", ""),
        mdns_name=h.get("mdns_name"),
        hub_id=h.get("hub_id"),
        firmware_version=h.get("firmware_version"),
        is_online=h.get("is_online", False),
        created_at=h["created_at"],
        hub_secret=h.get("hub_secret") if include_secret else None,
    )


def _device_to_model(d: dict) -> Device:
    return Device(
        id=str(d["_id"]),
        user_id=d["user_id"],
        hub_id=d.get("hub_id", ""),
        name=d["name"],
        ip_address=d["ip_address"],
        led_count=d.get("led_count", 30),
        location=d.get("location"),
        created_at=d["created_at"],
    )


# ================== ROUTES ==================

@app.get("/")
async def root():
    return {"ok": True, "service": "wled-backend"}


# ---- AUTH ----

@api_router.post("/auth/register", response_model=Token)
async def register(user_data: UserRegister):
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "name": user_data.name,
        "has_subscription": False,
        "pro_trials": {},
        "created_at": utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    access_token = create_access_token({"sub": str(result.inserted_id)})
    user = User(
        id=str(result.inserted_id),
        email=user_doc["email"],
        name=user_doc["name"],
        has_subscription=False,
        pro_trials={},
        created_at=user_doc["created_at"],
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
        pro_trials=user.get("pro_trials", {}),
        created_at=user["created_at"],
    )
    return Token(access_token=access_token, token_type="bearer", user=user_obj)


@api_router.get("/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    return User(
        id=str(current_user["_id"]),
        email=current_user["email"],
        name=current_user["name"],
        has_subscription=current_user.get("has_subscription", False),
        pro_trials=current_user.get("pro_trials", {}),
        created_at=current_user["created_at"],
    )


@api_router.post("/auth/upgrade-subscription")
async def upgrade_subscription(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"has_subscription": True}},
    )
    return {"message": "Subscription activated successfully"}


@api_router.post("/auth/start-pack-trial")
async def start_pack_trial(body: StartPackTrial, current_user: dict = Depends(get_current_user)):
    pack_id = (body.pack_id or "").strip()
    if not pack_id:
        raise HTTPException(status_code=400, detail="pack_id is required")

    pack_presets = [p for p in PRESETS if p.get("pack_id") == pack_id]
    if not pack_presets:
        raise HTTPException(status_code=404, detail="Pack not found")
    if not any(p.get("is_premium") for p in pack_presets):
        raise HTTPException(status_code=400, detail="This pack is not premium")
    if current_user.get("has_subscription", False):
        return {"message": "Subscription active; trial not needed", "pack_id": pack_id}

    now = utcnow()
    trials = current_user.get("pro_trials", {}) or {}
    existing_until = _parse_iso_z(trials.get(pack_id)) if pack_id in trials else None
    if existing_until and existing_until > now:
        return {
            "message": "Trial already active",
            "pack_id": pack_id,
            "trial_until": existing_until.isoformat() + "Z",
        }

    minutes = max(1, min(int(body.minutes or 60), 180))
    trial_until = now + timedelta(minutes=minutes)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {f"pro_trials.{pack_id}": trial_until.isoformat() + "Z"}},
    )
    return {"message": "Trial activated", "pack_id": pack_id, "trial_until": trial_until.isoformat() + "Z"}


# ---- HUBS ----

@api_router.post("/hubs", response_model=Hub)
async def create_hub(hub_data: HubCreate, current_user: dict = Depends(get_current_user)):
    ip = hub_data.ip_address or ""
    user_id = str(current_user["_id"])

    # Upsert by hub_id — same physical hub reconnecting after IP change
    if hub_data.hub_id:
        existing = await db.hubs.find_one({"user_id": user_id, "hub_id": hub_data.hub_id})
        if existing:
            is_online = (await _wled_online(ip)) if ip else False
            await db.hubs.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "name": hub_data.name,
                    "ip_address": ip,
                    "mdns_name": hub_data.mdns_name,
                    "firmware_version": hub_data.firmware_version,
                    "is_online": is_online,
                }},
            )
            updated = await db.hubs.find_one({"_id": existing["_id"]})
            logger.info("Hub upserted: %s (%s) online=%s", hub_data.name, ip, is_online)
            return _hub_to_model(updated)

    is_online = (await _wled_online(ip)) if ip else False
    hub_secret = secrets.token_hex(16)
    hub_doc = {
        "user_id": user_id,
        "name": hub_data.name,
        "ip_address": ip,
        "mdns_name": hub_data.mdns_name,
        "hub_id": hub_data.hub_id,
        "firmware_version": hub_data.firmware_version,
        "is_online": is_online,
        "hub_secret": hub_secret,
        "created_at": utcnow(),
    }
    result = await db.hubs.insert_one(hub_doc)
    hub_doc["_id"] = result.inserted_id
    logger.info("Hub registered: %s (%s) online=%s", hub_data.name, ip, is_online)
    return _hub_to_model(hub_doc, include_secret=True)


@api_router.patch("/hubs/{hub_id}/checkin", response_model=Hub)
async def hub_checkin(hub_id: str, body: HubCheckin):
    """Called by the hub firmware on WiFi connect — no user JWT required."""
    h = await db.hubs.find_one({"_id": oid(hub_id)})
    if not h:
        raise HTTPException(status_code=404, detail="Hub not found")
    if h.get("hub_secret") != body.hub_secret:
        raise HTTPException(status_code=403, detail="Invalid hub_secret")
    await db.hubs.update_one(
        {"_id": h["_id"]},
        {"$set": {"ip_address": body.ip_address, "is_online": True}},
    )
    h["ip_address"] = body.ip_address
    h["is_online"] = True
    logger.info("Hub checkin: %s → %s", hub_id, body.ip_address)
    return _hub_to_model(h)


@api_router.get("/hubs", response_model=List[Hub])
async def get_hubs(current_user: dict = Depends(get_current_user)):
    hubs = await db.hubs.find({"user_id": str(current_user["_id"])}).to_list(100)
    return [_hub_to_model(h) for h in hubs]


@api_router.get("/hubs/{hub_id}", response_model=Hub)
async def get_hub(hub_id: str, current_user: dict = Depends(get_current_user)):
    h = await _load_hub_or_404(hub_id, current_user)
    is_online = await _wled_online(h["ip_address"])
    await db.hubs.update_one({"_id": h["_id"]}, {"$set": {"is_online": is_online}})
    h["is_online"] = is_online
    return _hub_to_model(h)


@api_router.patch("/hubs/{hub_id}", response_model=Hub)
async def update_hub(hub_id: str, hub_data: HubCreate, current_user: dict = Depends(get_current_user)):
    h = await _load_hub_or_404(hub_id, current_user)
    update = {
        "name": hub_data.name,
        "ip_address": hub_data.ip_address,
    }
    if hub_data.mdns_name is not None:
        update["mdns_name"] = hub_data.mdns_name
    await db.hubs.update_one({"_id": h["_id"]}, {"$set": update})
    h.update(update)
    return _hub_to_model(h)


@api_router.delete("/hubs/{hub_id}")
async def delete_hub(hub_id: str, current_user: dict = Depends(get_current_user)):
    await _load_hub_or_404(hub_id, current_user)
    await db.hubs.delete_one({"_id": oid(hub_id), "user_id": str(current_user["_id"])})
    # cascade: remove devices belonging to this hub
    await db.devices.delete_many({"hub_id": hub_id, "user_id": str(current_user["_id"])})
    return {"message": "Hub deleted", "hub_id": hub_id}


# ---- DEVICES ----

@api_router.post("/devices", response_model=Device)
async def create_device(device_data: DeviceCreate, current_user: dict = Depends(get_current_user)):
    # validate hub ownership only if hub_id provided
    if device_data.hub_id:
        await _load_hub_or_404(device_data.hub_id, current_user)

    device_doc = {
        "user_id": str(current_user["_id"]),
        "hub_id": device_data.hub_id or "",
        "name": device_data.name,
        "ip_address": device_data.ip_address,
        "led_count": device_data.led_count,
        "location": device_data.location,
        "created_at": utcnow(),
    }
    result = await db.devices.insert_one(device_doc)
    device_doc["_id"] = result.inserted_id
    return _device_to_model(device_doc)


@api_router.get("/devices", response_model=List[Device])
async def get_devices(
    current_user: dict = Depends(get_current_user),
    hub_id: Optional[str] = None,
):
    query: dict = {"user_id": str(current_user["_id"])}
    if hub_id:
        query["hub_id"] = hub_id
    devices = await db.devices.find(query).to_list(1000)
    return [_device_to_model(d) for d in devices]


@api_router.get("/devices/{device_id}", response_model=Device)
async def get_device(device_id: str, current_user: dict = Depends(get_current_user)):
    d = await _load_device_or_404(device_id, current_user)
    return _device_to_model(d)


@api_router.patch("/devices/{device_id}", response_model=Device)
async def update_device(device_id: str, device_data: DeviceCreate, current_user: dict = Depends(get_current_user)):
    d = await _load_device_or_404(device_id, current_user)
    if device_data.hub_id:
        await _load_hub_or_404(device_data.hub_id, current_user)
    update = {
        "hub_id": device_data.hub_id,
        "name": device_data.name,
        "ip_address": device_data.ip_address,
        "led_count": device_data.led_count,
        "location": device_data.location,
    }
    await db.devices.update_one({"_id": d["_id"]}, {"$set": update})
    d.update(update)
    return _device_to_model(d)


@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, current_user: dict = Depends(get_current_user)):
    await _load_device_or_404(device_id, current_user)
    await db.devices.delete_one({"_id": oid(device_id), "user_id": str(current_user["_id"])})
    # remove from any groups
    await db.groups.update_many(
        {"user_id": str(current_user["_id"])},
        {"$pull": {"device_ids": device_id}},
    )
    return {"message": "Device deleted", "device_id": device_id}


# ---- GROUPS ----

@api_router.post("/groups", response_model=Group)
async def create_group(group_data: GroupCreate, current_user: dict = Depends(get_current_user)):
    for device_id in group_data.device_ids:
        device = await db.devices.find_one({"_id": oid(device_id), "user_id": str(current_user["_id"])})
        if not device:
            raise HTTPException(status_code=400, detail=f"Device {device_id} not found")

    group_doc = {
        "user_id": str(current_user["_id"]),
        "name": group_data.name,
        "device_ids": group_data.device_ids,
        "created_at": utcnow(),
    }
    result = await db.groups.insert_one(group_doc)
    group_doc["_id"] = result.inserted_id
    return Group(
        id=str(result.inserted_id),
        user_id=group_doc["user_id"],
        name=group_doc["name"],
        device_ids=group_doc["device_ids"],
        created_at=group_doc["created_at"],
    )


@api_router.get("/groups", response_model=List[Group])
async def get_groups(current_user: dict = Depends(get_current_user)):
    groups = await db.groups.find({"user_id": str(current_user["_id"])}).to_list(1000)
    return [Group(
        id=str(g["_id"]),
        user_id=g["user_id"],
        name=g["name"],
        device_ids=g.get("device_ids", []),
        created_at=g["created_at"],
    ) for g in groups]


@api_router.delete("/groups/{group_id}")
async def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    await _load_group_or_404(group_id, current_user)
    await db.groups.delete_one({"_id": oid(group_id), "user_id": str(current_user["_id"])})
    return {"message": "Group deleted", "group_id": group_id}


# ---- PRESETS ----

@api_router.get("/presets", response_model=List[Preset])
async def get_presets(current_user: dict = Depends(get_current_user)):
    out = []
    for p in PRESETS:
        out.append(Preset(
            id=p["id"],
            name=p["name"],
            engine=p.get("engine", "solid"),
            wled_fx=_engine_to_fx(p.get("engine", "solid")),
            bri=p.get("bri", 255),
            color=p.get("color", [255, 255, 255]),
            sx=p.get("sx", 128),
            ix=p.get("ix", 128),
            pal=p.get("pal", 0),
            palette_size=p.get("palette_size", 1),
            palette_default=p.get("palette_default", [[255, 255, 255]]),
            color_locked=p.get("color_locked", False),
            is_premium=p.get("is_premium", False),
            pack_id=p.get("pack_id"),
            description=p.get("description", ""),
        ))
    return out


# ---- SCHEDULES ----

class ScheduleAction(BaseModel):
    on: bool = True
    preset_id: Optional[str] = None
    bri: Optional[int] = None
    sx: Optional[int] = None
    ix: Optional[int] = None
    color: Optional[List[int]] = None


class ScheduleCreate(BaseModel):
    name: str
    target_type: str          # "group" | "device"
    target_id: str
    hub_id: str
    days: List[int]           # [0-6], 0=Sunday
    time: str                 # "HH:MM"
    enabled: bool = True
    action: ScheduleAction


class ScheduleOut(BaseModel):
    id: str
    user_id: str
    name: str
    target_type: str
    target_id: str
    hub_id: str
    days: List[int]
    time: str
    enabled: bool
    action: ScheduleAction
    created_at: datetime


def _schedule_to_model(s: dict) -> ScheduleOut:
    return ScheduleOut(
        id=str(s["_id"]),
        user_id=s["user_id"],
        name=s["name"],
        target_type=s["target_type"],
        target_id=s["target_id"],
        hub_id=s.get("hub_id", ""),
        days=s.get("days", []),
        time=s.get("time", "00:00"),
        enabled=s.get("enabled", True),
        action=ScheduleAction(**s.get("action", {"on": True})),
        created_at=s["created_at"],
    )


@api_router.get("/schedules", response_model=List[ScheduleOut])
async def get_schedules(current_user: dict = Depends(get_current_user)):
    docs = await db.schedules.find({"user_id": str(current_user["_id"])}).to_list(1000)
    return [_schedule_to_model(d) for d in docs]


@api_router.post("/schedules", response_model=ScheduleOut)
async def create_schedule(data: ScheduleCreate, current_user: dict = Depends(get_current_user)):
    doc = {
        "user_id": str(current_user["_id"]),
        "name": data.name,
        "target_type": data.target_type,
        "target_id": data.target_id,
        "hub_id": data.hub_id,
        "days": data.days,
        "time": data.time,
        "enabled": data.enabled,
        "action": data.action.model_dump(),
        "created_at": utcnow(),
    }
    result = await db.schedules.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _schedule_to_model(doc)


@api_router.patch("/schedules/{schedule_id}", response_model=ScheduleOut)
async def update_schedule(
    schedule_id: str, data: ScheduleCreate, current_user: dict = Depends(get_current_user)
):
    s = await db.schedules.find_one({"_id": oid(schedule_id), "user_id": str(current_user["_id"])})
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    update = {
        "name": data.name,
        "target_type": data.target_type,
        "target_id": data.target_id,
        "hub_id": data.hub_id,
        "days": data.days,
        "time": data.time,
        "enabled": data.enabled,
        "action": data.action.model_dump(),
    }
    await db.schedules.update_one({"_id": s["_id"]}, {"$set": update})
    s.update(update)
    return _schedule_to_model(s)


@api_router.patch("/schedules/{schedule_id}/toggle")
async def toggle_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    s = await db.schedules.find_one({"_id": oid(schedule_id), "user_id": str(current_user["_id"])})
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    new_enabled = not s.get("enabled", True)
    await db.schedules.update_one({"_id": s["_id"]}, {"$set": {"enabled": new_enabled}})
    return {"id": schedule_id, "enabled": new_enabled}


@api_router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str, current_user: dict = Depends(get_current_user)):
    s = await db.schedules.find_one({"_id": oid(schedule_id), "user_id": str(current_user["_id"])})
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.schedules.delete_one({"_id": s["_id"]})
    return {"message": "Schedule deleted", "schedule_id": schedule_id}


# ---- SCHEDULES DUE (hub polls, no JWT — hub_secret auth) ----

@app.get("/api/schedules/due")
async def schedules_due(hub_secret: str, time: str, day: int):
    hub = await db.hubs.find_one({"hub_secret": hub_secret})
    if not hub:
        raise HTTPException(status_code=404, detail="Hub not found")

    hub_id_str = str(hub["_id"])
    docs = await db.schedules.find({
        "hub_id":  hub_id_str,
        "enabled": True,
        "time":    time,
        "days":    {"$in": [day]},
    }).to_list(100)

    result = []
    for s in docs:
        action = s.get("action", {})
        state: dict = {"on": action.get("on", True)}

        preset_id = action.get("preset_id")
        if preset_id:
            p = find_preset(preset_id)
            if p:
                state["fx"]  = _engine_to_fx(p.get("engine", "solid"))
                state["bri"] = action.get("bri") or p.get("bri", 220)
                state["sx"]  = action.get("sx")  or p.get("sx", 128)
                state["ix"]  = action.get("ix")  or p.get("ix", 128)
                if not p.get("color_locked", False):
                    col = action.get("color") or p.get("color", [255, 255, 255])
                    state["col"] = [col, [0, 0, 0], [0, 0, 0]]
        else:
            if action.get("bri") is not None:
                state["bri"] = action["bri"]

        result.append({
            "target_type": s.get("target_type", "group"),
            "target_id":   s.get("target_id", ""),
            "state":       state,
        })

    return result


# ================== MIDDLEWARE + ROUTER ==================

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ================== LIFECYCLE ==================

@app.on_event("startup")
async def startup():
    global http_client
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT, limits=HTTP_LIMITS)
    logger.info("WLED backend ready (hub-proxy mode)")


@app.on_event("shutdown")
async def shutdown():
    global http_client
    if http_client:
        await http_client.aclose()
