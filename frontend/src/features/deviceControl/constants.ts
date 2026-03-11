// src/features/deviceControl/constants.ts

export const PRESET_COLORS = [
  {
    name: "Red",
    color: "#FF0000",
    rgb: [255, 0, 0] as [number, number, number],
  },
  {
    name: "Green",
    color: "#00FF00",
    rgb: [0, 255, 0] as [number, number, number],
  },
  {
    name: "Blue",
    color: "#0000FF",
    rgb: [0, 0, 255] as [number, number, number],
  },
  {
    name: "Yellow",
    color: "#FFFF00",
    rgb: [255, 255, 0] as [number, number, number],
  },
  {
    name: "Purple",
    color: "#FF00FF",
    rgb: [255, 0, 255] as [number, number, number],
  },
  {
    name: "Cyan",
    color: "#00FFFF",
    rgb: [0, 255, 255] as [number, number, number],
  },
  {
    name: "Orange",
    color: "#FF8800",
    rgb: [255, 136, 0] as [number, number, number],
  },
  {
    name: "Pink",
    color: "#FF1493",
    rgb: [255, 20, 147] as [number, number, number],
  },
  {
    name: "White",
    color: "#FFFFFF",
    rgb: [255, 255, 255] as [number, number, number],
  },
] as const;

export const PRESET_COLOR_MAPPING: Record<
  string,
  (typeof PRESET_COLORS)[number]
> = {
  // solid
  solid_core:         PRESET_COLORS[8],  // warm white
  // ambient
  breathe_warm:       PRESET_COLORS[6],  // orange
  breathe_cold:       PRESET_COLORS[5],  // cyan
  // algorithmic (hub ignores col, but show representative color in UI)
  rainbow_core:       PRESET_COLORS[4],  // purple (representative)
  fire_main:          PRESET_COLORS[6],  // orange
  // motion
  blink_core:         PRESET_COLORS[8],  // white
  colorwipe_blue:     PRESET_COLORS[2],  // blue
  colorwipe_sunset:   PRESET_COLORS[6],  // orange
  twinkle_stars:      PRESET_COLORS[2],  // blue
  twinkle_gold:       PRESET_COLORS[6],  // orange/gold
  comet_ice:          PRESET_COLORS[5],  // cyan
  meteor_white:       PRESET_COLORS[8],  // white
  meteor_pink:        PRESET_COLORS[7],  // pink
  // new effects
  scanner_purple:     PRESET_COLORS[4],  // purple
  running_cyan:       PRESET_COLORS[5],  // cyan
  fireworks_multi:    PRESET_COLORS[3],  // yellow (representative, color_locked)
  fireworks1d:        PRESET_COLORS[3],  // yellow (representative, color_locked)
  // 1:1 FX.cpp ports
  colorloop:          PRESET_COLORS[4],  // purple (representative, color_locked)
  fade_warm:          PRESET_COLORS[6],  // orange
  strobe_white:       PRESET_COLORS[8],  // white
  wipe_random:        PRESET_COLORS[4],  // purple (representative, color_locked)
  dissolve:           PRESET_COLORS[2],  // blue
  chase_rainbow:      PRESET_COLORS[4],  // purple (representative, color_locked)
  sparkle:            PRESET_COLORS[8],  // white
  bouncing_balls:     PRESET_COLORS[4],  // purple (representative, color_locked)
  lightning:          PRESET_COLORS[8],  // white (color_locked)
  ripple:             PRESET_COLORS[2],  // blue
  // new presets
  wipe_rev:           PRESET_COLORS[2],  // blue
  strobe_rainbow:     PRESET_COLORS[4],  // purple (color_locked)
  twinkle_random:     PRESET_COLORS[4],  // purple (color_locked)
  twinkle_fade:       PRESET_COLORS[2],  // blue
  colorful:           PRESET_COLORS[4],  // purple (color_locked)
  juggle:             PRESET_COLORS[4],  // purple (color_locked)
  sparkle_dark:       PRESET_COLORS[8],  // white
  rain:               PRESET_COLORS[2],  // blue
  scanner_dual:       PRESET_COLORS[5],  // cyan
  halloween_eyes:     PRESET_COLORS[0],  // red
  fire_flicker:       PRESET_COLORS[6],  // orange
  gradient:           PRESET_COLORS[4],  // purple (color_locked)
  meteor_smooth:      PRESET_COLORS[5],  // cyan
  colorwaves:         PRESET_COLORS[4],  // purple (color_locked)
  bpm:                PRESET_COLORS[4],  // purple (color_locked)
  fill_noise:         PRESET_COLORS[2],  // blue (color_locked)
  sunrise:            PRESET_COLORS[6],  // orange (color_locked)
  twinklefox:         PRESET_COLORS[4],  // purple (color_locked)
  twinklefox_party:   PRESET_COLORS[3],  // yellow (color_locked)
  heartbeat:          PRESET_COLORS[0],  // red
  candle:             PRESET_COLORS[6],  // orange
  starburst:          PRESET_COLORS[3],  // yellow (color_locked)
  pacifica:           PRESET_COLORS[2],  // blue (color_locked)
};

function _c(n: any) {
  return Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
}

/** Returns the preset's built-in default RGB, ignoring the user's currently selected color. */
export function getPresetDefaultRgb(
  preset: { palette_default?: number[][]; color?: number[]; id?: string },
): [number, number, number] {
  // 1. palette_default[0] from backend (highest priority)
  const pd = preset.palette_default?.[0];
  if (Array.isArray(pd) && pd.length >= 3) return [_c(pd[0]), _c(pd[1]), _c(pd[2])];
  // 2. color field from backend preset
  const col = preset.color;
  if (Array.isArray(col) && col.length >= 3) return [_c(col[0]), _c(col[1]), _c(col[2])];
  // 3. static frontend mapping
  const mapped = PRESET_COLOR_MAPPING[preset.id ?? ""];
  if (mapped) return [mapped.rgb[0], mapped.rgb[1], mapped.rgb[2]];
  // 4. neutral white fallback
  return [255, 255, 255];
}

export const NIGHT_MODE_DEFAULTS = {
  temp: 70,
  brightness: 25,
  baseRgb: [255, 140, 20] as [number, number, number],
};

// src/features/deviceControl/constants.ts

// DEV backend URL (z .env)
export const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.1.83:8002";

// final API url
export const API_URL = API_BASE ? `${API_BASE}/api` : "";

// debug (zobaczysz w Metro czy env się wczytał)
console.log("ENV BACKEND =", process.env.EXPO_PUBLIC_BACKEND_URL);
console.log("API_URL =", API_URL);
