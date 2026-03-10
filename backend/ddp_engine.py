# ddp_engine.py
import asyncio
import socket
import time
import math
import random
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple, Set

DDP_PORT = 4048
DDP_MAX_PAYLOAD = 1440  # bytes (keep under MTU)

GLOBAL_SAMPLES = 240        # increase for smoother resampling
GLOBAL_FPS_LOCK = True      # deterministic frame step (less jitter)

# Auto-stop tuning (static presets)
STATIC_GRACE_SEC = 0.90     # keep sending briefly after last change (slider-friendly)
STATIC_IDLE_SLEEP = 0.08    # loop sleep while static during grace

# --- LIVE PREVIEW tuning ---
# This is a downsample of the *actual outgoing DDP payload* per device.
# Server will split this into left/top/right segments (e.g. 25/10/25).
PREVIEW_SAMPLES = 120
PREVIEW_LOCK_STEP_MS = 0  # keep 0; we already run in the stream loop

# --- "Vivid" tuning knobs ---
FIRE_GAIN = 1.18
FIRE_SAT = 1.35
FIRE_TINT = 0.05            # 0..0.2 (lower = more palette, higher = more user color)

FIREWORKS_GAIN = 1.30
FIREWORKS_TINT = 0.06


@dataclass
class Target:
    ip: str
    led_count: int
    reverse: bool = False
    start_offset: int = 0


@dataclass
class Particle:
    x: float
    vx: float
    life: float
    hue: float
    intensity: float


def _ddp_packet_rgb(payload: bytes, data_offset_bytes: int = 0, push: bool = True) -> bytes:
    """
    DDP header (10B)
      flags/version: 0x40 (v1) + PUSH flag 0x01 => 0x41 when push
      type: 0x01 RGB
      id: 0x00
      reserved: 0x00
      offset: 4 bytes (BYTES)
      length: 2 bytes (BYTES)
    """
    flags = 0x40 | (0x01 if push else 0x00)
    ddp_type = 0x01  # RGB
    ddp_id = 0x00
    length = len(payload)
    header = (
        bytes([flags, ddp_type, ddp_id, 0x00])
        + int(max(0, data_offset_bytes)).to_bytes(4, "big")
        + int(max(0, length)).to_bytes(2, "big")
    )
    return header + payload


def _send_ddp(sock: socket.socket, ip: str, rgb_bytes: bytes) -> None:
    """
    ✅ Segmented DDP send:
      - payload split into chunks <= DDP_MAX_PAYLOAD
      - offset in BYTES
      - PUSH flag only on the LAST segment for this frame/device
    """
    if not rgb_bytes:
        return

    # ensure multiple-of-3 bytes
    if len(rgb_bytes) % 3 != 0:
        rgb_bytes = rgb_bytes[: (len(rgb_bytes) // 3) * 3]
        if not rgb_bytes:
            return

    if len(rgb_bytes) <= DDP_MAX_PAYLOAD:
        try:
            sock.sendto(_ddp_packet_rgb(rgb_bytes, 0, True), (ip, DDP_PORT))
        except Exception:
            pass
        return

    # chunk_size must be multiple of 3
    chunk_size = (DDP_MAX_PAYLOAD // 3) * 3
    total = len(rgb_bytes)
    offset = 0
    seg_index = 0

    seg_count = (total + chunk_size - 1) // chunk_size

    while offset < total:
        chunk = rgb_bytes[offset: offset + chunk_size]
        is_last = (seg_index == seg_count - 1)
        try:
            sock.sendto(_ddp_packet_rgb(chunk, offset, is_last), (ip, DDP_PORT))
        except Exception:
            pass
        offset += len(chunk)
        seg_index += 1


def _clamp255(x: int) -> int:
    return max(0, min(255, int(x)))


def _speed_norm(sx: int) -> float:
    sx = _clamp255(sx)
    return 0.05 + (sx / 255.0) * 2.95


def _intensity_norm(ix: int) -> float:
    ix = _clamp255(ix)
    return 0.05 + (ix / 255.0) * 0.95


def _scale(rgb: Tuple[int, int, int], bri: int) -> Tuple[int, int, int]:
    k = max(0.0, min(1.0, bri / 255.0))
    r, g, b = rgb
    return int(r * k), int(g * k), int(b * k)


def _hsv_to_rgb(h: float, s: float, v: float) -> Tuple[int, int, int]:
    i = int(h * 6.0) % 6
    f = (h * 6.0) - i
    p = v * (1.0 - s)
    q = v * (1.0 - f * s)
    t = v * (1.0 - (1.0 - f) * s)

    if i == 0:
        r, g, b = v, t, p
    elif i == 1:
        r, g, b = q, v, p
    elif i == 2:
        r, g, b = p, v, t
    elif i == 3:
        r, g, b = p, q, v
    elif i == 4:
        r, g, b = t, p, v
    else:
        r, g, b = v, p, q

    return int(r * 255), int(g * 255), int(b * 255)


# =========================
# NEW helpers for new presets
# =========================

def _u32(x: int) -> int:
    return x & 0xFFFFFFFF


def _hash_u32(x: int) -> int:
    # fast deterministic 32-bit mix
    x = _u32(x)
    x ^= (x >> 16)
    x = _u32(x * 0x7FEB352D)
    x ^= (x >> 15)
    x = _u32(x * 0x846CA68B)
    x ^= (x >> 16)
    return _u32(x)


def _rand01(seed: int) -> float:
    return (_hash_u32(seed) / 0xFFFFFFFF)


def _smoothstep(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3.0 - 2.0 * x)


def _remap_pixels(rgb: bytes, led_count: int, reverse: bool, start_offset: int) -> bytes:
    if led_count <= 1:
        return rgb

    n = led_count
    start_offset = int(start_offset or 0) % n

    px = [rgb[i:i+3] for i in range(0, min(len(rgb), n*3), 3)]
    if len(px) < n:
        px += [b"\x00\x00\x00"] * (n - len(px))

    if reverse:
        px.reverse()

    if start_offset:
        px = px[start_offset:] + px[:start_offset]

    return b"".join(px)


def _lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def _sample_rgb_field(field: List[float], samples: int, x: float) -> Tuple[int, int, int]:
    x = max(0.0, min(1.0, x))
    idx_f = x * (samples - 1)
    i0 = int(idx_f)
    i1 = min(samples - 1, i0 + 1)
    t = idx_f - i0

    base0 = i0 * 3
    base1 = i1 * 3
    r = _lerp(field[base0 + 0], field[base1 + 0], t)
    g = _lerp(field[base0 + 1], field[base1 + 1], t)
    b = _lerp(field[base0 + 2], field[base1 + 2], t)
    return int(r), int(g), int(b)


def _engine_auto_fps(engine: str) -> int:
    e = (engine or "solid").lower().strip()

    # static but KEEP realtime alive
    if e in ("solid", "off"):
        return 2   # ✅ instead of 0

    if e in ("blink",):
        return 20
    if e in ("rainbow", "calibrate"):
        return 25
    if e in ("fire_sync", "fire_random", "fireworks_sync", "fireworks_random"):
        return 30

    # ✅ NEW engines (premium presets)
    if e in ("breathe",):
        return 25
    if e in ("meteor", "twinkle", "colorwipe"):
        return 30

    return 25


def _downsample_rgb_bytes(rgb: bytes, samples: int) -> List[Tuple[int, int, int]]:
    """
    Take a big RGB byte payload (n_leds*3) and downsample to `samples` RGB tuples.
    This is used for "live preview" stream to the app.
    """
    if samples <= 0:
        return []
    if not rgb or len(rgb) < 3:
        return [(0, 0, 0)] * samples

    n = len(rgb) // 3
    if n <= 0:
        return [(0, 0, 0)] * samples

    out: List[Tuple[int, int, int]] = []
    for i in range(samples):
        if samples == 1:
            idx = 0
        else:
            idx = int((i / (samples - 1)) * (n - 1))
        base = idx * 3
        out.append((rgb[base], rgb[base + 1], rgb[base + 2]))
    return out


# =========================
# ✅ Palette helpers
# =========================

def _clamp_palette(pal: Optional[List[Tuple[int, int, int]]], max_len: int = 8) -> Optional[List[Tuple[int, int, int]]]:
    if not pal:
        return None
    out: List[Tuple[int, int, int]] = []
    for c in pal:
        if not c or len(c) != 3:
            continue
        out.append((_clamp255(c[0]), _clamp255(c[1]), _clamp255(c[2])))
        if len(out) >= max_len:
            break
    return out if out else None


def _palette_sample(palette: List[Tuple[int, int, int]], x: float) -> Tuple[int, int, int]:
    """
    Sample a palette along 0..1 with linear interpolation across stops.
    If palette has 1 color -> returns it.
    """
    if not palette:
        return (255, 255, 255)
    if len(palette) == 1:
        return palette[0]

    x = max(0.0, min(1.0, x))
    n = len(palette)
    pos = x * (n - 1)
    i0 = int(pos)
    i1 = min(n - 1, i0 + 1)
    t = pos - i0
    r0, g0, b0 = palette[i0]
    r1, g1, b1 = palette[i1]
    r = int(_lerp(r0, r1, t))
    g = int(_lerp(g0, g1, t))
    b = int(_lerp(b0, b1, t))
    return (_clamp255(r), _clamp255(g), _clamp255(b))


def _palette_pick(palette: List[Tuple[int, int, int]], seed: int) -> Tuple[int, int, int]:
    if not palette:
        return (255, 255, 255)
    if len(palette) == 1:
        return palette[0]
    idx = int(_rand01(seed) * len(palette)) % len(palette)
    return palette[idx]


class DDPGroupStream:
    """
    One stream per group_id (but we also reuse this for device streams too: id can be device_id).
    Supports:
      - fire_sync / fireworks_sync -> global shared 1:1 field resampled to each device
      - fire_random / fireworks_random -> each device has its own independent simulation

    ✅ Added for detach logic:
      - set_targets() -> update targets WITHOUT restarting stream
      - internal target lock to avoid race when targets change while sending

    ✅ Added for LIVE PREVIEW:
      - stores last outgoing payload downsample per target IP (preview raw strip samples)
      - server will split into left/top/right and feed UI as continuous gradients

    ✅ Added for WS fanout (push):
      - register_preview_queue(ip, q) / unregister_preview_queue(ip, q)
      - whenever we store preview_raw_by_ip, we also broadcast to queues for that ip

    ✅ Added for PALETTES:
      - self.palette: list[(r,g,b)]
      - palette used by breathe/colorwipe/meteor/twinkle and (optionally) fire/fireworks
    """
    def __init__(self, group_id: str, targets: List[Target], fps: int = 30):
        self.group_id = group_id
        self.targets: List[Target] = targets

        # caller fps is treated as a CAP, not always forced
        self.fps_cap = max(10, min(int(fps), 60))

        self.on: bool = True
        self.bri: int = 255
        self.color: Tuple[int, int, int] = (255, 255, 255)

        # ✅ palette (defaults to base color)
        self.palette: List[Tuple[int, int, int]] = [self.color]
        self.palette_slot: int = 0

        self.engine: str = "solid"
        self.sx: int = 128
        self.ix: int = 128
        self.pal: int = 0

        # ✅ track last preset to enable palette state preservation in server
        self.last_preset_id: Optional[str] = None

        # ✅ per-stream RNG — global random.seed() is shared state, causes cross-stream interference
        self._rng = random.Random()

        self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()

        # ✅ lock for target updates
        self._targets_lock = asyncio.Lock()

        # deterministic base seed per group
        self._seed_base = (hash(group_id) & 0xFFFFFFFF) ^ 0xA5A5_1234

        # global shared states (SYNC)
        self._g_fire_heat: List[float] = [0.0] * GLOBAL_SAMPLES
        self._g_fireworks: List[Particle] = []

        # per-device states (RANDOM)
        self._d_fire_heat: Dict[str, List[float]] = {}          # ip -> heat[]
        self._d_fireworks: Dict[str, List[Particle]] = {}       # ip -> particles[]

        # auto-stop tracking
        self._last_state_sig: Optional[str] = None
        self._last_change_ts: float = time.perf_counter()

        # ✅ LIVE PREVIEW store: ip -> list[(r,g,b)] of PREVIEW_SAMPLES over the strip
        self._preview_raw_by_ip: Dict[str, List[Tuple[int, int, int]]] = {}
        self._preview_lock = asyncio.Lock()

        # ✅ preview subscribers: ip -> set[asyncio.Queue]
        self._preview_subs: Dict[str, Set[asyncio.Queue]] = {}
        self._preview_subs_lock = asyncio.Lock()

    # ---------- lifecycle ----------
    def is_running(self) -> bool:
        return bool(self._task and not self._task.done())

    def start(self):
        if self.is_running():
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run())

    def stop(self):
        self._stop.set()
        if self._task and not self._task.done():
            self._task.cancel()

    def _touch_change(self):
        self._last_change_ts = time.perf_counter()

    def _state_signature(self) -> str:
        # include palette to make change detection consistent
        pal_sig = ""
        try:
            pal_sig = ";".join(f"{r},{g},{b}" for (r, g, b) in (self.palette or []))
        except Exception:
            pal_sig = ""
        return (
            f"on={int(self.on)}|bri={self.bri}|"
            f"col={self.color[0]},{self.color[1]},{self.color[2]}|"
            f"palette_slot={self.palette_slot}|palette={pal_sig}|"
            f"eng={self.engine}|sx={self.sx}|ix={self.ix}|pal={self.pal}"
        )

    def set_fps_cap(self, fps: int):
        self.fps_cap = max(10, min(int(fps), 60))

    async def set_targets(self, targets: List[Target]):
        """
        ✅ Update targets WITHOUT restarting stream.
        Also cleans per-device random simulation state for removed IPs.
        """
        async with self._targets_lock:
            self.targets = targets or []

            alive_ips = {t.ip for t in self.targets if t and t.ip}

            # purge per-device states not in current target list
            for ip in list(self._d_fire_heat.keys()):
                if ip not in alive_ips:
                    self._d_fire_heat.pop(ip, None)
            for ip in list(self._d_fireworks.keys()):
                if ip not in alive_ips:
                    self._d_fireworks.pop(ip, None)

            # purge preview cache for removed IPs
            async with self._preview_lock:
                for ip in list(self._preview_raw_by_ip.keys()):
                    if ip not in alive_ips:
                        self._preview_raw_by_ip.pop(ip, None)

            # purge subscriber sets for removed IPs
            async with self._preview_subs_lock:
                for ip in list(self._preview_subs.keys()):
                    if ip not in alive_ips:
                        self._preview_subs.pop(ip, None)

        # if stream is stopped (auto-stop), revive on target change
        if not self.is_running() and self.targets:
            self.start()

    async def get_preview_raw(self, ip: str) -> Optional[List[Tuple[int, int, int]]]:
        """
        ✅ Return last preview samples for a given target IP.
        List length is PREVIEW_SAMPLES.
        """
        async with self._preview_lock:
            return self._preview_raw_by_ip.get(ip)

    async def register_preview_queue(self, ip: str, q: asyncio.Queue) -> None:
        async with self._preview_subs_lock:
            s = self._preview_subs.get(ip)
            if s is None:
                s = set()
                self._preview_subs[ip] = s
            s.add(q)

        # immediately push last known frame if exists
        try:
            raw = await self.get_preview_raw(ip)
            if raw is not None:
                try:
                    q.put_nowait(raw)
                except Exception:
                    pass
        except Exception:
            pass

    async def unregister_preview_queue(self, ip: str, q: asyncio.Queue) -> None:
        async with self._preview_subs_lock:
            s = self._preview_subs.get(ip)
            if not s:
                return
            s.discard(q)
            if not s:
                self._preview_subs.pop(ip, None)

    async def _broadcast_preview(self, ip: str, raw: List[Tuple[int, int, int]]) -> None:
        async with self._preview_subs_lock:
            subs = list(self._preview_subs.get(ip, set()))

        if not subs:
            return

        for q in subs:
            try:
                q.put_nowait(raw)
            except Exception:
                pass

    def _effective_fps(self) -> int:
        auto = _engine_auto_fps(self.engine)
        if auto <= 0:
            return 0
        return min(auto, self.fps_cap)

    def update_state(
        self,
        *,
        on: Optional[bool] = None,
        bri: Optional[int] = None,
        color: Optional[Tuple[int, int, int]] = None,
        engine: Optional[str] = None,
        sx: Optional[int] = None,
        ix: Optional[int] = None,
        pal: Optional[int] = None,
        # ✅ NEW
        palette: Optional[List[Tuple[int, int, int]]] = None,
        palette_slot: Optional[int] = None,
    ):
        changed = False

        if on is not None:
            v = bool(on)
            if v != self.on:
                self.on = v
                changed = True

        if bri is not None:
            v = _clamp255(bri)
            if v != self.bri:
                self.bri = v
                changed = True

        if color is not None:
            v = (_clamp255(color[0]), _clamp255(color[1]), _clamp255(color[2]))
            if v != self.color:
                self.color = v
                changed = True
            # if palette is 1-color (or empty), keep it in sync with base color
            if (not self.palette) or (len(self.palette) == 1):
                self.palette = [self.color]

        if palette is not None:
            pal2 = _clamp_palette(palette, max_len=8)
            if pal2:
                if pal2 != self.palette:
                    self.palette = pal2
                    changed = True
            else:
                # if invalid palette passed -> ignore
                pass

        if palette_slot is not None:
            try:
                v = int(palette_slot)
            except Exception:
                v = 0
            v = max(0, v)
            if self.palette:
                v = min(v, max(0, len(self.palette) - 1))
            if v != self.palette_slot:
                self.palette_slot = v
                changed = True

        if engine is not None:
            v = str(engine).strip() or "solid"
            if v != self.engine:
                self.engine = v
                changed = True

        if sx is not None:
            v = _clamp255(sx)
            if v != self.sx:
                self.sx = v
                changed = True

        if ix is not None:
            v = _clamp255(ix)
            if v != self.ix:
                self.ix = v
                changed = True

        if pal is not None:
            v = int(pal)
            if v != self.pal:
                self.pal = v
                changed = True

        if changed:
            self._touch_change()

        # revive if auto-stopped
        if not self.is_running() and (self.targets or []):
            self.start()

    # ---------- basic renderers ----------
    def _render_solid(self, n: int) -> bytes:
        rgb = _scale(self.color, self.bri)
        return bytes(rgb) * n

    def _render_blink(self, n: int, t: float) -> bytes:
        freq = 0.5 + _speed_norm(self.sx)
        on_phase = 1 if int(t * freq) % 2 == 0 else 0
        rgb = self.color if on_phase == 1 else (0, 0, 0)
        rgb = _scale(rgb, self.bri)
        return bytes(rgb) * n

    def _render_rainbow(self, n: int, t: float) -> bytes:
        frame = bytearray(n * 3)
        speed = 0.03 + (_speed_norm(self.sx) * 0.10)
        for i in range(n):
            h = (i / max(1, n) + t * speed) % 1.0
            rgb = _scale(_hsv_to_rgb(h, 1.0, 1.0), self.bri)
            frame[i*3:i*3+3] = bytes(rgb)
        return bytes(frame)

    def _render_calibrate(self, n: int, t: float) -> bytes:
        frame = bytearray(n * 3)
        speed = 0.6 + _speed_norm(self.sx) * 1.6
        p = (math.sin(t * speed) * 0.5 + 0.5)
        pos = int(p * max(1, n - 1))
        rgb = _scale(self.color, self.bri)
        frame[pos*3:pos*3+3] = bytes(rgb)
        return bytes(frame)

    # =========================
    # NEW premium renderers (palette-aware)
    # =========================
    def _render_breathe(self, n: int, t: float) -> bytes:
        # soft breathing brightness, color = palette[0] (fallback self.color)
        spd = 0.35 + _speed_norm(self.sx) * 0.45
        p = (math.sin(t * spd * math.tau) * 0.5 + 0.5)
        floor = 0.08 + _intensity_norm(self.ix) * 0.18
        k = floor + (1.0 - floor) * (p ** 1.6)
        bri = int(_clamp255(int(self.bri * k)))

        base = (self.palette[0] if self.palette else self.color)
        rgb = _scale(base, bri)
        return bytes(rgb) * n

    def _render_colorwipe(self, n: int, t: float) -> bytes:
        spd = 0.18 + _speed_norm(self.sx) * 0.55
        head = (t * spd) % 1.0
        width = 0.06 + _intensity_norm(self.ix) * 0.22
        edge = 0.03 + _intensity_norm(self.ix) * 0.12

        frame = bytearray(n * 3)
        pal = self.palette or [self.color]

        for i in range(n):
            x = 0.0 if n == 1 else (i / (n - 1))
            d = abs(x - head)
            d = min(d, 1.0 - d)

            if d <= width:
                a = 1.0
            elif d <= (width + edge):
                a = 1.0 - _smoothstep((d - width) / max(1e-6, edge))
            else:
                a = 0.0

            a = a ** 1.15
            bri = int(_clamp255(int(self.bri * a)))

            # ✅ palette: color follows head (moving), with slight x modulation for richness
            c = _palette_sample(pal, (head + x * 0.15) % 1.0)

            rgb = _scale(c, bri)
            frame[i*3:i*3+3] = bytes(rgb)

        return bytes(frame)

    def _render_meteor(self, n: int, t: float) -> bytes:
        spd = 0.25 + _speed_norm(self.sx) * 0.75
        head = (t * spd) % 1.0

        tail = 0.10 + _intensity_norm(self.ix) * 0.45
        glow = 0.03 + _intensity_norm(self.ix) * 0.10

        frame = bytearray(n * 3)
        pal = self.palette or [self.color]

        # ✅ meteor head color from palette
        head_color = _palette_sample(pal, head)

        for i in range(n):
            x = 0.0 if n == 1 else (i / (n - 1))
            d = abs(x - head)
            d = min(d, 1.0 - d)

            if d <= glow:
                a = 1.0
            elif d <= tail:
                a = 1.0 - (d - glow) / max(1e-6, (tail - glow))
                a = a ** 2.2
            else:
                a = 0.0

            bri = int(_clamp255(int(self.bri * a)))
            rgb = _scale(head_color, bri)
            frame[i*3:i*3+3] = bytes(rgb)

        return bytes(frame)

    def _render_twinkle(self, n: int, t: float, frame_index: int) -> bytes:
        density = 0.03 + _intensity_norm(self.ix) * 0.22
        spd = 0.35 + _speed_norm(self.sx) * 0.80

        frame = bytearray(n * 3)
        pal = self.palette or [self.color]
        bg_color = pal[0] if pal else self.color

        for i in range(n):
            seed = self._seed_base ^ (i * 2654435761) ^ (frame_index * 97531)
            r = _rand01(seed)

            if r < density:
                ph = _rand01(seed ^ 0xA5A5A5A5)
                p = (math.sin((t * spd + ph) * math.tau) * 0.5 + 0.5)
                a = (0.35 + 0.65 * (p ** 2.4))

                # ✅ pick sparkle color from palette deterministically per pixel/time
                sparkle = _palette_pick(pal, seed ^ 0x13579BDF)

                # slight "white lift" like before
                w = 0.55 + 0.35 * _rand01(seed ^ 0x12345678)
                rr = int(sparkle[0] * (1 - w) + 255 * w)
                gg = int(sparkle[1] * (1 - w) + 255 * w)
                bb = int(sparkle[2] * (1 - w) + 255 * w)

                bri = int(_clamp255(int(self.bri * a)))
                rgb = _scale((rr, gg, bb), bri)
                frame[i*3:i*3+3] = bytes(rgb)
            else:
                bg = 0.02 + _intensity_norm(self.ix) * 0.05
                bri = int(_clamp255(int(self.bri * bg)))
                rgb = _scale(bg_color, bri)
                frame[i*3:i*3+3] = bytes(rgb)

        return bytes(frame)

    # ---------- FIRE palette + vivid boost ----------
    def _fire_palette_classic(self, h: float) -> Tuple[int, int, int]:
        h = max(0.0, min(1.0, h))
        if h < 0.25:
            k = h / 0.25
            return (int(80 * k), 0, 0)
        if h < 0.55:
            k = (h - 0.25) / 0.30
            return (int(80 + 175 * k), int(40 * k), 0)
        if h < 0.85:
            k = (h - 0.55) / 0.30
            return (255, int(40 + 200 * k), 0)
        k = (h - 0.85) / 0.15
        return (255, 240 + int(15 * k), int(255 * k))

    def _fire_vivid(self, r: float, g: float, b: float) -> Tuple[float, float, float]:
        r = min(255.0, r * FIRE_GAIN)
        g = min(255.0, g * FIRE_GAIN)
        b = min(255.0, b * FIRE_GAIN)

        mx = max(r, g, b)
        r = min(255.0, mx + (r - mx) * FIRE_SAT)
        g = min(255.0, mx + (g - mx) * FIRE_SAT)
        b = min(255.0, mx + (b - mx) * FIRE_SAT)
        return r, g, b

    # ---------- FIRE update (shared or per-device) ----------
    def _update_fire_heat(self, heat: List[float], dt: float, seed: int) -> None:
        self._rng.seed(seed & 0xFFFFFFFF)

        cool = 1.2 + (1.0 - _intensity_norm(self.ix)) * 3.0
        spark = 0.02 + _intensity_norm(self.ix) * 0.12
        spd = 0.7 + _speed_norm(self.sx) * 1.8

        for i in range(len(heat)):
            heat[i] = max(0.0, heat[i] - dt * cool * spd * (0.6 + 0.8 * self._rng.random()))

        for i in range(len(heat) - 1, 2, -1):
            heat[i] = (heat[i] + heat[i - 1] + heat[i - 2]) / 3.0

        if self._rng.random() < spark * spd:
            y = self._rng.randint(0, min(12, len(heat) - 1))
            heat[y] = min(1.0, heat[y] + self._rng.random() * 0.9 + 0.2)

    def _render_fire_field(self, heat: List[float], samples: int) -> List[float]:
        field = [0.0] * (samples * 3)
        tint = FIRE_TINT

        use_palette = bool(self.palette and len(self.palette) > 1)
        pal = self.palette or [self.color]

        for i in range(samples):
            h = heat[i]
            h2 = math.pow(h, 0.7)

            if use_palette:
                # ✅ palette-based fire: sample palette by heat, multiply by heat for black floor
                pr, pg, pb = _palette_sample(pal, h2)
                r, g, b = (pr * h2, pg * h2, pb * h2)
            else:
                r, g, b = self._fire_palette_classic(h2)

            r, g, b = self._fire_vivid(float(r), float(g), float(b))

            # tint with user base color slightly (keeps "user color" influence like before)
            r = r * (1 - tint) + self.color[0] * tint
            g = g * (1 - tint) + self.color[1] * tint
            b = b * (1 - tint) + self.color[2] * tint

            base = i * 3
            field[base + 0] = r
            field[base + 1] = g
            field[base + 2] = b

        return field

    # ---------- FIREWORKS update/render ----------
    def _update_fireworks(self, particles: List[Particle], dt: float, seed: int) -> List[Particle]:
        self._rng.seed(seed & 0xFFFFFFFF)

        spawn = 0.4 + _intensity_norm(self.ix) * 2.2
        spd = 0.6 + _speed_norm(self.sx) * 1.6

        if self._rng.random() < spawn * dt:
            center = self._rng.uniform(0.15, 0.85)
            base_hue = self._rng.random()
            count = 18 + int(_intensity_norm(self.ix) * 40)

            for _ in range(count):
                ang = self._rng.uniform(0, math.tau)
                vel = self._rng.uniform(0.35, 1.10) * spd
                vx = math.cos(ang) * vel
                particles.append(Particle(
                    x=center,
                    vx=vx,
                    life=self._rng.uniform(0.6, 1.2),
                    hue=(base_hue + self._rng.uniform(-0.08, 0.08)) % 1.0,
                    intensity=self._rng.uniform(0.6, 1.0),
                ))

        gravity = -1.6 * dt
        decay = 1.4 + _speed_norm(self.sx) * 1.2

        alive: List[Particle] = []
        for p in particles:
            p.life -= dt * decay
            if p.life <= 0:
                continue
            p.vx += gravity * (0.2 + 0.8 * self._rng.random())
            p.x += p.vx * dt
            if p.x < 0.0 or p.x > 1.0:
                continue
            alive.append(p)

        return alive

    def _render_fireworks_field(self, particles: List[Particle], samples: int) -> List[float]:
        field = [0.0] * (samples * 3)
        tint = FIREWORKS_TINT

        use_palette = bool(self.palette and len(self.palette) > 1)
        pal = self.palette or [self.color]

        for p in particles:
            if use_palette:
                rgb0 = _palette_sample(pal, p.hue)
            else:
                rgb0 = _hsv_to_rgb(p.hue, 1.0, 1.0)

            rgb = (
                int(rgb0[0] * (1 - tint) + self.color[0] * tint),
                int(rgb0[1] * (1 - tint) + self.color[1] * tint),
                int(rgb0[2] * (1 - tint) + self.color[2] * tint),
            )
            rgb = (
                min(255, int(rgb[0] * FIREWORKS_GAIN)),
                min(255, int(rgb[1] * FIREWORKS_GAIN)),
                min(255, int(rgb[2] * FIREWORKS_GAIN)),
            )

            k = max(0.0, min(1.0, p.life)) * p.intensity
            r = rgb[0] * k
            g = rgb[1] * k
            b = rgb[2] * k

            idx_f = p.x * (samples - 1)
            i0 = int(idx_f)
            i1 = min(samples - 1, i0 + 1)
            tt = idx_f - i0

            for ii, w in ((i0, 1.0 - tt), (i1, tt)):
                base = ii * 3
                field[base + 0] += r * w
                field[base + 1] += g * w
                field[base + 2] += b * w

        for i in range(samples):
            base = i * 3
            field[base + 0] = min(255.0, field[base + 0])
            field[base + 1] = min(255.0, field[base + 1])
            field[base + 2] = min(255.0, field[base + 2])

        return field

    # ---------- resample field -> device ----------
    def _resample_field_to_device(self, field: List[float], samples: int, n_leds: int) -> bytes:
        out = bytearray(n_leds * 3)
        if n_leds <= 0:
            return b""
        for i in range(n_leds):
            x = 0.0 if n_leds == 1 else (i / (n_leds - 1))
            r, g, b = _sample_rgb_field(field, samples, x)
            r, g, b = _scale((r, g, b), self.bri)
            out[i*3:i*3+3] = bytes((_clamp255(r), _clamp255(g), _clamp255(b)))
        return bytes(out)

    async def _store_and_broadcast_preview(self, ip: str, payload: bytes) -> None:
        """
        Downsample outgoing payload and:
          - store in cache
          - push to preview subscriber queues
        """
        try:
            raw = _downsample_rgb_bytes(payload, PREVIEW_SAMPLES)
        except Exception:
            return

        try:
            async with self._preview_lock:
                self._preview_raw_by_ip[ip] = raw
        except Exception:
            pass

        try:
            await self._broadcast_preview(ip, raw)
        except Exception:
            pass

    # ---------- main loop ----------
    async def _run(self):
        t0 = time.perf_counter()
        frame_index = 0

        while not self._stop.is_set():
            tick = time.perf_counter()

            sig = self._state_signature()
            if sig != self._last_state_sig:
                self._last_state_sig = sig
                self._touch_change()

            eng = (self.engine or "solid").lower().strip()
            eff_fps = self._effective_fps()

            async with self._targets_lock:
                targets_snapshot = list(self.targets)

            if not targets_snapshot:
                self._stop.set()
                break

            # blackout logic
            if (not self.on) or (self.bri == 0):
                payload_black = b"\x00\x00\x00"
                for trg in targets_snapshot:
                    n = int(trg.led_count or 0)
                    if n <= 0:
                        continue
                    payload = payload_black * n
                    payload = _remap_pixels(payload, n, trg.reverse, trg.start_offset)

                    _send_ddp(self._sock, trg.ip, payload)
                    await self._store_and_broadcast_preview(trg.ip, payload)

                if (time.perf_counter() - self._last_change_ts) >= STATIC_GRACE_SEC:
                    self._stop.set()
                    break

                await asyncio.sleep(STATIC_IDLE_SLEEP)
                continue

            frame_time = 1.0 / float(max(1, eff_fps))

            if GLOBAL_FPS_LOCK:
                t = frame_index * frame_time
                dt = frame_time
            else:
                t = tick - t0
                dt = frame_time

            # SYNC modes -> compute one shared field per frame
            sync_field: Optional[List[float]] = None
            sync_samples = GLOBAL_SAMPLES

            if self.on and self.bri > 0:
                if eng == "fire_sync":
                    seed = (self._seed_base ^ (frame_index * 2654435761)) & 0xFFFFFFFF
                    self._update_fire_heat(self._g_fire_heat, dt, seed)
                    sync_field = self._render_fire_field(self._g_fire_heat, sync_samples)

                elif eng == "fireworks_sync":
                    seed = (self._seed_base ^ 0x55AA_7777 ^ (frame_index * 97531)) & 0xFFFFFFFF
                    self._g_fireworks = self._update_fireworks(self._g_fireworks, dt, seed)
                    sync_field = self._render_fireworks_field(self._g_fireworks, sync_samples)

            for trg in targets_snapshot:
                try:
                    n = int(trg.led_count or 0)
                    if n <= 0:
                        continue

                    if eng == "solid":
                        payload = self._render_solid(n)
                    elif eng == "blink":
                        payload = self._render_blink(n, t)
                    elif eng == "rainbow":
                        payload = self._render_rainbow(n, t)
                    elif eng == "calibrate":
                        payload = self._render_calibrate(n, t)

                    # ✅ premium
                    elif eng == "breathe":
                        payload = self._render_breathe(n, t)
                    elif eng == "colorwipe":
                        payload = self._render_colorwipe(n, t)
                    elif eng == "meteor":
                        payload = self._render_meteor(n, t)
                    elif eng == "twinkle":
                        payload = self._render_twinkle(n, t, frame_index)

                    elif eng == "fire_sync":
                        payload = self._render_solid(n) if sync_field is None else self._resample_field_to_device(sync_field, sync_samples, n)
                    elif eng == "fireworks_sync":
                        payload = self._render_solid(n) if sync_field is None else self._resample_field_to_device(sync_field, sync_samples, n)

                    elif eng == "fire_random":
                        heat = self._d_fire_heat.get(trg.ip)
                        if heat is None:
                            heat = [0.0] * GLOBAL_SAMPLES
                            self._d_fire_heat[trg.ip] = heat
                        seed = (self._seed_base ^ hash(trg.ip) ^ (frame_index * 2654435761)) & 0xFFFFFFFF
                        self._update_fire_heat(heat, dt, seed)
                        field = self._render_fire_field(heat, GLOBAL_SAMPLES)
                        payload = self._resample_field_to_device(field, GLOBAL_SAMPLES, n)

                    elif eng == "fireworks_random":
                        parts = self._d_fireworks.get(trg.ip)
                        if parts is None:
                            parts = []
                            self._d_fireworks[trg.ip] = parts
                        seed = (self._seed_base ^ hash(trg.ip) ^ 0x55AA_7777 ^ (frame_index * 97531)) & 0xFFFFFFFF
                        parts = self._update_fireworks(parts, dt, seed)
                        self._d_fireworks[trg.ip] = parts
                        field = self._render_fireworks_field(parts, GLOBAL_SAMPLES)
                        payload = self._resample_field_to_device(field, GLOBAL_SAMPLES, n)

                    else:
                        payload = self._render_solid(n)

                    payload = _remap_pixels(payload, n, trg.reverse, trg.start_offset)

                    await self._store_and_broadcast_preview(trg.ip, payload)
                    _send_ddp(self._sock, trg.ip, payload)

                except Exception:
                    pass

            frame_index += 1

            elapsed = time.perf_counter() - tick
            sleep_for = frame_time - elapsed
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
            else:
                await asyncio.sleep(0)


class DDPHubManager:
    """
    Manager of streams.

    ✅ Added preview subscription API:
      - subscribe_preview(stream_id, ip) -> (queue, unsubscribe_fn)
      - get_last_preview(stream_id, ip) -> last raw samples
    """
    def __init__(self):
        self.streams: Dict[str, DDPGroupStream] = {}

    def has_stream(self, stream_id: str) -> bool:
        return stream_id in self.streams

    def get_stream(self, stream_id: str) -> Optional[DDPGroupStream]:
        return self.streams.get(stream_id)

    def _stop_conflicting_streams(self, new_group_id: str, new_targets: List[Target]):
        new_ips = {t.ip for t in new_targets if t and t.ip}
        if not new_ips:
            return

        # stop any stream (other than this one) that targets any of the same IPs
        for gid, s in list(self.streams.items()):
            if gid == new_group_id:
                continue
            old_ips = {t.ip for t in (s.targets or []) if t and t.ip}
            if old_ips & new_ips:
                s.stop()
                self.streams.pop(gid, None)

    def ensure_stream(self, group_id: str, targets: List[Target], fps: int = 30) -> DDPGroupStream:
        fps_cap = max(10, min(int(fps), 60))

        # streams exclusive per device IP
        self._stop_conflicting_streams(group_id, targets)

        if group_id in self.streams:
            s = self.streams[group_id]
            s.set_fps_cap(fps_cap)

            old = [(t.ip, t.led_count, t.reverse, t.start_offset) for t in (s.targets or [])]
            new = [(t.ip, t.led_count, t.reverse, t.start_offset) for t in (targets or [])]

            # ✅ PATCH: update targets WITHOUT restart
            if old != new:
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(s.set_targets(targets))
                except RuntimeError:
                    s.targets = targets

            if not s.is_running() and (targets or []):
                s.start()

            return s

        s = DDPGroupStream(group_id, targets, fps=fps_cap)
        self.streams[group_id] = s
        s.start()
        return s

    def stop_stream(self, group_id: str):
        s = self.streams.pop(group_id, None)
        if s:
            s.stop()

    def stop_all(self):
        for gid in list(self.streams.keys()):
            self.stop_stream(gid)

    # ---------------- PREVIEW HELPERS ----------------

    async def get_last_preview(self, stream_id: str, ip: str) -> Optional[List[Tuple[int, int, int]]]:
        s = self.get_stream(stream_id)
        if not s:
            return None
        return await s.get_preview_raw(ip)

    async def subscribe_preview(self, stream_id: str, ip: str, max_queue: int = 2) -> Tuple[asyncio.Queue, callable]:
        """
        Returns:
          (queue, unsubscribe_fn)

        queue items: List[(r,g,b)] length PREVIEW_SAMPLES
        """
        s = self.get_stream(stream_id)
        if not s:
            raise RuntimeError("Stream not running")

        q: asyncio.Queue = asyncio.Queue(maxsize=max_queue)
        await s.register_preview_queue(ip, q)

        async def _unsubscribe():
            try:
                await s.unregister_preview_queue(ip, q)
            except Exception:
                pass

        return q, _unsubscribe